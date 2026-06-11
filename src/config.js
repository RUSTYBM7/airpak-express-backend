import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().default('*'),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  FPX_ENABLED: z.coerce.boolean().default(true),

  WALLET_P12_PATH: z.string().default('./secrets/pass_type_id.p12'),
  WALLET_P12_PASSWORD: z.string().default(''),
  WALLET_WWDR_PATH: z.string().default('./secrets/AppleWWDRCAG4.cer'),
  WALLET_PASS_TYPE_IDENTIFIER: z
    .string()
    .default('pass.com.airpak-express.shipnow'),
  WALLET_TEAM_IDENTIFIER: z.string().default('ABCDE12345'),

  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('MiniMax-M3'),
  AI_SYSTEM_PROMPT: z.string().default(
    'You are AirPak Support, the in-app AI assistant for ShipNow — a shipping & logistics platform by AirPak Express, powered by the Mavis agent (built by MiniMax) on the MiniMax-M3 model.\n\n' +
    'Your job: help customers track shipments, book pickups, understand charges, customs rules, refund policy, FPX / card payment options, and resolve delivery issues. ' +
    'Be concise, friendly, and accurate. Use short paragraphs. Quote a tracking number, ETA or price when you have one. ' +
    'If you do not know the answer, offer to connect the customer with a human agent. ' +
    'Never invent tracking numbers; if a number is malformed, ask for it again.'
  ),
});

export const config = envSchema.parse(process.env);

export const isStripeLive = config.STRIPE_SECRET_KEY.startsWith('sk_');
export const isWalletLive = config.WALLET_P12_PASSWORD.length > 0;
export const isAiLive = config.AI_API_KEY.length > 0;
