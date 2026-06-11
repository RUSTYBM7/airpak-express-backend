import { Router } from 'express';
import { z } from 'zod';
import { config, isWalletLive } from '../config.js';

const router = Router();

const passSchema = z.object({
  passTypeIdentifier: z.string().min(1).optional(),
  teamIdentifier: z.string().min(1).optional(),
  serialNumber: z.string().min(1),
  organizationName: z.string().default('AirPak Express'),
  description: z.string().default('Shipment'),
  logoText: z.string().default('ShipNow'),
  shipment: z.object({
    tracking: z.string(),
    status: z.string().optional(),
    service: z.string().optional(),
    origin: z
      .object({
        name: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        postal: z.string().optional(),
      })
      .optional(),
    destination: z
      .object({
        name: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        postal: z.string().optional(),
      })
      .optional(),
    eta: z.string().optional(),
    price: z.string().optional(),
  }),
});

/**
 * POST /v1/wallet/passes
 *
 * Builds a signed .pkpass bundle for Apple Wallet. Apple requires the
 * pass to be signed with the pass-type certificate (P12 + WWDR) on
 * the server side — unsigned passes will be rejected by Wallet.
 *
 * In dev (no signing cert) the endpoint returns a 501 with a clear
 * hint, so the client knows to fall back to its in-app builder.
 */
router.post('/v1/wallet/passes', async (req, res) => {
  const parsed = passSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  if (!isWalletLive) {
    return res.status(501).json({
      error: 'wallet_not_configured',
      message:
        'Apple Wallet signing certificates are not configured on this backend. ' +
        'Drop a .p12 + AppleWWDRCAG4.cer into ./secrets/ and set WALLET_P12_PASSWORD.',
    });
  }
  try {
    const { default: PKPass } = await import('passkit-generator');
    const fs = await import('node:fs');
    const cert = fs.readFileSync(config.WALLET_P12_PATH);
    const wwdr = fs.readFileSync(config.WALLET_WWDR_PATH);

    const body = parsed.data;
    const ship = body.shipment;

    const pass = new PKPass({}, {
      signerCert: cert,
      signerKey: null,
      wwdrcert: wwdr,
      signerKeyPassphrase: config.WALLET_P12_PASSWORD,
    });

    pass.type = 'generic';
    pass.primaryFields.push({
      key: 'tracking',
      label: 'TRACKING',
      value: ship.tracking,
    });
    pass.secondaryFields.push({
      key: 'route',
      label: 'ROUTE',
      value: `${ship.origin?.city ?? ''} → ${ship.destination?.city ?? ''}`,
    });
    pass.auxiliaryFields.push(
      { key: 'service', label: 'SERVICE', value: ship.service ?? '' },
      { key: 'eta', label: 'ETA', value: ship.eta ?? '' },
    );
    pass.backFields.push(
      { key: 'status', label: 'Status', value: ship.status ?? '' },
      {
        key: 'origin',
        label: 'Origin',
        value: ship.origin ? `${ship.origin.name ?? ''}\n${ship.origin.city ?? ''}` : '',
      },
      {
        key: 'destination',
        label: 'Destination',
        value: ship.destination
          ? `${ship.destination.name ?? ''}\n${ship.destination.city ?? ''}`
          : '',
      },
    );
    pass.setBarcodes({
      format: 'PKBarcodeFormatQR',
      message: ship.tracking,
      messageEncoding: 'iso-8859-1',
    });

    pass.setColors({
      backgroundColor: 'rgb(220, 38, 38)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(255, 255, 255)',
    });

    pass.headerFields.push({
      key: 'service',
      label: 'SERVICE',
      value: ship.service ?? '',
    });

    pass.passTypeIdentifier =
      body.passTypeIdentifier ?? config.WALLET_PASS_TYPE_IDENTIFIER;
    pass.teamIdentifier = body.teamIdentifier ?? config.WALLET_TEAM_IDENTIFIER;
    pass.organizationName = body.organizationName;
    pass.description = body.description;
    pass.logoText = body.logoText;
    pass.serialNumber = body.serialNumber;

    const buf = pass.getAsBuffer();
    res.set('Content-Type', 'application/vnd.apple.pkpass');
    res.set(
      'Content-Disposition',
      `attachment; filename="${ship.tracking}.pkpass"`,
    );
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({
      error: 'wallet_error',
      message: err.message,
    });
  }
});

export default router;
