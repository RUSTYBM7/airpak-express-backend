import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { config, isStripeLive } from '../config.js';

const router = Router();

let stripe = null;
function getStripe() {
  if (!isStripeLive) return null;
  if (stripe) return stripe;
  stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  return stripe;
}

const intentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(8),
  description: z.string().min(1).max(256),
  metadata: z.record(z.string()).optional().default({}),
});

/**
 * POST /v1/payment_intents
 *
 * Creates a Stripe PaymentIntent. The Flutter app posts:
 *   { amount (cents), currency, description, metadata, payment_method_types }
 * and receives:
 *   { id, client_secret, customer, ephemeral_key, receipt_url }
 *
 * Note: ephemeral keys are issued via Stripe's Customer Ephemeral Key
 * API and used by the mobile SDK to keep the customer's saved methods
 * across intents. We return null here and let the mobile SDK re-auth
 * each time — production deployments with saved cards should swap in
 * the `/v1/customers/:id/ephemeral_keys` call.
 */
router.post('/v1/payment_intents', async (req, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const s = getStripe();
  if (!s) {
    // Mock mode — synthesise a well-formed intent so the mobile SDK
    // can open the payment sheet in dev.
    return res.json({
      id: 'pi_mock_' + Date.now(),
      client_secret: 'pi_mock_secret_' + Date.now(),
      customer: null,
      ephemeral_key: null,
      receipt_url: null,
      mock: true,
    });
  }
  try {
    const { amount, currency, description, metadata } = parsed.data;
    const intent = await s.paymentIntents.create({
      amount,
      currency,
      description,
      metadata,
      payment_method_types: [
        'card',
        ...(config.FPX_ENABLED ? ['fpx'] : []),
      ],
    });
    return res.json({
      id: intent.id,
      client_secret: intent.client_secret,
      customer: intent.customer,
      ephemeral_key: null,
      receipt_url: intent.latest_charge ? null : null,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'stripe_error',
      message: err.message,
    });
  }
});

/**
 * GET /v1/payment_methods/config
 *
 * Returns the publishable key + which payment methods are enabled,
 * so the mobile app can configure the SDK before opening the sheet.
 */
router.get('/v1/payment_methods/config', (_req, res) => {
  res.json({
    publishable_key: config.STRIPE_PUBLISHABLE_KEY,
    fpx_enabled: config.FPX_ENABLED,
    merchant_name: 'AirPak Express',
    currency: 'USD',
  });
});

export default router;
