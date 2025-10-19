// /supabase/functions/simulate-payment/index.ts
//@ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AppError } from "../shared/utils/AppError.ts"
import { corsHeaders } from "../shared/const/corsHeaders.ts";
import { AppResponse } from "../shared/utils/AppResponse.ts";

//@ts-ignore
Deno.serve(async (req)=>{
  // Trata OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    // IMPORTANTE: Esta é uma função de "servidor" ou "admin".
    // Ela deve usar a SERVICE_ROLE_KEY para ter permissão de
    // atualizar qualquer pedido.
    //@ts-ignore
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    // 1. Obter o ID do pedido do corpo da requisição
    // Espera um JSON como: { "order_id": 123 }
    const { order_id, order_status = "paid" } = await req.json();
    if (!order_id) {
      throw AppError.badRequest("The 'order_id' is required");
    }

    // 2. Atualizar o status do pedido
    const { data, error } = await supabaseClient.from("orders").update({
      status: order_status
    }).eq("id", order_id).eq("status", "pending") // Segurança: Só atualiza se ainda estiver pendente
    .select("id, status").single(); // .single() fará o RLS falhar se não encontrar o pedido
    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(404, `Order with ID ${order_id} not found or already processed.`);
      }
      throw error;
    }

    // 3. Sucesso!
    return new AppResponse(200, {
      message: "Order updated to 'paid' successfully!",
      order: data
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
