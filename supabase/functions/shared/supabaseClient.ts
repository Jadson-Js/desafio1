// @ts-ignore
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function supabaseClient (req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  //@ts-ignore
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization")
      }
    }
  });
}

