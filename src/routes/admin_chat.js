/**
 * Admin-only chat route — admins post into a user thread, the live
 * bridge delivers it to that user's app instantly.
 */
import express from 'express';
import { z } from 'zod';
import { broadcastToRoom } from '../live_bridge.js';

const router = express.Router();

const postSchema = z.object({
  room: z.string().min(1).max(80),
  adminId: z.string().min(1).max(80),
  adminName: z.string().max(80).optional().default('AirPak Support'),
  text: z.string().min(1).max(4000),
});

router.post('/api/admin/chat/post', (req, res) => {
  const parsed = postSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid', details: parsed.error.flatten() });
  }
  const m = parsed.data;
  const message = {
    id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    room: m.room,
    userId: m.adminId,
    name: m.adminName,
    text: m.text,
    role: 'admin',
    at: Date.now(),
  };
  const delivered = broadcastToRoom(m.room, { type: 'chat', message });
  res.json({ ok: true, message, delivered });
});

export default router;
