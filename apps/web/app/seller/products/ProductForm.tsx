'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';
import type { SellerDefaults } from '@/server/ai/rules';
import { NegotiationRules, type RulesState } from './NegotiationRules';

interface VariantForm {
  sku: string;
  attrsRaw: string; // "color:Red,size:9"
  stock: number;
  listPrice: number;
  minPrice: number;
  /** What it costs you. Private — powers the profit floor. */
  costPrice: number | null;
}

interface InitialProduct extends RulesState {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  images: string[];
  variants: VariantForm[];
}

const NEW_VARIANT: VariantForm = {
  sku: '',
  attrsRaw: '',
  stock: 1,
  listPrice: 999,
  minPrice: 700,
  costPrice: null,
};

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split(':').map((s) => s.trim());
      if (k && v) out[k] = v;
    });
  return out;
}

export function ProductForm({
  initial,
  sellerDefaults = { negotiationEnabled: true, negotiationAggressiveness: 0.5, negotiationMaxTurns: 4 },
}: {
  initial?: InitialProduct;
  sellerDefaults?: SellerDefaults;
}) {
  const router = useRouter();
  const cats = trpc.catalog.categories.useQuery();
  const upsert = trpc.seller.upsertProduct.useMutation();
  const del = trpc.seller.deleteProduct.useMutation();

  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [brand, setBrand] = React.useState(initial?.brand ?? '');
  const [categoryId, setCategoryId] = React.useState<string | undefined>(initial?.categoryId ?? undefined);
  const [status, setStatus] = React.useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>(initial?.status ?? 'DRAFT');
  const [imagesRaw, setImagesRaw] = React.useState(initial?.images.join('\n') ?? '');
  const [variants, setVariants] = React.useState<VariantForm[]>(initial?.variants ?? [NEW_VARIANT]);
  const [rules, setRulesState] = React.useState<RulesState>({
    negotiationEnabled: initial?.negotiationEnabled ?? null,
    minMarginPct: initial?.minMarginPct ?? null,
    maxDiscountPct: initial?.maxDiscountPct ?? null,
    negotiationAggressiveness: initial?.negotiationAggressiveness ?? null,
    negotiationMaxTurns: initial?.negotiationMaxTurns ?? null,
    volumeMinQty: initial?.volumeMinQty ?? null,
    freebie: initial?.freebie ?? null,
  });

  const setRules = (patch: Partial<RulesState>) => setRulesState((r) => ({ ...r, ...patch }));

  function setVariant(i: number, v: Partial<VariantForm>) {
    setVariants((arr) => arr.map((x, j) => (i === j ? { ...x, ...v } : x)));
  }

  async function onSave() {
    try {
      const id = await upsert.mutateAsync({
        id: initial?.id,
        title,
        description,
        brand: brand || undefined,
        categoryId,
        status,
        images: imagesRaw.split('\n').map((s) => s.trim()).filter(Boolean),
        variants: variants.map((v) => ({
          sku: v.sku,
          attrs: parseAttrs(v.attrsRaw),
          stock: v.stock,
          listPrice: v.listPrice,
          minPrice: v.minPrice,
          costPrice: v.costPrice,
        })),
        ...rules,
      });
      toast.success('Saved');
      router.push('/seller/products');
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to save');
    }
  }

  // The preview is computed against the first variant — enough to show which
  // rule binds without cluttering the panel with one readout per SKU.
  const sample = variants[0]
    ? {
        listPrice: variants[0].listPrice,
        minPrice: variants[0].minPrice,
        costPrice: variants[0].costPrice,
      }
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Basics</h2>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AeroRun Pro Running Shoes" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  value={categoryId ?? ''}
                  onChange={(e) => setCategoryId(e.target.value || undefined)}
                  className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-soft"
                >
                  <option value="">— None —</option>
                  {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 text-base font-semibold">Images</h2>
          <p className="mb-3 text-xs text-muted-foreground">One URL per line. (Connect UploadThing for drag-and-drop in production.)</p>
          <Textarea rows={4} value={imagesRaw} onChange={(e) => setImagesRaw(e.target.value)} placeholder="https://..." />
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Variants & pricing</h2>
            <Button size="sm" variant="outline" onClick={() => setVariants((v) => [...v, NEW_VARIANT])}>
              <Plus className="h-3 w-3" /> Add variant
            </Button>
          </div>
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="rounded-lg border border-dashed border-border p-3">
                {/* Spans must total 12 — they summed to 14, wrapping Cost onto its own row. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                  <Input className="sm:col-span-2" placeholder="SKU" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                  <Input className="sm:col-span-3" placeholder="color:Black, size:9" value={v.attrsRaw} onChange={(e) => setVariant(i, { attrsRaw: e.target.value })} />
                  <Input className="sm:col-span-1" type="number" placeholder="Stk" value={v.stock} onChange={(e) => setVariant(i, { stock: Number(e.target.value) })} />
                  <Input className="sm:col-span-2" type="number" placeholder="List ₹" value={v.listPrice} onChange={(e) => setVariant(i, { listPrice: Number(e.target.value) })} />
                  <Input className="sm:col-span-2" type="number" placeholder="Min ₹" value={v.minPrice} onChange={(e) => setVariant(i, { minPrice: Number(e.target.value) })} />
                  <Input
                    className="sm:col-span-2"
                    type="number"
                    placeholder="Cost ₹"
                    value={v.costPrice ?? ''}
                    onChange={(e) => setVariant(i, { costPrice: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                {variants.length > 1 && (
                  <Button size="icon" variant="ghost" className="ml-auto mt-1 flex h-7 w-7" onClick={() => setVariants((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              <strong>Min ₹</strong> and <strong>Cost ₹</strong> are private — buyers never see them, and
              the AI is never told them. Cost is optional but recommended: with a minimum margin it
              guarantees you cannot be haggled into a loss even if Min ₹ is set too low by mistake.
            </p>
          </div>
        </Card>

        <NegotiationRules
          rules={rules}
          setRules={setRules}
          sellerDefaults={sellerDefaults}
          sample={sample}
        />
      </div>

      <Card className="h-max p-6">
        <h2 className="mb-3 text-base font-semibold">Publish</h2>
        <Label>Status</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'ACTIVE' | 'ARCHIVED')}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-soft"
        >
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <Button onClick={onSave} disabled={upsert.isPending} className="mt-4 w-full">
          {upsert.isPending ? 'Saving…' : 'Save product'}
        </Button>
        {initial?.id && (
          <Button
            variant="ghost"
            className="mt-2 w-full text-destructive"
            onClick={async () => {
              if (!confirm('Delete this product?')) return;
              await del.mutateAsync({ id: initial.id });
              toast.success('Deleted');
              router.push('/seller/products');
            }}
          >
            Delete product
          </Button>
        )}

        {/*
          The old "typical lock ≈ midpoint" estimate lived here. It was a guess,
          and it is now wrong: the engine concedes on reciprocity, so a buyer who
          just refuses gets nothing near the midpoint. The Negotiation rules card
          shows the real resolved floor from the same function the engine uses —
          one honest number beats two conflicting ones.
        */}
        <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-fg">Pricing tip</div>
          A 30–40% gap between min and list gives the AI room to close most deals without hurting
          margin. Buyers only earn a discount by making real offers — refusing gets them nothing.
          {variants[0] && variants[0].listPrice > 0 && (
            <div className="mt-2">
              This product lists at{' '}
              <span className="tabular font-medium text-fg">{formatINR(variants[0].listPrice)}</span>.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
