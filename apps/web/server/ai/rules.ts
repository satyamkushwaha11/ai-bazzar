/**
 * Seller rules → one effective floor.
 *
 * A seller states their terms in several ways at once: a hard `minPrice`, a
 * cost plus a minimum margin, and a maximum discount off list. This module
 * resolves all of them into the single number the engine is bounded by.
 *
 * THE RULE: the effective floor is the STRICTEST of the constraints, never the
 * average and never the most generous. A seller who says "never below ₹800",
 * "never under 20% margin on my ₹700 cost" (= ₹840) and "never more than 30%
 * off my ₹1,500 list" (= ₹1,050) has an effective floor of ₹1,050. Taking
 * anything less than the max would let one carelessly-set rule silently
 * override a deliberate one — which is how a seller ends up selling at a loss.
 *
 * WIN-WIN, CONCRETELY: volume and bundles do not weaken this floor. They raise
 * the seller's TOTAL profit while letting the per-unit price fall, because the
 * floor is per-unit and the buyer is taking more units. Both sides are better
 * off than at a single-unit sale — that is the whole mechanic, and it is why
 * `extraConcession` is safe: it moves the price within [floor, list], never
 * through the floor.
 */

export interface SellerDefaults {
  negotiationEnabled: boolean;
  negotiationAggressiveness: number;
  negotiationMaxTurns: number;
}

export interface ProductRules {
  negotiationEnabled: boolean | null;
  maxDiscountPct: number | null;
  minMarginPct: number | null;
  negotiationAggressiveness: number | null;
  negotiationMaxTurns: number | null;
  volumeMinQty: number | null;
  freebie: string | null;
}

export interface VariantPrices {
  listPrice: number;
  minPrice: number;
  costPrice: number | null;
}

export type FloorReason = 'minPrice' | 'profitFloor' | 'maxDiscount';

export interface ResolvedRules {
  /** The lowest per-unit price this seller will accept. The engine's bound. */
  floor: number;
  /** Which constraint is actually binding — surfaced to the seller, never the buyer. */
  binding: FloorReason;
  /** Every constraint's value, for the seller dashboard / debugging. */
  constraints: Record<FloorReason, number | null>;
  negotiable: boolean;
  /**
   * Set when the seller's own rules make negotiation impossible — e.g. their
   * profit floor sits above their list price. Negotiation is disabled rather
   * than quietly selling at a loss, and the seller needs to hear about it.
   */
  misconfiguration: string | null;
  aggressiveness: number;
  maxTurns: number;
  freebie: string | null;
  volumeMinQty: number | null;
}

export function resolveRules(
  variant: VariantPrices,
  product: ProductRules,
  seller: SellerDefaults,
): ResolvedRules {
  const { listPrice, minPrice, costPrice } = variant;

  // Each constraint expressed as a per-unit floor, or null when not configured.
  const profitFloor =
    costPrice != null && product.minMarginPct != null
      ? costPrice * (1 + product.minMarginPct / 100)
      : costPrice != null
        ? costPrice // no margin stated, but never below cost
        : null;

  const discountFloor =
    product.maxDiscountPct != null ? listPrice * (1 - product.maxDiscountPct / 100) : null;

  const constraints: Record<FloorReason, number | null> = {
    minPrice,
    profitFloor,
    maxDiscount: discountFloor,
  };

  // Strictest wins — see the module comment for why this must be max(), not min().
  let floor = minPrice;
  let binding: FloorReason = 'minPrice';
  for (const [key, value] of Object.entries(constraints) as Array<[FloorReason, number | null]>) {
    if (value != null && value > floor) {
      floor = value;
      binding = key;
    }
  }

  const negotiationEnabled = product.negotiationEnabled ?? seller.negotiationEnabled;

  let misconfiguration: string | null = null;
  if (floor > listPrice) {
    misconfiguration =
      `Negotiation is off for this product: your floor (₹${Math.round(floor)}, set by ` +
      `${LABEL[binding]}) is above your list price of ₹${Math.round(listPrice)}. ` +
      `Raise the list price or relax the rule.`;
  }

  return {
    floor: Math.min(floor, listPrice),
    binding,
    constraints,
    negotiable: negotiationEnabled && misconfiguration === null && floor < listPrice,
    misconfiguration,
    aggressiveness: product.negotiationAggressiveness ?? seller.negotiationAggressiveness,
    maxTurns: product.negotiationMaxTurns ?? seller.negotiationMaxTurns,
    freebie: product.freebie,
    volumeMinQty: product.volumeMinQty,
  };
}

const LABEL: Record<FloorReason, string> = {
  minPrice: 'your minimum price',
  profitFloor: 'your cost + minimum margin',
  maxDiscount: 'your maximum discount',
};

/**
 * Profit on a deal, for the seller's own reporting. Never sent to a buyer.
 * Returns null when cost is unknown — an unknowable profit must not be guessed.
 */
export function profitOf(unitPrice: number, qty: number, costPrice: number | null): number | null {
  if (costPrice == null) return null;
  return (unitPrice - costPrice) * qty;
}
