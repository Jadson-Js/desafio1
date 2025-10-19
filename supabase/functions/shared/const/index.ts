export const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
export const supabaseServiceRoleKey = Deno.env.get("SUPABASE_URL") ?? ""

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