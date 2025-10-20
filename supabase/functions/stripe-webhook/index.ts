import Stripe from "https://esm.sh/stripe@14.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { StatusOrder } from '../shared/const/index.ts'

// Handler extraído para facilitar testes
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

  // Verifique a assinatura do Webhook
  try {
    event = await stripeClient.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    console.error('Falha na verificação da assinatura do Webhook:', err.message);
    return new Response(err.message, { status: 400 });
  }

  // Lide com o evento (somente o que nos interessa)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // Pegamos o ID do nosso pedido que salvamos no metadata
    const supabase_order_id = paymentIntent.metadata.supabase_order_id;

    if (!supabase_order_id) {
      console.error(`PaymentIntent ${paymentIntent.id} sem supabase_order_id no metadata`);
      return new Response(JSON.stringify({ error: 'Missing order ID' }), { status: 400 });
    }

    console.log(`PaymentIntent ${paymentIntent.id} sucedido para o pedido ${supabase_order_id}. Atualizando banco...`);

    // Atualize o status do pedido no Supabase
    const { error } = await supabaseClient
      .from('orders')
      .update({ status: StatusOrder.SUCCESS })
      .eq('id', supabase_order_id);

    if (error) {
      console.error(`Erro ao atualizar pedido ${supabase_order_id}:`, error);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    console.log(`Pedido ${supabase_order_id} atualizado para 'paid'`);
  }

  // Retorne 200 OK para o Stripe saber que recebemos
  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

// Deno.serve handler
Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient()
  });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  return await stripeWebhookHandler(
    req,
    stripe,
    supabaseAdmin,
    webhookSecret
  );
});