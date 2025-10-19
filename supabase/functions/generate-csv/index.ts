// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Cabeçalhos CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Função auxiliar para escapar dados para CSV
function escapeCSV(val: any) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

serve(async (req: Request) => {
  // Trata a requisição OPTIONS (pre-flight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. AUTENTICAÇÃO
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // @ts-ignore
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. CONSULTA AO BANCO (AGORA USANDO A VIEW)
    // A RLS (Row Level Security) na VIEW 'user_order_details'
    // cuida da segurança automaticamente, filtrando pelo user_id.
    const { data, error: dbError } = await supabaseClient
      .from('user_order_details') // <-- MUDANÇA PRINCIPAL AQUI
      .select('*');                 // <-- Pega todas as colunas já formatadas

    if (dbError) throw dbError;

    // 3. FORMATAÇÃO DO CSV (AGORA COM UM LOOP SIMPLES)
    // Os headers batem com os aliases da VIEW
    const headers = [
      'order_id',
      'order_created_at',
      'order_status',
      'order_total_price',
      'item_id',
      'item_quantity', // <-- Veio de order_items.total_quantity
      'item_total_price',
      'product_id',
      'product_name',
      'product_unit_price', // <-- Veio de products.price
    ];
    
    let csvContent = headers.join(',') + '\n';

    // O loop aninhado foi substituído por um loop único
    // 'data' já é um array plano com todas as linhas
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

    // 4. RETORNO DO ARQUIVO
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${timestamp}.csv`;
    const headersWithFile = {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    
    return new Response(csvContent, { headers: headersWithFile });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});