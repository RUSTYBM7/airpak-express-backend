import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import paymentsRouter from '../src/routes/payments.js';
import walletRouter from '../src/routes/wallet.js';
import aiRouter from '../src/routes/ai.js';
import healthRouter from '../src/routes/health.js';

function build() {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(paymentsRouter);
  app.use(walletRouter);
  app.use(aiRouter);
  return app;
}

test('GET /health returns ok', async () => {
  const app = build();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /version lists services', async () => {
  const app = build();
  const res = await request(app).get('/version');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.services, ['payments', 'wallet', 'ai']);
});

test('POST /v1/payment_intents without stripe key returns mock intent', async () => {
  const app = build();
  const res = await request(app)
    .post('/v1/payment_intents')
    .send({ amount: 1895, currency: 'USD', description: 'Test shipment' });
  assert.equal(res.status, 200);
  assert.ok(res.body.id.startsWith('pi_mock_'));
  assert.ok(res.body.client_secret.startsWith('pi_mock_secret_'));
  assert.equal(res.body.mock, true);
});

test('POST /v1/payment_intents rejects invalid payloads', async () => {
  const app = build();
  const res = await request(app)
    .post('/v1/payment_intents')
    .send({ amount: -1 });
  assert.equal(res.status, 400);
});

test('POST /api/support-ai returns canned reply in mock mode', async () => {
  const app = build();
  const res = await request(app)
    .post('/api/support-ai')
    .send({ messages: [{ role: 'user', content: 'How much to ship?' }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.message.role, 'assistant');
  assert.match(res.body.message.content, /pricing|usd|kg/i);
});

test('POST /v1/wallet/passes returns 501 when not configured', async () => {
  const app = build();
  const res = await request(app)
    .post('/v1/wallet/passes')
    .send({ serialNumber: 'TEST123', shipment: { tracking: 'TEST123' } });
  assert.equal(res.status, 501);
});
