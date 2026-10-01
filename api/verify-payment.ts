// POST /api/verify-payment
// Body: { userId, razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
// Verifies the Razorpay signature, then marks the user as 'active' in Firestore.

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
    const { userId, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = await request.json();
    if (!userId || !razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return json({ error: 'Missing fields' }, 400);
    }

    const keyId = process.env.RAZORPAY_KEY_ID as string;
    const keySecret = process.env.RAZORPAY_KEY_SECRET as string;

    // 1. Check the signature (proves Razorpay really processed this payment)
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');
    if (!safeEqual(expected, razorpay_signature)) {
      return json({ error: 'Invalid signature' }, 400);
    }

    // 2. Check the subscription really belongs to this user
    const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const subRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpay_subscription_id}`, {
      headers: { Authorization: auth },
    });
    const sub: any = await subRes.json();
    if (!subRes.ok || sub?.notes?.userId !== userId) {
      return json({ error: 'Subscription does not belong to this user' }, 403);
    }

    // 3. Mark as active (Admin SDK bypasses Firestore rules, which is what we want here)
    await getDb().doc(`users/${userId}`).set(
      {
        subscription_status: 'active',
        razorpay_subscription_id,
        razorpay_payment_id,
        subscription_updated_at: Date.now(),
      },
      { merge: true }
    );

    return json({ success: true });
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
