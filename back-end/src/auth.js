import admin from 'firebase-admin';
import pool from './db.js';

export function getAuthToken(req) {
  const authtoken = req.headers.authtoken;
  if (authtoken && typeof authtoken === 'string') return authtoken.trim();
  const auth = req.headers.authorization;
  if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function requireToken(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.auth = req.auth || {};
    req.auth.uid = decoded.uid;
    req.auth.email = decoded.email || null;
    next();
  } catch (err) {
    console.error('Firebase auth error:', err);
    return res.status(401).json({
      error: 'Invalid authentication token',
      details: err.message,
    });
  }
}

export async function loadDbUser(req, res, next) {
  if (!req.auth?.uid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const firebaseUid = req.auth.uid;
    const firebaseEmail = req.auth.email || null;

    let result = await pool.query(
      `SELECT id, role, is_active, username, full_name, email, firebase_uid
       FROM vendormap.users
       WHERE firebase_uid = $1
       LIMIT 1`,
      [firebaseUid]
    );

    if (result.rows.length === 0) {
      let baseUsername = firebaseEmail
        ? firebaseEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 30)
        : `user_${firebaseUid.substring(0, 8)}`;
      if (!baseUsername) baseUsername = `user_${firebaseUid.substring(0, 8)}`;

      let username = baseUsername;
      let attempts = 0;
      let created = false;

      while (!created && attempts < 10) {
        try {
          const created_result = await pool.query(
            `INSERT INTO vendormap.users (firebase_uid, email, username, is_active, created_at)
             VALUES ($1, $2, $3, true, NOW())
             ON CONFLICT (firebase_uid) DO UPDATE SET is_active = true, updated_at = NOW()
             RETURNING id, role, is_active, username, full_name, email, firebase_uid`,
            [firebaseUid, firebaseEmail, username]
          );
          result = created_result;
          created = true;
        } catch (createErr) {
          if (createErr.code === '23505' && createErr.message?.includes('username')) {
            attempts += 1;
            username = `${baseUsername}${attempts}`;
          } else {
            throw createErr;
          }
        }
      }

      if (!created) {
        return res.status(500).json({ error: 'Failed to create user account' });
      }
    }

    const dbUser = result.rows[0];
    if (!dbUser.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    req.auth.dbUser = dbUser;
    next();
  } catch (err) {
    console.error('Error loading db user:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export const requireAuth = [requireToken, loadDbUser];


export function requireAdmin(req, res, next) {
  if (!req.auth?.dbUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.auth.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
