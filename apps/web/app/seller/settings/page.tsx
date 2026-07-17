'use client';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';

export default function SellerSettingsPage() {
  const utils = trpc.useUtils();
  const me = trpc.seller.me.useQuery();
  const update = trpc.seller.updateStore.useMutation({
    onSuccess: () => { utils.seller.me.invalidate(); toast.success('Saved'); },
  });

  const [storeName, setStoreName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [aggressiveness, setAggressiveness] = React.useState(0.5);
  const [maxTurns, setMaxTurns] = React.useState(4);

  React.useEffect(() => {
    if (me.data) {
      setStoreName(me.data.storeName);
      setBio(me.data.bio ?? '');
      setEnabled(me.data.negotiationEnabled);
      setAggressiveness(me.data.negotiationAggressiveness);
      setMaxTurns(me.data.negotiationMaxTurns);
    }
  }, [me.data]);

  return (
    <div>
      <PageHeader title="Store settings" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-3 text-base font-semibold">Store profile</h2>
          <div className="space-y-3">
            <div><Label>Store name</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></div>
            <div><Label>Bio</Label><Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
            <Button onClick={() => update.mutate({ storeName, bio })} disabled={update.isPending}>
              Save profile
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-3 text-base font-semibold">AI negotiation policy</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="text-sm">Allow buyers to negotiate</span>
            </label>
            <div>
              <div className="flex justify-between">
                <Label>Aggressiveness</Label>
                <span className="text-xs text-muted-foreground">{(aggressiveness * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={aggressiveness}
                onChange={(e) => setAggressiveness(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                0 = hold firm near list. 1 = concede quickly toward your min.
              </p>
            </div>
            <div>
              <Label>Max turns</Label>
              <Input type="number" min={1} max={8} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
              <p className="mt-1 text-xs text-muted-foreground">
                After this many buyer turns, AI gives a take-it-or-leave-it FINAL offer.
              </p>
            </div>
            <Button
              onClick={() =>
                update.mutate({
                  negotiationEnabled: enabled,
                  negotiationAggressiveness: aggressiveness,
                  negotiationMaxTurns: maxTurns,
                })
              }
              disabled={update.isPending}
            >
              Save policy
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
