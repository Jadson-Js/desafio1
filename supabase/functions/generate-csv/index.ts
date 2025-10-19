import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// Cabeçalhos CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};
// Função auxiliar para escapar dados para CSV
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
serve(async (req)=>{
  // Trata a requisição OPTIONS (pre-flight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 1. AUTENTICAÇÃO
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 2. CONSULTA AO BANCO (SEGURA)
    // ESTA É A PARTE ATUALIZADA
    // Buscamos orders -> order_items -> products
    const { data: orders, error: dbError } = await supabaseClient.from('orders').select(`
        id,
        created_at,
        status,
        total_price, 
        order_items (
          id,
          total_quantity,
          total_price,
          products (
            id,
            name,
            price
          )
        )
      `).eq('user_id', user.id) // A GARANTIA DE SEGURANÇA
    ;
    if (dbError) throw dbError;
    // 3. FORMATAÇÃO DO CSV
    // CABEÇALHOS ATUALIZADOS
    const headers = [
      'order_id',
      'order_created_at',
      'order_status',
      'order_total_price',
      'item_id',
      'product_id',
      'product_name',
      'product_unit_price',
      'item_quantity',
      'item_total_price' // Total do item (qtd * preço)
    ];
    let csvContent = headers.join(',') + '\n';
    // Itera sobre cada pedido
    for (const order of orders){
      // Itera sobre cada item dentro do pedido
      for (const item of order.order_items){
        // LINHA DO CSV ATUALIZADA
        const row = [
          escapeCSV(order.id),
          escapeCSV(order.created_at),
          escapeCSV(order.status),
          escapeCSV(order.total_price),
          escapeCSV(item.id),
          escapeCSV(item.products?.id),
          escapeCSV(item.products?.name),
          escapeCSV(item.products?.price),
          escapeCSV(item.quantity),
          escapeCSV(item.total_price) // Preço total do item
        ];
        csvContent += row.join(',') + '\n';
      }
    }
    // 4. RETORNO DO ARQUIVO
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${timestamp}.csv`;
    const headersWithFile = {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    };
    return new Response(csvContent, {
      headers: headersWithFile
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
