/**
 * Which payment methods buyers may actually use.
 *
 * Client-safe (no server imports) so the checkout UI and the order router read
 * the SAME list. A UI that offers a method the server rejects is a broken
 * checkout, and that is exactly the kind of drift that creeps in when the
 * enabled-set is duplicated.
 *
 * Razorpay is fully wired (see services/razorpay.ts and order.confirm) — it is
 * gated here rather than deleted, so switching it on is a one-line change once
 * the merchant account is live.
 */

export type PaymentMethodId = 'COD' | 'ONLINE';

export interface PaymentMethodSpec {
  id: PaymentMethodId;
  label: string;
  description: string;
  enabled: boolean;
  /** Shown when disabled, to explain why. */
  note?: string;
}

export const PAYMENT_METHODS: PaymentMethodSpec[] = [
  {
    id: 'COD',
    label: 'Cash on Delivery',
    description: 'Pay in cash when your order arrives. No card needed.',
    enabled: true,
  },
  {
    id: 'ONLINE',
    label: 'UPI, Card & Netbanking',
    description: 'Pay securely online via Razorpay.',
    enabled: false,
    note: 'Coming soon — we’re finishing setup. Use Cash on Delivery for now.',
  },
];

export const isPaymentMethodEnabled = (id: PaymentMethodId): boolean =>
  PAYMENT_METHODS.some((m) => m.id === id && m.enabled);

export const DEFAULT_PAYMENT_METHOD: PaymentMethodId = 'COD';
