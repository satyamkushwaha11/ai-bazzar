import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { verifyWebhookSignature } from '@/server/services/razorpay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(raw, sig)) return new Response('Invalid signature', { status: 401 });

  const event = JSON.parse(raw) as { event: string; payload: Record<string, { entity: Record<string, unknown> }> };

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment?.entity as { order_id: string; id: string; amount: number } | undefined;
    if (payment) {
      const record = await prisma.payment.findUnique({ where: { providerOrderId: payment.order_id } });
      if (record && record.status !== 'CAPTURED') {
        await prisma.$transaction([
          prisma.payment.update({
            where: { providerOrderId: payment.order_id },
            data: { providerPaymentId: payment.id, status: 'CAPTURED', rawPayload: event as never },
          }),
          prisma.order.update({ where: { id: record.orderId }, data: { status: 'PAID' } }),
        ]);
      }
    }
  }
  return Response.json({ ok: true });
}
