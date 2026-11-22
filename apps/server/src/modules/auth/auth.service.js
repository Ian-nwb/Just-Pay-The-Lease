import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../../shared/models/user.model.js';
import { recordLoginSession } from '../../shared/services/sessionMonitor.service.js';
import { getMaintenanceState } from '../../shared/services/systemState.service.js';
import { sendPasswordResetEmail } from '../../shared/services/email.service.js';
import { uploadAvatarToCloudinary } from '../../shared/config/cloudinary.js';
import { issueChallenge, completeChallenge, resendChallengeCode, TwoFactorError } from '../../shared/services/twoFactor.service.js';

async function resendTwoFactorCode({ challengeToken }) {
  try {
    return await resendChallengeCode(challengeToken);
  } catch (error) {
    if (error instanceof TwoFactorError) throw new AuthError(error.message, error.statusCode);
    throw error;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HAS_NUMBER = /\d/;

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function validateSignup({ firstName, lastName, email, phone, password }) {
  const errors = [];

  if (!firstName?.trim()) errors.push('firstName is required');
  if (!lastName?.trim()) errors.push('lastName is required');

  if (!email?.trim()) {
    errors.push('email is required');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push('email is invalid');
  }

  if (phone && phone.trim().length > 30) {
    errors.push('phone must be under 30 characters');
  }

  if (!password) {
    errors.push('password is required');
  } else {
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (!PASSWORD_HAS_NUMBER.test(password)) {
      errors.push('password must contain at least one number');
    }
  }

  if (errors.length) throw new AuthError(errors.join(', '), 400);
}

function validatePasswordStrength(password) {
  const errors = [];
  if (!password) {
    errors.push('newPassword is required');
  } else {
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (!PASSWORD_HAS_NUMBER.test(password)) {
      errors.push('password must contain at least one number');
    }
  }
  if (errors.length) throw new AuthError(errors.join(', '), 400);
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

function sanitizeUser(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone || '',
    company: user.company || '',
    officePhone: user.officePhone || '',
    timezone: user.timezone || 'Asia/Manila',
    preferences: user.preferences || {},
    emergencyContact: user.role === 'tenant' ? {
      name: user.emergencyContact?.name || '',
      relationship: user.emergencyContact?.relationship || '',
      phone: user.emergencyContact?.phone || '',
    } : undefined,
    role: user.role,
    landlordId: user.role === 'staff' ? user.landlord : undefined,
    staffType: user.role === 'staff' ? (user.staffType || 'property_manager') : undefined,
    propertyAssignments: user.role === 'staff' ? (user.propertyAssignments || []) : undefined,
    avatarUrl: user.avatarUrl || '',
    createdAt: user.createdAt,
  };
}

function normalizeUserPreferences(role, current = {}, incoming = {}) {
  const next = { ...(current || {}) };
  const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (role === 'landlord') {
    if (incoming.currency === 'PHP') next.currency = 'PHP';
    if (typeof incoming.timezone === 'string') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: incoming.timezone });
        next.timezone = incoming.timezone;
      } catch {
        throw new AuthError('Choose a valid timezone.', 400);
      }
    }
    if (isPlainObject(incoming.alerts)) {
      next.alerts = Object.fromEntries(['newTicket', 'overduePayment', 'leaseExpiration', 'dailySummaryEmail']
        .filter((key) => typeof incoming.alerts[key] === 'boolean')
        .map((key) => [key, incoming.alerts[key]]));
    }
  }
  if (role === 'tenant') {
    if (isPlainObject(incoming.notifications)) {
      const categories = ['maintenance', 'payments', 'lease', 'announcements'];
      next.notifications = Object.fromEntries(categories.map((category) => [category, {
        push: typeof incoming.notifications[category]?.push === 'boolean' ? incoming.notifications[category].push : true,
        email: typeof incoming.notifications[category]?.email === 'boolean' ? incoming.notifications[category].email : true,
      }]));
    }
    if (isPlainObject(incoming.emailDigest)) {
      if (typeof incoming.emailDigest.enabled !== 'boolean') throw new AuthError('Email digest setting must be on or off.', 400);
      next.emailDigest = { enabled: incoming.emailDigest.enabled };
    }
    if (isPlainObject(incoming.quietHours)) {
      const { enabled, start, end } = incoming.quietHours;
      const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (typeof enabled !== 'boolean' || !validTime(start) || !validTime(end)) throw new AuthError('Quiet hours must use valid 24-hour times.', 400);
      next.quietHours = { enabled, start, end };
    }
    if (isPlainObject(incoming.privacy)) {
      next.privacy = Object.fromEntries(['showPhoneToLandlord', 'showEmergencyContactToLandlord', 'showVehiclesToLandlord', 'vendorDataSharing', 'anonymousAnnouncements']
        .filter((key) => typeof incoming.privacy[key] === 'boolean')
        .map((key) => [key, incoming.privacy[key]]));
    }
    if (isPlainObject(incoming.maintenance)) {
      const accessPreference = incoming.maintenance.accessPreference;
      const accessNote = typeof incoming.maintenance.accessNote === 'string' ? incoming.maintenance.accessNote.trim() : undefined;
      if (accessPreference !== undefined && !['ok_if_not_home', 'must_be_present', 'custom'].includes(accessPreference)) {
        throw new AuthError('Choose a valid maintenance access preference.', 400);
      }
      if (accessNote !== undefined && accessNote.length > 500) throw new AuthError('Maintenance access notes must be 500 characters or fewer.', 400);
      next.maintenance = {
        ...(accessPreference ? { accessPreference } : {}),
        ...(accessNote !== undefined ? { accessNote } : {}),
      };
    }
  }
  return next;
}

async function signupLandlord({ firstName, middleName, lastName, email, phone, password, timezone = 'Asia/Manila' }) {
  const state = await getMaintenanceState();
  if (state.enabled) {
    throw new AuthError(state.message || 'Platform is currently undergoing scheduled maintenance. New registrations are temporarily paused.', 503);
  }

  validateSignup({ firstName, lastName, email, phone, password });
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new AuthError('Choose a valid property timezone', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AuthError('Email is already registered', 409);
  }

  // Pass raw password; userSchema.pre('save') handles hashing
  const user = await User.create({
    firstName: firstName.trim(),
    middleName: middleName?.trim() || '',
    lastName: lastName.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || '',
    timezone,
    password: password,
    role: 'landlord',
  });

  return sanitizeUser(user);
}

async function login({ email, password, portal, ip = '', userAgent = '' }) {
  if (!email?.trim() || !password) {
    throw new AuthError('Email and password are required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Run User lookup and maintenance state check concurrently
  const [user, state] = await Promise.all([
    User.findOne({ email: normalizedEmail }).select('+password'),
    getMaintenanceState(),
  ]);

  if (!user) {
    throw new AuthError('Invalid email or password', 401);
  }

  if (user.status !== 'active') {
    throw new AuthError('Invalid email or password', 401);
  }

  // Check maintenance mode: non-superadmin users are blocked when active
  if (state.enabled && user.role !== 'superadmin') {
    throw new AuthError(state.message || 'Platform is currently undergoing scheduled maintenance. Non-administrative logins are temporarily paused.', 503);
  }

  // Use model method
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AuthError('Invalid email or password', 401);
  }

  if (portal && !['landlord', 'tenant'].includes(portal)) {
    throw new AuthError('Invalid sign-in portal.', 400);
  }
  if (portal === 'landlord' && user.role === 'tenant') {
    throw new AuthError('Invalid email or password', 401);
  }
  if (portal === 'tenant' && user.role !== 'tenant') {
    throw new AuthError('Invalid email or password', 401);
  }

  // Password is correct; with 2FA on, the session is issued only after the code check.
  if (user.twoFactor?.enabled) {
    const { challengeToken, method } = await issueChallenge(user, { portal: portal || null });
    return { twoFactorRequired: true, challengeToken, method };
  }

  return issueSession(user, { ip, userAgent });
}

function issueSession(user, { ip = '', userAgent = '' } = {}) {
  const token = signToken({ id: user._id.toString(), role: user.role, ...(user.role === 'staff' ? { landlord: user.landlord?.toString() } : {}) });

  // Record login session asynchronously (non-blocking for ultra-fast response)
  recordLoginSession({
    userId: user._id,
    email: user.email,
    role: user.role,
    ip,
    userAgent,
  }).catch((err) => console.error('Failed to log login session:', err));

  return { user: sanitizeUser(user), token };
}

/** Second step of sign-in when two-factor authentication is on. */
async function completeTwoFactorLogin({ challengeToken, code, ip = '', userAgent = '', superadmin = false }) {
  try {
    const { user } = await completeChallenge(challengeToken, code, superadmin ? { requireRole: 'superadmin' } : {});
    const state = await getMaintenanceState();
    if (state.enabled && user.role !== 'superadmin') throw new AuthError(state.message || 'Platform is currently undergoing scheduled maintenance.', 503);
    return issueSession(user, { ip, userAgent });
  } catch (error) {
    if (error instanceof TwoFactorError) throw new AuthError(error.message, error.statusCode);
    throw error;
  }
}

async function loginSuperadmin({ email, password, ip = '', userAgent = '' }) {
  if (!email?.trim() || !password) {
    throw new AuthError('Email and password are required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [user, isMatchPromise] = await Promise.all([
    User.findOne({ email: normalizedEmail }).select('+password'),
    Promise.resolve(),
  ]);

  if (!user) {
    throw new AuthError('Invalid email or password', 401);
  }
  if (user.role !== 'superadmin') {
    throw new AuthError('Invalid email or password', 401);
  }
  if (user.status !== 'active') {
    throw new AuthError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AuthError('Invalid email or password', 401);
  }

  if (user.twoFactor?.enabled) {
    const { challengeToken, method } = await issueChallenge(user, { portal: 'superadmin' });
    return { twoFactorRequired: true, challengeToken, method };
  }

  const token = signToken({ id: user._id.toString(), role: user.role });

  // Record login session asynchronously (non-blocking)
  recordLoginSession({
    userId: user._id,
    email: user.email,
    role: user.role,
    ip,
    userAgent,
  }).catch((err) => console.error('Failed to log superadmin session:', err));

  return { user: sanitizeUser(user), token };
}

async function changePasswordService(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw new AuthError('Both currentPassword and newPassword are required', 400);
  }

  validatePasswordStrength(newPassword);

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AuthError('User not found', 404);
  }

  // 1. Verify current password using model instance method
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AuthError('Current password is incorrect', 401);
  }

  // 2. Prevent re-using the same password
  const isSame = await user.comparePassword(newPassword);
  if (isSame) {
    throw new AuthError('New password must be different from current password', 400);
  }

  // 3. Assign plain text; userSchema.pre('save') will hash it automatically on save()
  user.password = newPassword;
  await user.save();
  return { message: 'Password updated successfully' };
}

async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) return null;
  return sanitizeUser(user);
}

/**
 * Forgot Password — generate a reset token and send email.
 * Always responds with a generic 200 to prevent email enumeration.
 */
async function forgotPassword({ email, origin }) {
  if (!email?.trim()) throw new AuthError('Email is required', 400);

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    '+passwordResetToken +passwordResetExpires'
  );

  // Silently succeed even if user not found (prevent enumeration)
  if (!user) return;

  const rawToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${origin}/reset-password?token=${rawToken}`;

  await sendPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    resetUrl,
  });
}

/**
 * Reset Password — consume the reset token and set a new password.
 */
async function resetPassword({ token, newPassword }) {
  if (!token) throw new AuthError('Reset token is required', 400);

  validatePasswordStrength(newPassword);

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+password +passwordResetToken +passwordResetExpires');

  if (!user) {
    throw new AuthError('Reset token is invalid or has expired', 400);
  }

  // Prevent reusing the same password
  const isSame = await user.comparePassword(newPassword);
  if (isSame) throw new AuthError('New password must be different from current password', 400);

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return { message: 'Password has been reset successfully. You may now sign in.' };
}

/**
 * Update Profile — updates basic profile info and optionally password
 */
async function updateProfileService(userId, { firstName, middleName, lastName, name, phone, company, officePhone, currentPassword, newPassword, preferences, emergencyContact }) {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AuthError('User not found', 404);
  }

  // Parse combined name if provided without explicit firstName/lastName
  if (name && (!firstName || !lastName)) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      user.firstName = parts[0];
    } else if (parts.length === 2) {
      user.firstName = parts[0];
      user.lastName = parts[1];
    } else if (parts.length >= 3) {
      user.firstName = parts[0];
      user.middleName = parts.slice(1, -1).join(' ');
      user.lastName = parts[parts.length - 1];
    }
  }

  if (firstName !== undefined && firstName.trim()) user.firstName = firstName.trim();
  if (middleName !== undefined) user.middleName = middleName.trim();
  if (lastName !== undefined && lastName.trim()) user.lastName = lastName.trim();
if (phone !== undefined && phone !== null) {
  user.phone = phone.trim();
}
  if (user.role === 'landlord' && company !== undefined) user.company = String(company).trim().slice(0, 120);
  if (user.role === 'landlord' && officePhone !== undefined) user.officePhone = String(officePhone).trim().slice(0, 30);

  if (user.role === 'tenant' && emergencyContact !== undefined) {
    if (!emergencyContact || typeof emergencyContact !== 'object' || Array.isArray(emergencyContact)) throw new AuthError('Emergency contact must include a name and phone number.', 400);
    const contact = {
      name: String(emergencyContact.name || '').trim(),
      relationship: String(emergencyContact.relationship || '').trim(),
      phone: String(emergencyContact.phone || '').trim(),
    };
    const isEmpty = !contact.name && !contact.relationship && !contact.phone;
    if (!isEmpty) {
      if (!contact.name || contact.name.length > 120) throw new AuthError('Emergency contact name must be 1–120 characters.', 400);
      if (contact.relationship.length > 60) throw new AuthError('Relationship must be 60 characters or fewer.', 400);
      if (!/^\+?[0-9 ()-]{7,30}$/.test(contact.phone)) throw new AuthError('Enter a valid emergency contact phone number.', 400);
    }
    user.emergencyContact = contact;
  }

  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    user.preferences = normalizeUserPreferences(user.role, user.preferences, preferences);
    if (user.role === 'landlord' && user.preferences.timezone) user.timezone = user.preferences.timezone;
  }

  // If password update was included in profile patch
  if (newPassword) {
    if (!currentPassword) {
      throw new AuthError('Current password is required to set a new password', 400);
    }
    validatePasswordStrength(newPassword);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AuthError('Current password is incorrect', 401);
    }
    user.password = newPassword;
  }

  await user.save();
  return sanitizeUser(user);
}

/**
 * Upload and update user avatar photo via Cloudinary
 */
async function updateAvatarService(userId, fileBuffer, originalName) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AuthError('User not found', 404);
  }

  const result = await uploadAvatarToCloudinary(fileBuffer, originalName, user._id.toString());
  user.avatarUrl = result.secure_url;
  await user.save();

  return {
    avatarUrl: user.avatarUrl,
    user: sanitizeUser(user),
  };
}

/**
 * Remove user avatar photo
 */
async function removeAvatarService(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AuthError('User not found', 404);
  }

  user.avatarUrl = '';
  await user.save();

  return {
    avatarUrl: '',
    user: sanitizeUser(user),
  };
}

export { signupLandlord, login, loginSuperadmin, completeTwoFactorLogin, resendTwoFactorCode, getUserById, changePasswordService, forgotPassword, resetPassword, updateProfileService, updateAvatarService, removeAvatarService, AuthError };
