import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/version', (_req, res) => {
  res.json({
    name: 'shipnow-backend',
    version: '1.0.0',
    services: ['payments', 'wallet', 'ai'],
  });
});

export default router;
