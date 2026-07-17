'use client';
import * as React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { formatINR, cn } from '@/lib/utils';
import { resolveRules, type SellerDefaults } from '@/server/ai/rules';

/**
 * Seller-facing negotiation rules, with a live preview of the resolved floor.
 *
 * The preview matters more than the inputs: sellers set three overlapping
 * constraints (a minimum price, a cost + margin, a maximum discount) and it is
 * genuinely hard to know which one actually binds. Showing "the AI will not go
 * below ₹X, because of <this rule>" turns a guess into a fact.
 *
 * `resolveRules` is the SAME pure function the negotiation engine is bounded
 * by, imported rather than reimplemented — a preview that merely approximates
 * the engine would be worse than none, because sellers would trust it.
 * (It has no server imports, so it bundles for the client safely. Only the
 * seller's own prices are shown, and only to them.)
 */

export interface RulesState {
  negotiationEnabled: boolean | null;
  minMarginPct: number | null;
  maxDiscountPct: number | null;
  negotiationAggressiveness: number | null;
  negotiationMaxTurns: number | null;
  volumeMinQty: number | null;
  freebie: string | null;
}

export const EMPTY_RULES: RulesState = {
  negotiationEnabled: null,
  minMarginPct: null,
  maxDiscountPct: null,
  negotiationAggressiveness: null,
  negotiationMaxTurns: null,
  volumeMinQty: null,
  freebie: null,
};

/** '' -> null, so clearing a field means "inherit my store default". */
const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const LABEL: Record<string, string> = {
  minPrice: 'your minimum price',
  profitFloor: 'your cost + minimum margin',
  maxDiscount: 'your maximum discount',
};

export function NegotiationRules({
  rules,
  setRules,
  sellerDefaults,
  sample,
}: {
  rules: RulesState;
  setRules: (patch: Partial<RulesState>) => void;
  sellerDefaults: SellerDefaults;
  /** The first variant — what the preview is computed against. */
  sample: { listPrice: number; minPrice: number; costPrice: number | null } | null;
}) {
  const resolved = React.useMemo(() => {
    if (!sample || !(sample.listPrice > 0) || !(sample.minPrice > 0)) return null;
    return resolveRules(sample, rules, sellerDefaults);
  }, [sample, rules, sellerDefaults]);

  const enabled = rules.negotiationEnabled ?? sellerDefaults.negotiationEnabled;

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-base font-semibold">Negotiation rules</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Leave a field blank to use your store default. Buyers never see any of this.
      </p>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-fg"
          checked={enabled}
          onChange={(e) => setRules({ negotiationEnabled: e.target.checked })}
        />
        Allow haggling on this product
      </label>

      <div className={cn('mt-4 space-y-4', !enabled && 'pointer-events-none opacity-50')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Minimum margin %"
            hint="Never sell below cost + this. Needs a cost price."
            value={rules.minMarginPct}
            onChange={(v) => setRules({ minMarginPct: v })}
            placeholder="e.g. 20"
          />
          <Field
            label="Maximum discount %"
            hint="Never go more than this far below list."
            value={rules.maxDiscountPct}
            onChange={(v) => setRules({ maxDiscountPct: v })}
            placeholder="e.g. 30"
          />
          <Field
            label="Haggling rounds"
            hint={`Turns before the final offer. Store default: ${sellerDefaults.negotiationMaxTurns}.`}
            value={rules.negotiationMaxTurns}
            onChange={(v) => setRules({ negotiationMaxTurns: v })}
            placeholder={String(sellerDefaults.negotiationMaxTurns)}
          />
          <Field
            label="Bulk discount from (qty)"
            hint="Buying this many or more earns a better unit price."
            value={rules.volumeMinQty}
            onChange={(v) => setRules({ volumeMinQty: v })}
            placeholder="e.g. 3"
          />
        </div>

        <div>
          <Label className="text-xs">
            How eagerly to concede ({(rules.negotiationAggressiveness ?? sellerDefaults.negotiationAggressiveness).toFixed(2)})
          </Label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={rules.negotiationAggressiveness ?? sellerDefaults.negotiationAggressiveness}
            onChange={(e) => setRules({ negotiationAggressiveness: Number(e.target.value) })}
            className="mt-1.5 w-full accent-fg"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Hold firm</span>
            <span>Concede fast</span>
          </div>
        </div>

        <div>
          <Label className="text-xs">Freebie to sweeten a deal (optional)</Label>
          <Input
            className="mt-1"
            value={rules.freebie ?? ''}
            onChange={(e) => setRules({ freebie: e.target.value || null })}
            placeholder="e.g. a spare pair of laces"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            The shopkeeper may offer this instead of cutting the price further.
          </p>
        </div>
      </div>

      {/* The whole point: what the rules actually add up to. */}
      {resolved && (
        <div className="mt-5 border-t border-border pt-4">
          {resolved.misconfiguration ? (
            <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-destructive">These rules cannot work together</div>
                <p className="mt-0.5 text-muted-foreground">{resolved.misconfiguration}</p>
              </div>
            </div>
          ) : !resolved.negotiable ? (
            <p className="text-[13px] text-muted-foreground">
              Haggling is off — this product sells at its list price.
            </p>
          ) : (
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  The AI will never go below{' '}
                  <span className="tabular font-semibold">{formatINR(Math.round(resolved.floor))}</span>
                </span>
              </div>
              <p className="text-muted-foreground">
                Set by <span className="font-medium text-fg">{LABEL[resolved.binding]}</span>. That is{' '}
                <span className="tabular">
                  {Math.round(((sample!.listPrice - resolved.floor) / sample!.listPrice) * 100)}%
                </span>{' '}
                off your list price of{' '}
                <span className="tabular">{formatINR(sample!.listPrice)}</span> in the worst case.
              </p>
              {sample!.costPrice != null && (
                <p className="text-muted-foreground">
                  At that floor you still make{' '}
                  <span className="tabular font-medium text-success">
                    {formatINR(Math.round(resolved.floor - sample!.costPrice))}
                  </span>{' '}
                  per unit.
                </p>
              )}
              {sample!.costPrice == null && (
                <p className="text-[12px] text-muted-foreground">
                  Add a cost price to your variants and the minimum-margin rule will protect you even
                  if the minimum price is set too low.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1"
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(numOrNull(e.target.value))}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
