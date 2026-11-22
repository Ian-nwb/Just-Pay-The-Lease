import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

async function requireAuth(req, res, next) {
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  // Prioritize per-tab Bearer token from header over global browser cookie or URL query token
  const token = bearerToken || req.cookies?.token || req.query?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  try {
    const accountId = decoded.id || decoded._id;
    const account = await User.findById(accountId).select('status role landlord staffType propertyAssignments').lean();
    if (!account || account.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Authentication failed.' });
    }
    // Use current database role and staff scope so deactivation and role changes
    // take effect for already-issued JWTs as well as future logins.
    decoded.role = account.role;
    if (account.role === 'staff') {
      if (!account.landlord) return res.status(401).json({ success: false, message: 'Staff account has no active landlord assignment.' });
      decoded.landlord = account.landlord.toString();
      decoded.staffType = account.staffType || 'property_manager';
      decoded.propertyAssignments = (account.propertyAssignments || []).map(String);
    }
  } catch (error) {
    return next(error);
  }
  req.user = decoded;
  return next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
  };
}

function requireStaffType(...allowedTypes) {
  return (req, res, next) => {
    if (req.user?.role !== 'staff' || !allowedTypes.includes(req.user.staffType || 'property_manager')) {
      return res.status(403).json({ success: false, message: 'This staff account does not have permission to access this feature.' });
    }
    return next();
  };
}

export { requireAuth, requireRole, requireStaffType };
