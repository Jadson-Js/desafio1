//@ts-ignore
export const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
//@ts-ignore
export const supabaseServiceRoleKey = Deno.env.get("SUPABASE_URL") ?? ""
//@ts-ignore
export const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? ""

export const StatusOrder = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};