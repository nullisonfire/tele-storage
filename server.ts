import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './src/server/app';
import { db } from './src/database/jsonDatabase';
import { config } from './src/config';
import { getTelegramBot } from './src/telegram/telegramApi';
import { setupTelegramBot } from './src/bot/bot';
import { logger } from './src/utils/logger';

async function startServer() {
  // 1. Initialize atomic database
  await db.init();

  // 2. Setup Express application and API routes
  const app = createExpressApp();
  const PORT = 3000;

  // 3. Initialize Telegram Bot if token is present
  const bot = getTelegramBot();
  if (bot) {
    setupTelegramBot(bot);

    if (config.telegram.mode === 'webhook' && config.telegram.webhookUrl) {
      logger.info({ webhookUrl: config.telegram.webhookUrl }, 'Setting up Telegram Bot in WEBHOOK mode');
      bot.api
        .setWebhook(config.telegram.webhookUrl, {
          secret_token: config.telegram.webhookSecret || undefined,
        })
        .then(() => logger.info('Telegram webhook successfully set'))
        .catch((err) => logger.error({ err }, 'Failed to set Telegram webhook'));
    } else if (config.telegram.mode === 'polling') {
      logger.info('Starting Telegram Bot in POLLING mode');
      bot.start({
        onStart: (info) => {
          logger.info({ username: info.username, id: info.id }, 'Telegram bot started polling');
        },
      }).catch((err) => {
        logger.error({ err }, 'Telegram bot polling error');
      });
    }
  } else {
    logger.info('Telegram Bot Token not configured in .env - running in web preview & demo mode');
  }

  // 4. Vite middleware for development vs static build serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 5. Bind server
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Telegram Media Manager running at http://0.0.0.0:${PORT} [${config.env}]`);
  });
}

startServer().catch((err) => {
  logger.error({ err }, 'Fatal error during server startup');
  process.exit(1);
});
