import { Request, Response, NextFunction } from 'express';
import { sessionService } from './sessions';
import { db } from '../database/jsonDatabase';
import { UserRecord } from '../types';
import { isAdminUser } from '../config';

// Extend Express Request to carry authenticated user and session
declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      sessionToken?: string;
    }
  }
}

/**
 * Middleware: Requires a valid session token. Attaches req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = sessionService.extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. No active session token found.' });
    return;
  }

  const session = await sessionService.getSession(token);
  if (!session) {
    sessionService.clearSessionCookie(res);
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    return;
  }

  const user = await db.getUser(session.user_id);
  if (!user) {
    await sessionService.destroySession(token);
    sessionService.clearSessionCookie(res);
    res.status(401).json({ error: 'User account not found.' });
    return;
  }

  // Update role if admin configuration changed
  if (isAdminUser(user.id) && user.role !== 'admin') {
    user.role = 'admin';
    user.auth_state = 'approved';
    await db.saveUser(user);
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

/**
 * Middleware: Requires that the user has 'approved' state.
 * Blocks 'unknown', 'pending', 'rejected', and 'banned' accounts.
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.auth_state === 'banned') {
    res.status(403).json({
      error: 'Access blocked. This account has been banned.',
      status: 'banned',
    });
    return;
  }

  if (req.user.auth_state !== 'approved') {
    res.status(403).json({
      error: 'Access denied. Account not approved.',
      status: req.user.auth_state,
    });
    return;
  }

  next();
}

/**
 * Middleware: Requires admin role.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const isAdmin = req.user.role === 'admin' || isAdminUser(req.user.id);
  if (!isAdmin) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  next();
}
