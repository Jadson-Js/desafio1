// @ts-ignore
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseAnonKey, supabaseUrl } from "./const/index.ts";

export function supabaseClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  // @ts-ignore
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  return client;
}