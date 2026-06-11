import express from 'express';
import cors from 'cors';
import http from 'node:http';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config, isStripeLive, isWalletLive, isAiLive } from './config.js';
import paymentsRouter from './routes/payments.js';
import walletRouter from './routes/wallet.js';
import aiRouter from './routes/ai.js';
import healthRouter from './routes/health.js';
import chatRouter from './routes/chat.js';
import adminChatRouter from './routes/admin_chat.js';
import {
  attachLiveBridge,
  broadcastToRoom,
  isUserOnline,
  listOnlineUsers,
  listPresence,
  listRooms,
} from './live_bridge.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// CORS — allow the Flutter mobile app and the local dev front-end.
const origins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Rate limit the AI endpoint (expensive upstream calls).
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/support-ai', aiLimiter);

app.use(healthRouter);
app.use(paymentsRouter);
app.use(walletRouter);
app.use(aiRouter);
app.use(chatRouter);
app.use(adminChatRouter);

// ── Live bridge status (admin polls this for "users online") ─────────
app.get('/api/live/online', (_req, res) => {
  res.json({ users: listOnlineUsers(), rooms: listRooms() });
});
app.get('/api/live/users', (_req, res) => {
  res.json({ users: listPresence() });
});

// Make broadcastToRoom available to chat routes via a shared module.
// Easiest: re-export from live_bridge so route handlers can import.
export { broadcastToRoom, isUserOnline };

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({
    error: 'internal_error',
    message: err?.message ?? 'Unknown error',
  });
});

const port = config.PORT;
const server = http.createServer(app);

// Attach the live WebSocket bridge on the same HTTP port.
attachLiveBridge(server);

server.listen(port, () => {
  const summary = {
    port,
    env: config.NODE_ENV,
    stripe: isStripeLive ? 'live' : 'mock',
    wallet: isWalletLive ? 'live' : 'mock (no signing cert)',
    ai: isAiLive ? 'live' : 'mock (canned responses)',
    live: 'ws:// + ' + (config.PUBLIC_WS_URL || 'ws://localhost:' + port + '/ws'),
  };
  // eslint-disable-next-line no-console
  console.log('\nShipNow backend listening on http://localhost:' + port);
  // eslint-disable-next-line no-console
  console.table(summary);
  // eslint-disable-next-line no-console
  console.log(
    'Endpoints: /health, /version, /v1/payment_intents, /v1/wallet/passes, /api/support-ai, /api/chat, /api/admin/chat, /api/live/online, /api/live/users, ws /ws\n',
  );
});
