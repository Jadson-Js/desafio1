import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { stripeSecretKey } from "../shared/const/index.ts";


const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-08-16" });

Deno.serve(async (req) => {
  const { order_id } = await req.json();
  if (!order_id)
    return new Response(JSON.stringify({ error: "order_id é obrigatório" }), { status: 400 });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );

  const { data: order, error } = await supabaseClient
    .from("orders")
    .select("total_price")
    .eq("id", order_id)
    .single();

  if (error || !order)
    return new Response(JSON.stringify({ error: "Pedido não encontrado" }), { status: 404 });

  const paymentIntent = await stripe.paymentIntents.create({
      amount: order.total_price,
      currency: 'brl',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never' // <-- Adicione esta linha
      },
      metadata: {
        supabase_order_id: order_id
      }
    })

  return new Response(
    JSON.stringify({ client_secret: paymentIntent.client_secret }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
