// /supabase/functions/simulate-payment/index.ts

import { AppError } from "../shared/utils/AppError.ts";
import { AppResponse } from "../shared/utils/AppResponse.ts";
import { corsHeaders } from "../shared/const/corsHeaders.ts";
// Importamos o cliente ADMIN (Service Role) do arquivo shared
import { adminSupabaseClient } from "../shared/supabaseClient.ts";
//@ts-ignore
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StatusOrder } from "../shared/const/statusOrder.ts";

interface RequestBody {
  order_id: string | number;
  order_status?: string;
}

/**
 * Contém a lógica de negócio principal.
 * Recebe o 'client' por injeção de dependência para ser testável.
 * Neste caso, esperamos o 'adminSupabaseClient'.
 */
export const logicHandler = async (
  req: Request,
  client: SupabaseClient, // O client injetado será o adminSupabaseClient
): Promise<Response> => {
  try {
    // 1. Validação do body
    const { order_id, order_status = StatusOrder.SUCCESS }: RequestBody = await req.json();
    if (!order_id) {
      throw AppError.badRequest("The 'order_id' is required.");
    }

    // 2. Atualizar o status do pedido (usando o client admin injetado)
    const { data, error } = await client
      .from("orders")
      .update({ status: order_status })
      .eq("id", order_id)
      .eq("status", StatusOrder.PENDING) // Segurança: Só atualiza se ainda estiver pendente
      .select("id, status")
      .single(); // Lança erro (PGRST116) se não encontrar

    // 3. Tratar erro da chamada (RPC)
    if (error) {
      if (error.code === 'PGRST116') {
        // .single() falhou em encontrar
        throw new AppError(404, `Order with ID ${order_id} not found or already processed.`);
      }
      // Loga o erro real para debug
      console.error("Supabase database error:", error.message);
      // Retorna uma mensagem genérica
      throw new AppError(500, "Database error processing the order.");
    }

    // 4. Sucesso!
    return new AppResponse(200, {
      message: `Order ${order_id} updated to '${order_status}' successfully!`,
      order: data,
    });
  } catch (error) {
    // 5. Tratamento de erro centralizado
    if (error instanceof SyntaxError) {
      return new AppResponse(400, { error: "Invalid JSON format." });
    }
    
    if (error instanceof AppError) {
      return new AppResponse(error.statusCode, { error: error.message });
    }

    console.error("Internal Server Error:", error);
    return new AppResponse(500, {
      error: "internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Handler de Injeção de Dependência.
 * Responsável por obter as dependências (o client) e
 * passá-las para o logicHandler.
 */
export const handler = (req: Request): Promise<Response> => {
  // Injetamos o cliente ADMIN (service_role), pois esta
  // função não depende do usuário que a chamou.
  return logicHandler(req, adminSupabaseClient);
};

// @ts-ignore
Deno.serve(async (req) => {
  // Handler de Preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // Passa para o handler principal que cuida da injeção
  return await handler(req);
});