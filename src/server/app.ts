import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { config } from '../config';
import { getTelegramBot } from '../telegram/telegramApi';
import authRoutes from './routes/authRoutes';
import fsRoutes from './routes/fsRoutes';
import mediaRoutes from './routes/mediaRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';
import { mediaService } from '../services/mediaService';
import { logger } from '../utils/logger';

export function createExpressApp(): express.Application {
  const app = express();

  // Basic security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Body and cookie parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Simple in-memory rate limiter per IP
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use('/api/', (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
      return next();
    }

    entry.count++;
    if (entry.count > 300) {
      // 300 requests per minute
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      return;
    }
    next();
  });

  // Health endpoints
  app.get(['/health', '/api/health'], (req: Request, res: Response) => {
    res.json({ ok: true, service: 'telegram-media-manager' });
  });

  // Top-level & API Telegram OIDC Callbacks
  app.all(
    ['/auth/callback', '/auth/oidc/callback', '/api/auth/callback', '/api/auth/oidc/callback'],
    (req: Request, res: Response, next: NextFunction) => {
      req.url = '/callback';
      authRoutes(req, res, next);
    }
  );

  // Top-level & API Telegram OIDC Login redirect
  app.get(['/auth/login', '/auth/oidc/login'], (req: Request, res: Response, next: NextFunction) => {
    req.url = '/login';
    authRoutes(req, res, next);
  });

  // Auth routes
  app.use('/api/auth', authRoutes);
  app.get('/api/me', (req, res, next) => {
    req.url = '/me';
    authRoutes(req, res, next);
  });

  // Detailed Health
  app.get('/health/detailed', async (req: Request, res: Response) => {
    try {
      const stats = await mediaService.getStorageStats();
      res.json({
        ok: true,
        service: 'telegram-media-manager',
        uptime_seconds: Math.floor(process.uptime()),
        memory_usage: process.memoryUsage(),
        database: {
          files: stats.total_files,
          directories: stats.total_directories,
          size_bytes: stats.total_size_bytes,
        },
        telegram: {
          mode: config.telegram.mode,
          has_bot_token: Boolean(config.telegram.botToken),
          storage_group_id: config.telegram.storageGroupId,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Telegram Webhook Handler
  app.post('/telegram/webhook', async (req: Request, res: Response) => {
    // Validate secret token if configured
    if (config.telegram.webhookSecret) {
      const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
      if (secretHeader !== config.telegram.webhookSecret) {
        logger.warn('Received webhook with invalid secret token');
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const bot = getTelegramBot();
    if (!bot) {
      res.status(503).json({ error: 'Bot not initialized' });
      return;
    }

    try {
      await bot.handleUpdate(req.body);
      res.json({ ok: true });
    } catch (err: any) {
      logger.error({ err }, 'Error handling Telegram webhook update');
      res.status(500).json({ error: 'Internal update error' });
    }
  });

  // API Route Mounting
  app.use('/api/auth', authRoutes);
  app.use('/api/fs', fsRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/admin', adminRoutes);

  // Global error sanitization handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error({ err, path: req.path }, 'Unhandled server error');
    res.status(err.status || 500).json({
      error: config.isProduction ? 'An unexpected server error occurred.' : err.message || 'Internal Server Error',
    });
  });

  return app;
}
