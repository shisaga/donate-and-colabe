import crypto from 'crypto';
import Razorpay from 'razorpay';

const MIN_PAISE = 100;

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayPublicKey() {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
}

export function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    const err = new Error('Razorpay is not configured');
    err.status = 500;
    throw err;
  }
  return new Razorpay({ key_id, key_secret });
}

export async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes }) {
  const paise = Math.floor(Number(amount));
  if (!Number.isFinite(paise) || paise < MIN_PAISE) {
    const err = new Error(`Minimum amount is ${MIN_PAISE} paise`);
    err.status = 400;
    throw err;
  }
  try {
    const order = await getRazorpay().orders.create({
      amount: paise,
      currency: String(currency || 'INR').toUpperCase(),
      receipt: String(receipt || `rcpt_${Date.now()}`).slice(0, 40),
      notes: notes || {},
    });
    return order;
  } catch (e) {
    const status = e.statusCode === 401 ? 401 : (e.status === 400 ? 400 : 500);
    const err = new Error(e.error?.description || e.message || 'Razorpay order failed');
    err.status = status;
    throw err;
  }
}

export function verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(razorpay_signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
