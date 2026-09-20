import { Router, Request, Response } from 'express';
import { validateTelegramMiniAppInitData } from '../../auth/miniAppAuth';
import { telegramOidcService } from '../../auth/telegramOidc';
import { sessionService } from '../../auth/sessions';
import { accessService } from '../../services/accessService';
import { db } from '../../database/jsonDatabase';
import { requireAuth } from '../../auth/authorization';
import { config, isAdminUser } from '../../config';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/me
 * Returns current authenticated user and authorization status
 */
router.get('/me', async (req: Request, res: Response) => {
  const token = sessionService.extractTokenFromRequest(req);
  if (!token) {
    res.json({ authenticated: false, status: 'unauthorized' });
    return;
  }

  const session = await sessionService.getSession(token);
  if (!session) {
    sessionService.clearSessionCookie(res);
    res.json({ authenticated: false, status: 'unauthorized' });
    return;
  }

  const user = (await db.getUser(session.user_id)) || (await accessService.getOrCreateUser({ id: session.user_id, first_name: 'User' }));
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
      role: user.role,
      auth_state: user.auth_state,
      current_directory: user.current_directory,
    },
    status: user.auth_state,
    isAdmin: user.role === 'admin' || isAdminUser(user.id),
  });
});

/**
 * POST /api/auth/telegram-miniapp
 * Official cryptographically validated Mini App authentication
 */
router.post('/telegram-miniapp', async (req: Request, res: Response) => {
  const { initData } = req.body;
  if (!initData) {
    res.status(400).json({ authenticated: false, error: 'initData is required' });
    return;
  }

  // Validate cryptographically with Bot Token
  const validation = validateTelegramMiniAppInitData(initData);
  if (!validation.valid || !validation.user) {
    logger.warn({ error: validation.error }, 'Mini App authentication failed validation');
    res.status(401).json({ authenticated: false, error: validation.error || 'Cryptographic validation failed' });
    return;
  }

  const user = await accessService.getOrCreateUser(validation.user);
  const session = await sessionService.createSession(user.id, user.role, req);
  sessionService.setSessionCookie(res, session.token);

  res.json({
    authenticated: true,
    token: session.token,
    user: {
      id: user.id,
      first_name: user.first_name,
      username: user.username,
      role: user.role,
      auth_state: user.auth_state,
    },
    status: user.auth_state,
  });
});

/**
 * GET /api/auth/oidc/login, /auth/login
 * Returns official Telegram OIDC authorization URL for browser login, or redirects directly if requested by browser
 */
router.get(['/oidc/login', '/login'], (req: Request, res: Response) => {
  try {
    // If request comes from a custom domain (e.g. storage.sectester.xyz), infer redirect URI if needed
    let customRedirectUri: string | undefined = undefined;
    const host = req.get('host');
    if (host && !host.includes('localhost') && (!config.oidc.redirectUri || config.oidc.redirectUri.includes('localhost'))) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      customRedirectUri = `${proto}://${host}/auth/callback`;
    }

    const { url, state, redirectUri } = telegramOidcService.createAuthorizationUrl(customRedirectUri);

    // If browser requested redirect directly
    if (req.query.redirect === 'true' || (req.headers.accept?.includes('text/html') && !req.xhr)) {
      res.redirect(url);
      return;
    }

    res.json({ url, state, redirectUri });
  } catch (err: any) {
    logger.error({ err }, 'Failed to generate OIDC authorization URL');
    res.status(500).json({ error: err.message || 'Failed to generate login URL' });
  }
});

/**
 * GET & POST /api/auth/oidc/callback, /auth/callback
 * Handles Telegram OIDC authorization callback
 */
router.all(['/oidc/callback', '/callback'], async (req: Request, res: Response) => {
  const code = (req.query.code || req.body?.code) as string | undefined;
  const state = (req.query.state || req.body?.state) as string | undefined;
  const error = (req.query.error || req.body?.error) as string | undefined;
  const error_description = (req.query.error_description || req.body?.error_description) as string | undefined;

  const isJsonClient = Boolean(
    (req.headers.accept?.includes('application/json') && !req.headers.accept?.includes('text/html')) ||
    req.xhr ||
    req.method === 'POST'
  );

  if (error) {
    logger.warn({ error, error_description }, 'Telegram OIDC returned error');
    const msg = String(error_description || error);
    if (isJsonClient) {
      res.status(400).json({ authenticated: false, error: msg });
      return;
    }
    res.redirect(`/?auth_error=${encodeURIComponent(msg)}`);
    return;
  }

  if (!code || !state) {
    const msg = 'Missing required authorization code or state parameter';
    if (isJsonClient) {
      res.status(400).json({ authenticated: false, error: msg });
      return;
    }
    res.redirect(`/?auth_error=${encodeURIComponent(msg)}`);
    return;
  }

  try {
    // In case redirect URI was on custom domain
    let reqRedirectUri: string | undefined = undefined;
    const host = req.get('host');
    if (host && !host.includes('localhost') && (!config.oidc.redirectUri || config.oidc.redirectUri.includes('localhost'))) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      reqRedirectUri = `${proto}://${host}/auth/callback`;
    }

    const tgUser = await telegramOidcService.handleCallback(String(code), String(state), reqRedirectUri);
    const user = await accessService.getOrCreateUser(tgUser);
    const session = await sessionService.createSession(user.id, user.role, req);
    sessionService.setSessionCookie(res, session.token);

    if (isJsonClient) {
      res.json({
        authenticated: true,
        token: session.token,
        user: {
          id: user.id,
          first_name: user.first_name,
          username: user.username,
          role: user.role,
          auth_state: user.auth_state,
        },
        status: user.auth_state,
      });
      return;
    }

    // Redirect to home page
    res.redirect('/');
  } catch (err: any) {
    logger.error({ err }, 'Error during Telegram OIDC callback handling');
    const errMsg = err.message || 'Authentication failed';
    if (isJsonClient) {
      res.status(400).json({ authenticated: false, error: errMsg });
      return;
    }
    res.redirect(`/?auth_error=${encodeURIComponent(errMsg)}`);
  }
});

/**
 * POST /api/auth/request-access
 * Submit an access request
 */
router.post('/request-access', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await accessService.requestAccess(req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response) => {
  const token = sessionService.extractTokenFromRequest(req);
  if (token) {
    await sessionService.destroySession(token);
  }
  sessionService.clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
