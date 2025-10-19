import { AppError } from "../shared/utils/AppError.ts";
import { AppResponse } from "../shared/utils/AppResponse.ts";
import { corsHeaders } from "../shared/const/corsHeaders.ts";
import { supabaseClient } from "../shared/supabaseClient.ts";
//@ts-ignore
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const logicHandler = async (
  req: Request,
  client: SupabaseClient,
): Promise<Response> => {
  try {
    // 1. A autenticação agora usa o client injetado
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      throw AppError.unauthorized();
    }

    // 2. Validação do body (igual)
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw AppError.badRequest("The item list cannot be empty");
    }

    // 3. CHAMAR A FUNÇÃO SQL (RPC) (usando o client injetado)
    const { data, error } = await client.rpc("create_order", {
      cart_items: items,
    });

    // 4. Tratar erro da chamada RPC (igual)
    if (error) {
      const message = error.message || "Database RPC error";
      throw new AppError(500, message);
    }

    // 5. Tratar erro lógico (igual)
    if (data && data.status === "error") {
      throw AppError.conflict(data.message || "Business logic conflict");
    }

    // 6. Sucesso! (igual)
    return new AppResponse(200, {
      orderId: data.order_id,
      message: "Order created successfully!",
    });
  } catch (error) {
    // 7. Tratamento de erro (igual)
    if (error instanceof AppError) {
      return new AppResponse(error.statusCode, { error: error.message });
    }

    return new AppResponse(500, {
      error: "internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};


export const handler = (req: Request): Promise<Response> => {
  const client = supabaseClient(req);
  return logicHandler(req, client);
};

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // Passa para o handler principal
  return await handler(req);
});