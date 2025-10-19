-- Arquivo: supabase/migrations/xxxxxxxx_create_order_details_view.sql

-- 1. Cria a VIEW
-- Esta view junta as tabelas.
-- Adicionamos 'WITH (security_invoker = true)'
-- Isso garante que a view seja executada com as permissões do usuário
-- que a está chamando, respeitando a RLS da tabela 'orders'.
CREATE OR REPLACE VIEW public.user_order_details
WITH (security_invoker = true) -- <<< ISSO É IMPORTANTE
AS
SELECT
    orders.id AS order_id,
    orders.created_at AS order_created_at,
    orders.status AS order_status,
    orders.total_price AS order_total_price,
    
    order_items.id AS item_id,
    order_items.total_quantity AS item_quantity,
    order_items.total_price AS item_total_price,
    
    products.id AS product_id,
    products.name AS product_name,
    products.price AS product_unit_price
    
FROM 
    orders
JOIN 
    order_items ON orders.id = order_items.order_id
JOIN 
    products ON order_items.product_id = products.id;


-- 2. Habilita a RLS na TABELA BASE 'orders'
-- É AQUI que a RLS deve ser habilitada, não na view.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;


-- 3. Cria a Política de Segurança na TABELA BASE 'orders'
-- A view 'user_order_details' irá respeitar esta política automaticamente.
DROP POLICY IF EXISTS "Permite ao usuário ver apenas seus próprios pedidos" 
ON public.orders;

CREATE POLICY "Permite ao usuário ver apenas seus próprios pedidos"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);


-- 4. Garante que usuários logados possam LER a view
GRANT SELECT ON public.user_order_details TO authenticated;