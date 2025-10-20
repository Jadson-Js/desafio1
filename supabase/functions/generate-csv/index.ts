// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../shared/const/index.ts';
import { supabaseClient } from '../shared/supabaseClient.ts';
import { AppError } from '../shared/utils/AppError.ts';

function escapeCSV(val: any) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function handler(req: Request, client: any) {
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      throw AppError.unauthorized("User not authenticated"); 
    }

    const { data, error: dbError } = await client
      .from('user_order_details')
      .select('*');

    if (dbError) throw dbError;

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

serve((req: Request) => {
  const client = supabaseClient(req);
  return handler(req, client);
});