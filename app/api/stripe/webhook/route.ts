import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/utils/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'subscription') return NextResponse.json({ received: true });

    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    await supabase.from('subscriptions').upsert({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: stripeSubscription.status === 'active' ? 'active' : stripeSubscription.status,
      current_period_end: new Date((stripeSubscription as any).current_period_end * 1000).toISOString(),
    }, { onConflict: 'stripe_customer_id' });
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    await supabase.from('subscriptions').update({
      status: sub.status === 'active' ? 'active' : sub.status,
      current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
    }).eq('stripe_subscription_id', sub.id);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await supabase.from('subscriptions').update({
      status: 'canceled',
    }).eq('stripe_subscription_id', sub.id);
  }

  return NextResponse.json({ received: true });
}
