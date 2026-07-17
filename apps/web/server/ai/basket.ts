/**
 * Deterministic basket-negotiation engine — the optional second haggle at
 * checkout, over every line at once.
 *
 * Seller floors NEVER leave this module. The LLM persona receives only the
 * engine's chosen `counterOffer` plus public context.
 *
 * TWO INVARIANTS, both arithmetic rather than checks that could be forgotten:
 *
 * 1. No seller loses. Each line's floor is its RESOLVED floor (cost + margin,
 *    max discount, minPrice — see rules.ts), and the allocation below can never
 *    push a line beneath its own floor.
 *
 * 2. No double-dipping. A line the buyer already negotiated enters here at its
 *    LOCKED price as `listPrice` (see services/basket-negotiation.ts). Its
 *    remaining range is therefore only what is left between that locked price
 *    and its floor — usually little or nothing. Round two can improve on round
 *    one, never undo it, and never stack two discounts through the floor.
 *
 * Allocation keeps invariant 1 true by construction:
 *
 *   line range      r_i = (list_i - floor_i) * qty_i
 *   total range     R   = Σ r_i
 *   discount        D   = listTotal - agreedTotal,  0 <= D <= R
 *   line discount   d_i = D * r_i / R
 *   line total      list_i*qty_i - d_i  >=  list_i*qty_i - r_i  =  floor_i*qty_i   ∎
 *
 * A useful consequence: because every line independently clears its own floor,
 * the allocation stays valid if the buyer later removes a line.
 */

export type BasketAction = 'COUNTER' | 'ACCEPT' | 'FINAL';

export interface BasketLine {
  variantId: string;
  qty: number;
  /** Starting price: the line's LOCKED price if already negotiated, else list. */
  listPrice: number;
  /** PRIVATE. The resolved floor from rules.ts. Never serialised. */
  minPrice: number;
}

export interface BasketPolicy {
  aggressiveness: number;
  maxTurns: number;
}

export const DEFAULT_BASKET_POLICY: BasketPolicy = { aggressiveness: 0.5, maxTurns: 4 };

export interface BasketInput {
  lines: BasketLine[];
  /** 1-indexed. Ends the conversation at maxTurns. */
  turn: number;
  /**
   * How far down the curve the buyer's own concessions have earned.
   *
   * RECIPROCITY — see EngineInput.concessionStep in negotiation.ts. Driving the
   * curve off `turn` let a buyer extract the whole margin by refusing, and made
   * "ok" produce a LOWER quote than the one just accepted.
   *
   * Defaults to 1 — hold near list — so a forgetful caller fails safe.
   */
  concessionStep?: number;
  /**
   * The buyer said yes to a basket total the shopkeeper already quoted.
   *
   * Explicit rather than passed as `buyerOffer` — with reciprocity the current
   * floor can sit above an earlier quote, and the shop would end up countering
   * its own offer. Still clamped to the basket floor.
   */
  acceptedQuote?: number | null;
  buyerOffer: number | null;
  policy?: Partial<BasketPolicy>;
  /** Extra room unlocked by tactics (volume, loyalty) — see strategy.ts. */
  extraConcession?: number;
}

export interface AllocatedLine {
  variantId: string;
  qty: number;
  unitPrice: number;
}

export interface BasketOutput {
  action: BasketAction;
  /** The engine's basket total for this turn. The LLM must quote this exactly. */
  counterOffer: number;
  listTotal: number;
  /** Internal only — never serialise. */
  internalFloorThisTurn: number;
  /** Present on ACCEPT/FINAL: the per-line split of `counterOffer`. */
  allocation?: AllocatedLine[];
  /** How much room is left in the whole basket. 0 = nothing more to give. */
  remainingRange: number;
  reason: string;
}

const round = (n: number) => Math.round(n);

export const listTotalOf = (lines: BasketLine[]) =>
  lines.reduce((s, l) => s + l.listPrice * l.qty, 0);

export const floorTotalOf = (lines: BasketLine[]) =>
  lines.reduce((s, l) => s + l.minPrice * l.qty, 0);

function floorAtTurn(
  listTotal: number,
  floorTotal: number,
  step: number,
  policy: BasketPolicy,
  extra = 0,
) {
  // `step`, not the turn number — the seller walks only as far as the buyer's
  // own concessions have earned. See BasketInput.concessionStep.
  const t = Math.max(0, Math.min(1, (step - 1) / Math.max(1, policy.maxTurns - 1)));
  const exponent = 0.5 + (1 - policy.aggressiveness) * 2;
  const fraction = Math.min(1, Math.pow(t, exponent) + Math.max(0, extra));
  return Math.max(floorTotal, listTotal - (listTotal - floorTotal) * fraction);
}

/**
 * Split `agreedTotal` across lines in proportion to each line's remaining range.
 *
 * Rounding drift is settled on the widest-range line so the parts sum exactly
 * to the agreed total; that line has the most headroom, so absorbing a few
 * rupees there cannot push it under its floor.
 */
export function allocate(lines: BasketLine[], agreedTotal: number): AllocatedLine[] {
  const listTotal = listTotalOf(lines);
  const floorTotal = floorTotalOf(lines);

  const clamped = Math.min(listTotal, Math.max(floorTotal, agreedTotal));
  const discount = listTotal - clamped;
  const totalRange = listTotal - floorTotal;

  if (discount <= 0 || totalRange <= 0) {
    return lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPrice: round(l.listPrice) }));
  }

  const lineTotals = lines.map((l) => {
    const range = (l.listPrice - l.minPrice) * l.qty;
    return l.listPrice * l.qty - (discount * range) / totalRange;
  });

  const rounded = lineTotals.map(round);
  const drift = round(clamped) - rounded.reduce((s, v) => s + v, 0);
  if (drift !== 0) {
    let widest = 0;
    let widestRange = -1;
    lines.forEach((l, i) => {
      const r = (l.listPrice - l.minPrice) * l.qty;
      if (r > widestRange) {
        widestRange = r;
        widest = i;
      }
    });
    rounded[widest] = rounded[widest]! + drift;
  }

  return lines.map((l, i) => {
    // Belt and braces: rounding must never dip a line under its own floor.
    const total = Math.max(l.minPrice * l.qty, rounded[i]!);
    return { variantId: l.variantId, qty: l.qty, unitPrice: round(total / l.qty) };
  });
}

export function negotiateBasket(input: BasketInput): BasketOutput {
  const policy = { ...DEFAULT_BASKET_POLICY, ...(input.policy ?? {}) };
  const { lines, turn, buyerOffer } = input;

  if (lines.length === 0) throw new Error('Cannot negotiate an empty basket');
  for (const l of lines) {
    if (!(l.qty > 0)) throw new Error('Invalid qty');
    if (!(l.minPrice > 0) || !(l.listPrice >= l.minPrice)) {
      throw new Error('Invalid price band: require 0 < minPrice <= listPrice');
    }
  }

  const listTotal = listTotalOf(lines);
  const floorTotal = floorTotalOf(lines);
  const remainingRange = listTotal - floorTotal;
  const step = input.concessionStep ?? 1;
  const floor = floorAtTurn(listTotal, floorTotal, step, policy, input.extraConcession ?? 0);
  const isFinalTurn = turn >= policy.maxTurns;

  const base = { listTotal: round(listTotal), internalFloorThisTurn: floor, remainingRange };

  // The buyer accepted a total already on the table. Honour it and stop.
  if (input.acceptedQuote != null && input.acceptedQuote > 0) {
    const lock = Math.min(listTotal, Math.max(floorTotal, input.acceptedQuote));
    return {
      ...base,
      action: 'ACCEPT',
      counterOffer: round(lock),
      allocation: allocate(lines, lock),
      reason: 'buyer_accepted_quote',
    };
  }

  // Everything already haggled to the bone: say so honestly instead of pretending.
  if (remainingRange <= 0) {
    return {
      ...base,
      action: 'FINAL',
      counterOffer: round(listTotal),
      allocation: allocate(lines, listTotal),
      reason: 'no_room_left',
    };
  }

  if (buyerOffer != null && buyerOffer > 0) {
    if (buyerOffer >= listTotal) {
      return {
        ...base,
        action: 'ACCEPT',
        counterOffer: round(listTotal),
        allocation: allocate(lines, listTotal),
        reason: 'buyer_offer_at_or_above_list',
      };
    }
    if (buyerOffer >= floor) {
      const lock = Math.max(floorTotal, buyerOffer);
      return {
        ...base,
        action: 'ACCEPT',
        counterOffer: round(lock),
        allocation: allocate(lines, lock),
        reason: 'buyer_offer_above_floor',
      };
    }
    if (isFinalTurn) {
      return {
        ...base,
        action: 'FINAL',
        counterOffer: round(floor),
        allocation: allocate(lines, floor),
        reason: 'final_turn_below_floor',
      };
    }
    const counter = Math.max(floor, (buyerOffer + floor) / 2);
    return {
      ...base,
      action: 'COUNTER',
      counterOffer: round(Math.min(listTotal, counter)),
      reason: 'counter_above_buyer',
    };
  }

  if (turn === 1) {
    const opener = listTotal * (1 - 0.02 * policy.aggressiveness);
    return {
      ...base,
      action: 'COUNTER',
      counterOffer: round(Math.max(floor, opener)),
      reason: 'opener_near_list',
    };
  }

  if (isFinalTurn) {
    return {
      ...base,
      action: 'FINAL',
      counterOffer: round(floor),
      allocation: allocate(lines, floor),
      reason: 'final_no_offer',
    };
  }

  return { ...base, action: 'COUNTER', counterOffer: round(floor), reason: 'counter_at_floor' };
}
