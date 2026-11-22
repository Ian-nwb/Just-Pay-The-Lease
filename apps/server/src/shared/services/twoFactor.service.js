// Two-factor sign-in.
//   method 'totp'  : authenticator app (required method for superadmin)
//   method 'email' : 6-digit code emailed at each sign-in (landlords and tenants)
// Recovery codes work with either method.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { sendEmail } from './email.service.js';
import { generateSecret, otpauthUrl, verifyTotp } from '../utils/totp.js';

export class TwoFactorError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const CHALLENGE_TTL = '10m';
const RECOVERY_CODE_COUNT = 8;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_RESEND_MS = 30 * 1000;
const EMAIL_MAX_ATTEMPTS = 5;
const EMAIL_ROLES = ['landlord', 'tenant'];

// Derived keys: neither equals JWT_SECRET, so a challenge token can never pass requireAuth.
function deriveKey(purpose) {
  const base = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!base) throw new TwoFactorError('Two-factor authentication is not configured on this server.', 503);
  return crypto.createHmac('sha256', base).update(`jptl-2fa:${purpose}`).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('secret-encryption'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('secret-encryption'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const normalizeCode = (code) => String(code || '').replace(/[\s-]/g, '').toUpperCase();
const hashRecoveryCode = (code) => crypto.createHash('sha256').update(normalizeCode(code)).digest('hex');
const hashEmailCode = (userId, code) => crypto.createHmac('sha256', deriveKey('email-code')).update(`${userId}:${normalizeCode(code)}`).digest('hex');

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

const SECRET_FIELDS = '+password +twoFactor.secretEnc +twoFactor.pendingSecretEnc +twoFactor.lastUsedStep +twoFactor.recoveryCodeHashes +twoFactor.emailCodeHash +twoFactor.emailCodeExpiresAt +twoFactor.emailCodeAttempts +twoFactor.emailCodeSentAt';
const withSecrets = (userId) => User.findById(userId).select(SECRET_FIELDS);

function clearEmailCode(user) {
  user.twoFactor.emailCodeHash = null;
  user.twoFactor.emailCodeExpiresAt = null;
  user.twoFactor.emailCodeAttempts = 0;
}

/** Email a fresh 6-digit code. Throttled to one every 30 seconds. */
async function sendEmailCode(user, purpose = 'sign in') {
  const lastSent = user.twoFactor.emailCodeSentAt ? new Date(user.twoFactor.emailCodeSentAt).getTime() : 0;
  if (Date.now() - lastSent < EMAIL_RESEND_MS) throw new TwoFactorError('A code was just sent. Wait a few seconds before asking for another.', 429);
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new TwoFactorError('Email delivery is not configured on this server.', 503);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  user.twoFactor.emailCodeHash = hashEmailCode(user._id, code);
  user.twoFactor.emailCodeExpiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
  user.twoFactor.emailCodeAttempts = 0;
  user.twoFactor.emailCodeSentAt = new Date();
  await user.save();
  await sendEmail({
    to: user.email,
    subject: `Your JPTL verification code: ${code}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px"><p>Use this code to ${purpose} to JPTL:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p style="color:#64748b;font-size:12px">It expires in 10 minutes. If you didn't try to ${purpose}, change your password.</p></div>`,
  });
}

function checkEmailCode(user, code) {
  const tf = user.twoFactor;
  if (!tf.emailCodeHash || !tf.emailCodeExpiresAt || new Date(tf.emailCodeExpiresAt) < new Date()) return 'expired';
  if (Number(tf.emailCodeAttempts || 0) >= EMAIL_MAX_ATTEMPTS) return 'locked';
  const ok = crypto.timingSafeEqual(Buffer.from(tf.emailCodeHash, 'hex'), Buffer.from(hashEmailCode(user._id, code), 'hex'));
  if (!ok) tf.emailCodeAttempts = Number(tf.emailCodeAttempts || 0) + 1;
  return ok ? 'ok' : 'wrong';
}

export async function getStatus(userId) {
  const user = await User.findById(userId).select('twoFactor role').lean();
  return {
    enabled: Boolean(user?.twoFactor?.enabled),
    method: user?.twoFactor?.enabled ? (user.twoFactor.method || 'totp') : null,
    enabledAt: user?.twoFactor?.enabledAt || null,
    emailAvailable: EMAIL_ROLES.includes(user?.role),
  };
}

/** Authenticator setup, step 1: pending secret for the app. */
export async function beginSetup(userId) {
  const user = await withSecrets(userId);
  if (!user) throw new TwoFactorError('User not found', 404);
  if (user.twoFactor?.enabled) throw new TwoFactorError('Two-factor authentication is already on.', 409);
  const secret = generateSecret();
  user.twoFactor.pendingSecretEnc = encrypt(secret);
  await user.save();
  return { secret, otpauthUrl: otpauthUrl({ secret, accountName: user.email }) };
}

function finishEnable(user, method) {
  const codes = newRecoveryCodes();
  user.twoFactor.enabled = true;
  user.twoFactor.method = method;
  user.twoFactor.recoveryCodeHashes = codes.map(hashRecoveryCode);
  user.twoFactor.enabledAt = new Date();
  return codes;
}

/** Authenticator setup, step 2: confirm a code and turn 2FA on. */
export async function confirmSetup(userId, code) {
  const user = await withSecrets(userId);
  if (!user?.twoFactor?.pendingSecretEnc) throw new TwoFactorError('Start two-factor setup first.', 409);
  const secret = decrypt(user.twoFactor.pendingSecretEnc);
  const step = verifyTotp(secret, code);
  if (step == null) throw new TwoFactorError('That code is not valid. Check the time on your phone and try again.');
  user.twoFactor.secretEnc = encrypt(secret);
  user.twoFactor.pendingSecretEnc = null;
  user.twoFactor.lastUsedStep = step;
  const codes = finishEnable(user, 'totp');
  await user.save();
  return { enabled: true, method: 'totp', recoveryCodes: codes };
}

/** Email setup, step 1: send a code to the account email. */
export async function beginEmailSetup(userId) {
  const user = await withSecrets(userId);
  if (!user) throw new TwoFactorError('User not found', 404);
  if (!EMAIL_ROLES.includes(user.role)) throw new TwoFactorError('This account must use an authenticator app.', 403);
  if (user.twoFactor?.enabled) throw new TwoFactorError('Two-factor authentication is already on.', 409);
  await sendEmailCode(user, 'turn on two-factor sign-in');
  return { sentTo: user.email };
}

/** Email setup, step 2: confirm the emailed code. */
export async function confirmEmailSetup(userId, code) {
  const user = await withSecrets(userId);
  if (!user || !EMAIL_ROLES.includes(user.role)) throw new TwoFactorError('This account must use an authenticator app.', 403);
  if (user.twoFactor?.enabled) throw new TwoFactorError('Two-factor authentication is already on.', 409);
  const result = checkEmailCode(user, code);
  if (result !== 'ok') {
    await user.save();
    throw new TwoFactorError(result === 'expired' ? 'That code expired. Send a new one.' : result === 'locked' ? 'Too many tries. Send a new code.' : 'That code is not valid.');
  }
  clearEmailCode(user);
  const codes = finishEnable(user, 'email');
  await user.save();
  return { enabled: true, method: 'email', recoveryCodes: codes };
}

/** Check a code for the user's method (or a recovery code). Blocks replay. */
async function consumeCode(user, code) {
  if (user.twoFactor.method === 'email') {
    const result = checkEmailCode(user, code);
    if (result === 'ok') {
      clearEmailCode(user);
      await user.save();
      return true;
    }
  } else if (user.twoFactor.secretEnc) {
    const step = verifyTotp(decrypt(user.twoFactor.secretEnc), code);
    if (step != null) {
      if (step <= Number(user.twoFactor.lastUsedStep || 0)) return false;
      user.twoFactor.lastUsedStep = step;
      await user.save();
      return true;
    }
  }
  const index = (user.twoFactor.recoveryCodeHashes || []).indexOf(hashRecoveryCode(code));
  if (index === -1) {
    await user.save(); // persist failed email-code attempt count
    return false;
  }
  user.twoFactor.recoveryCodeHashes.splice(index, 1);
  await user.save();
  return true;
}

/** Email method: send a code so the signed-in user can turn 2FA off. */
export async function sendDisableCode(userId) {
  const user = await withSecrets(userId);
  if (!user?.twoFactor?.enabled || user.twoFactor.method !== 'email') throw new TwoFactorError('Email codes are not your two-factor method.', 409);
  await sendEmailCode(user, 'turn off two-factor sign-in');
  return { sentTo: user.email };
}

export async function disable(userId, { password, code } = {}) {
  const user = await withSecrets(userId);
  if (!user?.twoFactor?.enabled) throw new TwoFactorError('Two-factor authentication is not on.', 409);
  if (!password || !(await user.comparePassword(password))) throw new TwoFactorError('Your password is incorrect.', 401);
  if (!(await consumeCode(user, code))) throw new TwoFactorError('That code is not valid.', 401);
  user.twoFactor = { enabled: false, method: 'totp', secretEnc: null, pendingSecretEnc: null, lastUsedStep: 0, recoveryCodeHashes: [], enabledAt: null, emailCodeHash: null, emailCodeExpiresAt: null, emailCodeAttempts: 0, emailCodeSentAt: null };
  await user.save();
  return { enabled: false };
}

/**
 * Called after a correct password when 2FA is on. For the email method it
 * sends the code. Returns a short-lived challenge token (not a session).
 */
export async function issueChallenge(user, extra = {}) {
  const method = user.twoFactor?.method || 'totp';
  if (method === 'email') {
    const full = await withSecrets(user._id);
    try {
      await sendEmailCode(full);
    } catch (error) {
      if (error.statusCode !== 429) throw error; // a recent code is still valid
    }
  }
  const challengeToken = jwt.sign({ sub: String(user._id), purpose: '2fa-login', ...extra }, deriveKey('challenge-token'), { expiresIn: CHALLENGE_TTL });
  return { challengeToken, method };
}

function readChallenge(challengeToken) {
  try {
    const payload = jwt.verify(String(challengeToken || ''), deriveKey('challenge-token'));
    if (payload.purpose !== '2fa-login') throw new Error('bad purpose');
    return payload;
  } catch {
    throw new TwoFactorError('Your sign-in attempt expired. Enter your password again.', 401);
  }
}

/** Re-send the login email code. */
export async function resendChallengeCode(challengeToken) {
  const payload = readChallenge(challengeToken);
  const user = await withSecrets(payload.sub);
  if (!user || user.status !== 'active' || !user.twoFactor?.enabled || user.twoFactor.method !== 'email') throw new TwoFactorError('Invalid sign-in attempt.', 401);
  await sendEmailCode(user);
  return { sent: true };
}

/** Verify the challenge and the code; returns the user document on success. */
export async function completeChallenge(challengeToken, code, { requireRole } = {}) {
  const payload = readChallenge(challengeToken);
  const user = await withSecrets(payload.sub);
  if (!user || user.status !== 'active' || !user.twoFactor?.enabled) throw new TwoFactorError('Invalid sign-in attempt.', 401);
  if (requireRole && user.role !== requireRole) throw new TwoFactorError('Invalid sign-in attempt.', 401);
  if (!requireRole && user.role === 'superadmin') throw new TwoFactorError('Invalid sign-in attempt.', 401);
  if (!(await consumeCode(user, code))) throw new TwoFactorError('That code is not valid.', 401);
  return { user, payload };
}
