import * as authService from './auth.service.js';
import { recordLogoutSession } from '../../shared/services/sessionMonitor.service.js';
import jwt from 'jsonwebtoken';
import * as twoFactor from '../../shared/services/twoFactor.service.js';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day, match JWT_EXPIRES_IN

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  };
}

function getClientDetails(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  return { ip, userAgent };
}

async function signupLandlord(req, res) {
  try {
    const user = await authService.signupLandlord(req.body);
    return res.status(201).json({ success: true, user });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function login(req, res) {
  try {
    const { ip, userAgent } = getClientDetails(req);
    const result = await authService.login({ ...req.body, ip, userAgent });
    if (result.twoFactorRequired) {
      return res.status(200).json({ success: true, twoFactorRequired: true, challengeToken: result.challengeToken, method: result.method });
    }
    const { user, token } = result;
    // Clear global cookie so multi-tab sessionStorage isolation works cleanly
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(200).json({ success: true, user, role: user.role, token });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function loginSuperadmin(req, res) {
  try {
    const { ip, userAgent } = getClientDetails(req);
    const result = await authService.loginSuperadmin({ ...req.body, ip, userAgent });
    if (result.twoFactorRequired) {
      return res.status(200).json({ success: true, twoFactorRequired: true, challengeToken: result.challengeToken, method: result.method });
    }
    const { user, token } = result;
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(200).json({ success: true, user, role: user.role, token });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function getMe(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await authService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function logout(req, res) {
  try {
    let userId = req.user?.id || req.user?._id;
    if (!userId) {
      // Attempt to inspect Bearer token if passed in header or cookie
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : req.cookies?.token;
      if (token && process.env.JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
        } catch {
          // ignore error if token invalid
        }
      }
    }
    if (userId) {
      await recordLogoutSession(userId);
    }
  } catch (err) {
    console.error('Logout session log error:', err);
  }

  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.status(200).json({ success: true, message: 'Logged out' });
}

async function changePassword(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { currentPassword, newPassword } = req.body;

    const result = await authService.changePasswordService(
      userId,
      currentPassword,
      newPassword
    );

    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function forgotPassword(req, res) {
  try {
    const origin = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    await authService.forgotPassword({ email: req.body.email, origin });
    // Always return 200 regardless of whether the email exists (prevent enumeration)
    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword({ token, newPassword });
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const updatedUser = await authService.updateProfileService(userId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      data: { user: updatedUser },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function uploadAvatar(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select an image file to upload' });
    }

    // Explicit < 4MB check
    const MAX_SIZE = 4 * 1024 * 1024; // 4MB
    if (req.file.size > MAX_SIZE) {
      return res.status(400).json({ success: false, message: 'Image size exceeds maximum limit of 4MB' });
    }

    const result = await authService.updateAvatarService(
      userId,
      req.file.buffer,
      req.file.originalname
    );

    return res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatarUrl: result.avatarUrl,
      user: result.user,
      data: { avatarUrl: result.avatarUrl, user: result.user },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function removeAvatar(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const result = await authService.removeAvatarService(userId);
    return res.status(200).json({
      success: true,
      message: 'Avatar removed successfully',
      avatarUrl: '',
      user: result.user,
      data: { avatarUrl: '', user: result.user },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function verifyTwoFactorLogin(req, res) {
  try {
    const { ip, userAgent } = getClientDetails(req);
    const { user, token } = await authService.completeTwoFactorLogin({ challengeToken: req.body?.challengeToken, code: req.body?.code, ip, userAgent, superadmin: req.path.includes('superadmin') });
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(200).json({ success: true, user, role: user.role, token });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

const twoFactorHandler = (fn) => async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await fn(req.user.id || req.user._id, req.body || {}) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};
const twoFactorStatus = twoFactorHandler((id) => twoFactor.getStatus(id));
const twoFactorSetup = twoFactorHandler((id) => twoFactor.beginSetup(id));
const twoFactorEnable = twoFactorHandler((id, body) => twoFactor.confirmSetup(id, body.code));
const twoFactorDisable = twoFactorHandler((id, body) => twoFactor.disable(id, body));
const twoFactorEmailSetup = twoFactorHandler((id) => twoFactor.beginEmailSetup(id));
const twoFactorEmailEnable = twoFactorHandler((id, body) => twoFactor.confirmEmailSetup(id, body.code));
const twoFactorEmailDisableCode = twoFactorHandler((id) => twoFactor.sendDisableCode(id));
async function resendTwoFactorCode(req, res) {
  try { return res.status(200).json({ success: true, data: await authService.resendTwoFactorCode(req.body || {}) }); }
  catch (err) { return res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
}

export { verifyTwoFactorLogin, twoFactorStatus, twoFactorSetup, twoFactorEnable, twoFactorDisable, twoFactorEmailSetup, twoFactorEmailEnable, twoFactorEmailDisableCode, resendTwoFactorCode };
export { signupLandlord, login, loginSuperadmin, getMe, logout, changePassword, forgotPassword, resetPassword, updateProfile, uploadAvatar, removeAvatar };