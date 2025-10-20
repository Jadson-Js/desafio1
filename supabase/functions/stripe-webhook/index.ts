//@ts-ignore
import Stripe from "https://esm.sh/stripe@14.0.0";
//@ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { StatusOrder } from '../shared/const/index.ts'

export const stripeWebhookHandler = async (
  req: Request,
  stripeClient: any,
  supabaseClient: any,
  webhookSecret: string
) => {
  let body: string;
  
  try {
    body = await req.text();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = await stripeClient.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    return new Response(err.message, { status: 400 });
  }

  // Handle the event (only what interests us)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    const supabase_order_id = paymentIntent.metadata.supabase_order_id;

    if (!supabase_order_id) {
      return new Response(JSON.stringify({ error: 'Missing order ID' }), { status: 400 });
    }


    const { error } = await supabaseClient
      .from('orders')
      .update({ status: StatusOrder.SUCCESS })
      .eq('id', supabase_order_id);

    if (error) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

//@ts-ignore
Deno.serve(async (req) => {
  //@ts-ignore
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  //@ts-ignore
  const stripeWebHookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  //@ts-ignore
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  //@ts-ignore
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!stripeSecretKey || !stripeWebHookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient()
  });

  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey
  );

  return await stripeWebhookHandler(
    req,
    stripe,
    supabaseAdmin,
    stripeWebHookSecret
  );
});