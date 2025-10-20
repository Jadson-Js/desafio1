// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.0.0";
import { stripeSecretKey, supabaseAnonKey, supabaseUrl } from "../shared/const/index.ts";
import { AppError } from "../shared/utils/AppError.ts";
import { AppResponse } from "../shared/utils/AppResponse.ts";

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-08-16" });

// Handler extraído para facilitar testes
export const paymentHandler = async (
  req: Request,
  supabaseClient: any,
  stripeClient: any
) => {
  let body: { order_id?: unknown };
  
  try {
    body = await req.json();
  } catch {
    throw AppError.badRequest("Invalid JSON body");
  }

  const { order_id } = body;
  
  if (!order_id) {
    throw AppError.badRequest("order_id is required");
  }

  // Fetch order from Supabase
  const { data: order, error } = await supabaseClient
    .from("orders")
    .select("total_price")
    .eq("id", order_id)
    .single();

  if (error || !order) {
    throw AppError.notFound("order not found");
  }

  // Create Stripe payment intent
  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: order.total_price,
    currency: "brl",
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "never",
    },
    metadata: {
      supabase_order_id: order_id,
    },
  });

  return new AppResponse(200, {
    client_secret: paymentIntent.client_secret,
  });
};

// @ts-ignore
Deno.serve(async (req) => {
  try {
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    return await paymentHandler(req, supabaseClient, stripe);
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: error.statusCode,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});