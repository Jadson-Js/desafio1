// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../shared/const/index.ts';
import { supabaseClient } from '../shared/supabaseClient.ts';
import { AppError } from '../shared/utils/AppError.ts';

// Função escapeCSV (sem alterações)
function escapeCSV(val: any) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * --- CORREÇÃO 1 ---
 * O handler agora aceita 'client' como argumento.
 * Use 'any' para simplificar a tipagem com o mock.
 */
export async function handler(req: Request, client: any) {
  try {
    /**
     * --- CORREÇÃO 2 ---
     * Removemos esta linha. Usaremos o 'client' vindo do argumento.
     */
    // const client = supabaseClient(req); 

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      throw AppError.unauthorized("User not authenticated"); 
    }

    const { data, error: dbError } = await client
      .from('user_order_details')
      .select('*');

    if (dbError) throw dbError;

    // ... (O resto do seu 'try' block está perfeito) ...
    const headers = [
      'order_id', 'order_created_at', 'order_status', 'order_total_price',
      'item_id', 'item_quantity', 'item_total_price', 'product_id',
      'product_name', 'product_unit_price',
    ];
    let csvContent = headers.join(',') + '\n';
    for (const row of data) {
      const csvRow = [
        escapeCSV(row.order_id),
        escapeCSV(row.order_created_at),
        escapeCSV(row.order_status),
        escapeCSV(row.order_total_price),
        escapeCSV(row.item_id),
        escapeCSV(row.item_quantity),
        escapeCSV(row.item_total_price),
        escapeCSV(row.product_id),
        escapeCSV(row.product_name),
        escapeCSV(row.product_unit_price),
      ];
      csvContent += csvRow.join(',') + '\n';
    }
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${timestamp}.csv`;
    const headersWithFile = {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    return new Response(csvContent, { headers: headersWithFile });

  } catch (error) {
    // ... (Seu 'catch' block está perfeito) ...
    if (error instanceof AppError) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.statusCode,
      });
    }
    let errorMessage = "An unexpected error occurred.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

/**
 * --- CORREÇÃO 3 ---
 * O 'serve' agora cria o cliente real e o "injeta" no handler.
 */
serve((req: Request) => {
  const client = supabaseClient(req); // O cliente real é criado aqui
  return handler(req, client);        // E passado para o handler
});