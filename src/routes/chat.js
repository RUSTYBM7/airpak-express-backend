/**
 * Chat route for the user-facing app. Persists the message into the
 * lightweight in-memory store, then broadcasts it to every connected
 * admin listening on the same room via the live bridge.
 */
import express from 'express';
import { z } from 'zod';
import { broadcastToRoom } from '../live_bridge.js';

const router = express.Router();

const memory = {
  messages: [], // {id, room, userId, name, text, role, at}
};

const postSchema = z.object({
  room: z.string().min(1).max(80).default('thread_demo'),
  userId: z.string().min(1).max(80),
  name: z.string().max(80).optional().default('You'),
  text: z.string().min(1).max(4000),
  role: z.enum(['user', 'admin']).default('user'),
});

router.post('/api/chat/messages', (req, res) => {
  const parsed = postSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid', details: parsed.error.flatten() });
  }
  const m = parsed.data;
  const message = {
    id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    room: m.room,
    userId: m.userId,
    name: m.name,
    text: m.text,
    role: m.role,
    at: Date.now(),
  };
  memory.messages.push(message);
  // Cap memory size.
  if (memory.messages.length > 5000) memory.messages.splice(0, 1000);
  // Broadcast.
  const delivered = broadcastToRoom(m.room, {
    type: 'chat',
    message,
  });
  res.json({ ok: true, message, delivered });
});

router.get('/api/chat/messages', (req, res) => {
  const room = String(req.query.room || 'thread_demo');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
  const list = memory.messages
    .filter((m) => m.room === room)
    .slice(-limit);
  res.json({ messages: list });
});

export default router;
