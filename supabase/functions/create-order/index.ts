// @ts-ignore
import { AppError } from "../shared/utils/AppError.ts"
import { AppResponse } from "../shared/utils/AppResponse.ts";
import { corsHeaders } from "../shared/const/corsHeaders.ts";
import { supabaseClient } from "../shared/supabaseClient.ts";

// @ts-ignore
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {
    const client = supabaseClient(req)

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      throw AppError.unauthorized();
    }

    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw AppError.badRequest("The item list cannot be empty");
    }

    // 4. CHAMAR A FUNÇÃO SQL (RPC)
    const { data, error } = await client.rpc("create_order", {
      cart_items: items
    });

    // 5. Tratar erro da chamada RPC (ex: rede, permissão)
    if (error) {
      throw new AppError(500, error.message);
    }

    // 6. Tratar erro lógico retornado PELA FUNÇÃO
    if (data.status === "error") {
      // Erros de lógica de negócio (como estoque) são 409 Conflict
      throw AppError.conflict(data.message);
    }

    // 7. Sucesso!
    return new AppResponse(200, {
      orderId: data.order_id,
      message: "Order created successfully!"
    })
  } catch (error) {
    if (error instanceof AppError) {
      return new AppResponse(error.statusCode, { error: error.message });
    }
  
    return new AppResponse(500, { 
      error: "internal server error", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});
