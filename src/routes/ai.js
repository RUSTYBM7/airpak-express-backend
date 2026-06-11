import { Router } from 'express';
import { z } from 'zod';
import { config, isAiLive } from '../config.js';

const router = Router();

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const chatSchema = z.object({
  model: z.string().optional(),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().optional().default(false),
});

/**
 * POST /api/support-ai
 *
 * Proxies the conversation to MiniMax-M3 (or any OpenAI-compatible
 * chat completions API). The Flutter app posts a `messages` array and
 * gets back either:
 *   - JSON: { message: { role: 'assistant', content: '...' } }
 *   - SSE stream: data: {"delta":"..."}  data: [DONE]
 *
 * Auth happens here (off-device). The mobile app only knows the
 * backend URL.
 */
router.post('/api/support-ai', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const { model, messages, stream } = parsed.data;
  const upstream = config.AI_BASE_URL.replace(/\/+$/, '');
  const url = `${upstream}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
  if (isAiLive) headers['Authorization'] = `Bearer ${config.AI_API_KEY}`;

  if (!isAiLive) {
    // Dev fallback — return a canned response so the mobile UI flow
    // can be exercised without a real LLM key.
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const reply = cannedReply(last?.content ?? '');
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      for (const token of reply.split(/(\s+)/)) {
        res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return res.json({
    message: { role: 'assistant', content: reply },
    model: 'MiniMax-M3 (mock)',
  });
  }

  // Forward to upstream
  try {
    const upstreamRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model ?? config.AI_MODEL,
        messages: [
          { role: 'system', content: config.AI_SYSTEM_PROMPT },
          ...messages.filter((m) => m.role !== 'system'),
        ],
        stream,
      }),
    });
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text();
      return res.status(upstreamRes.status).json({
        error: 'upstream_error',
        status: upstreamRes.status,
        message: text,
      });
    }
    if (stream) {
      // Pipe the SSE stream straight back to the client.
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        res.end();
      }
      return;
    }
    const json = await upstreamRes.json();
    const choice = json.choices?.[0];
    const msg = choice?.message ?? {
      role: 'assistant',
      content: '',
    };
    return res.json({ message: msg, usage: json.usage, model: config.AI_MODEL });
  } catch (err) {
    return res.status(502).json({
      error: 'upstream_unreachable',
      message: err.message,
    });
  }
});

function cannedReply(userText) {
  const t = (userText || '').toLowerCase();
  if (t.includes('track') || t.includes('apk')) {
    return 'You can track any AirPak Express parcel at the Tracking page using the number that starts with "APK". Want me to take you there?';
  }
  if (t.includes('price') || t.includes('cost') || t.includes('rate') || t.includes('ship')) {
    return 'Pricing depends on weight, dimensions, destination, and service level. A 1kg parcel from KL to Singapore starts around USD 18 with Express.';
  }
  if (t.includes('fpx') || t.includes('bank')) {
    return 'We support FPX (Malaysian online banking) through Stripe. Pick FPX at checkout — the usual online banking login will pop up.';
  }
  if (t.includes('refund') || t.includes('cancel')) {
    return 'For cancellations within 24h of booking we refund in full. I can connect you to a human agent to process it — just say the word.';
  }
  return 'Got it — let me connect you to a human agent so they can help in detail. Average reply time is 2 minutes.';
}

export default router;
