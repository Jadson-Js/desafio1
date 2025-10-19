// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AppError } from "../shared/AppError.ts"
import { AppResponse } from "../shared/AppResponse.ts";
import { corsHeaders } from "../const/corsHeaders.ts";

// @ts-ignore
Deno.serve(async (req)=>{
  // Trata a requisição OPTIONS (pré-voo) do CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {
    // 1. Criar o Supabase Client
    //@ts-ignore
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization")
        }
      }
    });

    // 2. Autenticação
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw AppError.unauthorized();
    }

    // 3. Obter e validar os itens do corpo da requisição
    const { items } = await req.json(); // Espera: [{ product_id, quantity }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw AppError.badRequest("The item list cannot be empty");
    }

    // 4. CHAMAR A FUNÇÃO SQL (RPC)
    const { data, error } = await supabaseClient.rpc("create_order", {
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
      error: "Erro interno no servidor", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});
