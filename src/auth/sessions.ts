import crypto from 'crypto';
import { Request, Response } from 'express';
import { db } from '../database/jsonDatabase';
import { AuthSession, UserRole } from '../types';
import { config } from '../config';

export class SessionService {
  public async createSession(userId: number, role: UserRole, req?: Request): Promise<AuthSession> {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + config.session.maxAgeDays * 24 * 60 * 60 * 1000;

    const session: AuthSession = {
      token,
      user_id: userId,
      role,
      created_at: now,
      expires_at: expiresAt,
      user_agent: req?.headers['user-agent'],
      ip: (req?.headers['x-forwarded-for'] as string) || req?.socket.remoteAddress,
    };

    await db.saveSession(session);
    return session;
  }

  public async getSession(token: string): Promise<AuthSession | null> {
    if (!token) return null;
    return db.getSession(token);
  }

  public async destroySession(token: string): Promise<void> {
    if (!token) return;
    await db.deleteSession(token);
  }

  public setSessionCookie(res: Response, token: string): void {
    const maxAgeMs = config.session.maxAgeDays * 24 * 60 * 60 * 1000;
    res.cookie(config.session.cookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });
  }

  public clearSessionCookie(res: Response): void {
    res.clearCookie(config.session.cookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  public extractTokenFromRequest(req: Request): string | null {
    // 1. Check HttpOnly cookie
    if (req.cookies && req.cookies[config.session.cookieName]) {
      return req.cookies[config.session.cookieName];
    }
    // 2. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    // 3. Check query param for direct download stream link if needed
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }
    return null;
  }
}

export const sessionService = new SessionService();
