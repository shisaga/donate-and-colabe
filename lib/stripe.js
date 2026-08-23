import crypto from 'crypto';

const KEY = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || '';
const PLACEHOLDER = !KEY || KEY === 'sk_test_emergent' || KEY.startsWith('sk_test_emergent');
const BASE = 'https://api.stripe.com';

export const stripeEnabled = Boolean(KEY) && !PLACEHOLDER;
export const stripeMode = stripeEnabled ? 'direct' : 'mock';

// Stripe rejects charges under ~$0.50; in INR that is about ₹50.
export const STRIPE_MIN_INR = 50;

function encode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === 'object') encode(item, `${key}[${i}]`, out);
        else out.push(`${key}[${i}]=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === 'object') {
      encode(v, key, out);
    } else {
      out.push(`${key}=${encodeURIComponent(v)}`);
    }
  }
  return out;
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? encode(body).join('&') : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export function amountToMinor(amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error('Minimum amount is ₹1');
  return n * 100;
}

let currencyChoice = null;

export async function createCheckoutSession({ amount, name, description, metadata, successUrl, cancelUrl, currency, minorUnits }) {
  const unit = minorUnits || amountToMinor(amount);
  const candidates = currency ? [currency, 'usd'] : (currencyChoice ? [currencyChoice] : ['inr', 'usd']);
  let lastErr = null;
  for (const cur of candidates) {
    try {
      const session = await call('/v1/checkout/sessions', {
        method: 'POST',
        body: {
          mode: 'payment',
          success_url: successUrl,
          cancel_url: cancelUrl,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: cur,
              unit_amount: unit,
              product_data: { name, description },
            },
          }],
          metadata,
        },
      });
      currencyChoice = cur;
      return { session, currency: cur, unit };
    } catch (e) {
      lastErr = e;
      if (!/currency/i.test(e.message || '')) break;
    }
  }
  throw lastErr || new Error('Could not create Stripe Checkout session');
}

export async function retrieveCheckoutSession(id) {
  return call(`/v1/checkout/sessions/${encodeURIComponent(id)}`);
}

export function verifyWebhook(rawBody, signatureHeader, secret, toleranceSec = 300) {
  if (!signatureHeader || !secret) throw new Error('Missing signature or secret');
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.trim().split('=')).map(([k, ...v]) => [k, v.join('=')])
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) throw new Error('Malformed signature header');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) throw new Error('Signature timestamp outside tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Signature mismatch');
  return JSON.parse(rawBody);
}
