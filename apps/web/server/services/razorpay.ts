import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

/**
 * Constructed at module scope, so a throw here takes down `next build` — not
 * just payments. Razorpay is optional (checkout is COD-only today), so a bad
 * or placeholder key must degrade to "not configured" rather than fail the
 * deploy. See server/redis.ts for the same bug found the hard way.
 */
function makeRazorpay(): Razorpay | null {
  if (!keyId || !keySecret) return null;
  try {
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  } catch (err) {
    console.warn('[razorpay] could not initialise, online payments DISABLED:', err);
    return null;
  }
}

export const razorpay = makeRazorpay();

export const razorpayEnabled = !!razorpay;

export interface CreateRazorpayOrderArgs {
  amountInRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder({ amountInRupees, receipt, notes }: CreateRazorpayOrderArgs) {
  if (!razorpay) throw new Error('Razorpay is not configured');
  return razorpay.orders.create({
    amount: Math.round(amountInRupees * 100), // paise
    currency: 'INR',
    receipt,
    notes,
  });
}

export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${args.orderId}|${args.paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(args.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
