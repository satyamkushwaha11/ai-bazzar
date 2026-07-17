/**
 * Seller bargaining strategy.
 *
 * The concession CURVE lives in negotiation.ts; this module decides which
 * *tactic* a seller plays on a given turn, and how much extra room (if any) a
 * tactic unlocks. Kept separate so the floor guarantee in negotiation.ts stays
 * small and auditable — everything here can only ever widen or narrow the
 * concession *within* [minPrice, listPrice], never past it.
 *
 * TRUTHFULNESS IS A HARD CONSTRAINT.
 * Several of these tactics are urgency or social proof. Every one of them is
 * driven by a real fact supplied by the caller — live stock, a real lock
 * expiry, real session counts, a seller-set compare-at price. None is
 * fabricated, and none may be. Beyond the obvious (the shopkeeper must not lie
 * to a buyer), India's CCPA Guidelines for Prevention and Regulation of Dark
 * Patterns (2023) name "false urgency" and fabricated scarcity specifically.
 * If a fact isn't available, the tactic is simply not offered — see
 * `availableTactics`, which gates on real data rather than inventing it.
 */

export type Tactic =
  /** Open near list and let the number do the work. */
  | 'ANCHOR'
  /** Explain the price: quality, materials, festive season. No number change. */
  | 'JUSTIFY'
  /** Buy more units, better unit price. Unlocks real extra room. */
  | 'VOLUME'
  /** Add a second product and both get cheaper. Unlocks real extra room. */
  | 'BUNDLE'
  /** Throw in shipping rather than cut the price. Cheaper for the seller. */
  | 'PERK_SHIPPING'
  /** Throw in a small freebie rather than cut the price. */
  | 'PERK_FREEBIE'
  /** Repeat buyer gets a little extra. Unlocks real extra room. */
  | 'LOYALTY'
  /** Meet between the buyer's offer and the floor. */
  | 'SPLIT'
  /** Genuinely low stock — stated only when live stock is actually low. */
  | 'SCARCITY'
  /** Others are haggling this too — stated only from real session counts. */
  | 'SOCIAL_PROOF'
  /** The lock really does expire. A true deadline. */
  | 'URGENCY'
  /** Flattery costs nothing: "special price, for you only". */
  | 'RECIPROCITY'
  /** Take it or leave it. */
  | 'WALK_AWAY';

export interface SellerStrategy {
  /** 0 = hold firm, 1 = concede fast. */
  aggressiveness: number;
  maxTurns: number;
  /**
   * Extra concession unlocked by buying multiple units, as a fraction of the
   * remaining range. Real economics: per-unit handling cost falls with volume.
   */
  volumeTiers: Array<{ minQty: number; extra: number }>;
  /** Extra room unlocked when the buyer adds another of this seller's products. */
  bundleExtra: number;
  /** Extra room for a buyer who has ordered from this seller before. */
  loyaltyExtra: number;
  /**
   * When the buyer is within this fraction of the range from the floor, offer a
   * perk instead of more rupees — it closes the gap at lower cost to the seller.
   */
  perkGapFraction: number;
  /** Tactics this seller is willing to play. */
  enabled: Tactic[];
}

export const DEFAULT_STRATEGY: SellerStrategy = {
  aggressiveness: 0.5,
  maxTurns: 4,
  volumeTiers: [
    { minQty: 2, extra: 0.12 },
    { minQty: 3, extra: 0.22 },
    { minQty: 5, extra: 0.35 },
  ],
  bundleExtra: 0.18,
  loyaltyExtra: 0.08,
  perkGapFraction: 0.12,
  enabled: [
    'ANCHOR',
    'JUSTIFY',
    'VOLUME',
    'BUNDLE',
    'PERK_SHIPPING',
    'PERK_FREEBIE',
    'LOYALTY',
    'SPLIT',
    'SCARCITY',
    'SOCIAL_PROOF',
    'URGENCY',
    'RECIPROCITY',
    'WALK_AWAY',
  ],
};

/**
 * Real facts about this negotiation. Every urgency/proof tactic is gated on one
 * of these — absent fact, absent tactic.
 */
export interface DealFacts {
  qty: number;
  /** Live stock for the variant. */
  stock: number;
  /** Has this buyer ordered from this seller before? */
  returningBuyer: boolean;
  /** Real count of other buyers who haggled this variant recently. */
  recentHaggles: number;
  /** Whether the seller offers free shipping as a perk on this order. */
  canOfferShipping: boolean;
  /** A real, cheap add-on this seller can include, if any. */
  freebie: string | null;
}

/**
 * Extra concession, as a fraction of the remaining range, unlocked by things
 * the buyer has actually done (bought more, come back, added a bundle).
 *
 * Capped at 0.6 so tactics can never collapse the whole range at once — the
 * seller still has somewhere to go on later turns.
 */
export function extraConcession(s: SellerStrategy, f: DealFacts, hasBundle: boolean): number {
  let extra = 0;

  if (s.enabled.includes('VOLUME')) {
    const tier = [...s.volumeTiers].sort((a, b) => b.minQty - a.minQty).find((t) => f.qty >= t.minQty);
    if (tier) extra += tier.extra;
  }
  if (hasBundle && s.enabled.includes('BUNDLE')) extra += s.bundleExtra;
  if (f.returningBuyer && s.enabled.includes('LOYALTY')) extra += s.loyaltyExtra;

  return Math.min(extra, 0.6);
}

/**
 * Which tactics are BOTH enabled by the seller AND supported by a real fact.
 *
 * This is the truthfulness gate. SCARCITY needs genuinely low stock;
 * SOCIAL_PROOF needs real recent haggles. If the fact isn't there, the
 * shopkeeper is never told the tactic is available, so it can't reach for it.
 */
export function availableTactics(s: SellerStrategy, f: DealFacts, hasBundle: boolean): Tactic[] {
  const on = (t: Tactic) => s.enabled.includes(t);
  const out: Tactic[] = [];

  if (on('ANCHOR')) out.push('ANCHOR');
  if (on('JUSTIFY')) out.push('JUSTIFY');
  if (on('RECIPROCITY')) out.push('RECIPROCITY');
  if (on('SPLIT')) out.push('SPLIT');
  if (on('WALK_AWAY')) out.push('WALK_AWAY');
  // The lock genuinely expires, so urgency is always truthful here.
  if (on('URGENCY')) out.push('URGENCY');

  // Gated on real facts.
  if (on('SCARCITY') && f.stock > 0 && f.stock <= 5) out.push('SCARCITY');
  if (on('SOCIAL_PROOF') && f.recentHaggles >= 3) out.push('SOCIAL_PROOF');
  if (on('VOLUME') && s.volumeTiers.length > 0) out.push('VOLUME');
  if (on('BUNDLE')) out.push('BUNDLE');
  if (on('LOYALTY') && f.returningBuyer) out.push('LOYALTY');
  if (on('PERK_SHIPPING') && f.canOfferShipping) out.push('PERK_SHIPPING');
  if (on('PERK_FREEBIE') && f.freebie) out.push('PERK_FREEBIE');

  return out;
}

/**
 * Should the seller close the remaining gap with a perk rather than rupees?
 *
 * True when the buyer is close to the floor: a perk costs the seller less than
 * the cash gap, and it lets them hold the headline price.
 */
export function shouldOfferPerk(
  s: SellerStrategy,
  f: DealFacts,
  opts: { buyerOffer: number | null; floor: number; listPrice: number; minPrice: number },
): 'PERK_SHIPPING' | 'PERK_FREEBIE' | null {
  const { buyerOffer, floor, listPrice, minPrice } = opts;
  if (buyerOffer == null) return null;

  const range = listPrice - minPrice;
  if (range <= 0) return null;

  const gap = floor - buyerOffer;
  // Only when the buyer is BELOW the floor but close enough that a sweetener
  // is plausibly worth more to them than the rupees they're short.
  if (gap <= 0 || gap > range * s.perkGapFraction) return null;

  if (s.enabled.includes('PERK_SHIPPING') && f.canOfferShipping) return 'PERK_SHIPPING';
  if (s.enabled.includes('PERK_FREEBIE') && f.freebie) return 'PERK_FREEBIE';
  return null;
}

/** Human-readable brief the persona uses to phrase the chosen tactic. */
export const TACTIC_BRIEF: Record<Tactic, string> = {
  ANCHOR: 'Open close to the list price. Confident, not apologetic.',
  JUSTIFY: 'Justify the price with something concrete: build quality, materials, festive season, free returns.',
  VOLUME: 'Point out that buying more units gets a better price per unit. Invite them to take 2 or 3.',
  BUNDLE: 'Suggest adding another item from this store — the pair gets a better deal than either alone.',
  PERK_SHIPPING: 'Hold the price but throw in free shipping to close the gap.',
  PERK_FREEBIE: 'Hold the price but include a small freebie to close the gap.',
  LOYALTY: 'They have bought from this store before. Acknowledge it warmly and give them a little extra.',
  SPLIT: 'Meet them between their offer and yours. Frame it as meeting halfway.',
  SCARCITY: 'Stock really is low — mention how few are left. State the true number you are given, never invent one.',
  SOCIAL_PROOF: 'Others really are haggling this item — mention it. Use the true number you are given, never invent one.',
  URGENCY: 'The agreed price genuinely locks for 10 minutes only. Mention the deadline honestly.',
  RECIPROCITY: 'Make them feel it is a personal favour — "for you only", "special price, my friend".',
  WALK_AWAY: 'This is your final number. Polite, warm, but immovable.',
};
