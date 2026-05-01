import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // If the caller supplies the Stripe checkout session ID we can look up the
  // subscription directly — no timing race and no customer-list guesswork.
  const { session_id } = await request.json().catch(() => ({}));

  if (session_id) {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    const sub = session.subscription as Stripe.Subscription | null;
    if (!sub) {
      return NextResponse.json({ status: 'incomplete' });
    }

    await admin.from('subscriptions').update({
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
    }).eq('user_id', user.id);

    return NextResponse.json({ status: sub.status });
  }

  // Fallback: look up by customer ID stored in the subscriptions table
  const { data: record } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (!record?.stripe_customer_id) {
    return NextResponse.json({ error: 'No customer found' }, { status: 404 });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: record.stripe_customer_id,
    status: 'all',
    limit: 1,
  });

  const sub = subscriptions.data[0];

  if (!sub) {
    return NextResponse.json({ status: 'inactive' });
  }

  await admin.from('subscriptions').update({
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
  }).eq('user_id', user.id);

  return NextResponse.json({ status: sub.status });
}
