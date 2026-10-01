// POST /api/razorpay-webhook
// Razorpay Dashboard -> Webhooks -> URL: https://YOUR-APP.vercel.app/api/razorpay-webhook
// Events to tick: subscription.activated, subscription.charged, subscription.halted,
//                 subscription.cancelled, subscription.completed, payment.failed

import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string)) });
  }
  return getFirestore();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text(); // raw body is required for signature check
    const signature = request.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET as string;

    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(raw);
    const sub = event?.payload?.subscription?.entity;
    const userId = sub?.notes?.userId || event?.payload?.payment?.entity?.notes?.userId;
    if (!userId) return new Response('ok (no userId)', { status: 200 });

    const map: Record<string, string> = {
      'subscription.activated': 'active',
      'subscription.charged': 'active',
      'subscription.halted': 'expired',
      'subscription.completed': 'expired',
      'subscription.cancelled': 'cancelled',
      'payment.failed': 'payment_failed',
    };
    const status = map[event.event];
    if (status) {
      await getDb().doc(`users/${userId}`).set(
        { subscription_status: status, subscription_updated_at: Date.now() },
        { merge: true }
      );
    }
    return new Response('ok', { status: 200 });
  } catch (err: any) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
}
