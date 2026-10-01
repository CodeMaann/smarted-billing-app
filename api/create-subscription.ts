// POST /api/create-subscription
// Body: { userId, email }  ->  { subscriptionId }

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, email } = await request.json();
    if (!userId) return json({ error: 'userId is required' }, 400);

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const planId = process.env.RAZORPAY_PLAN_ID;
    if (!keyId || !keySecret || !planId) {
      return json({ error: 'Server is missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_PLAN_ID' }, 500);
    }

    const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const rzpRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120, // max billing cycles (10 years of monthly billing)
        customer_notify: 1,
        notes: { userId, email: email || '' },
      }),
    });

    const data: any = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error('Razorpay error:', data);
      return json({ error: data?.error?.description || 'Razorpay rejected the request' }, rzpRes.status);
    }
    return json({ subscriptionId: data.id });
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
