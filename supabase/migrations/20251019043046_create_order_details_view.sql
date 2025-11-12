-- Cria ou substitui uma "visão" (um relatório virtual) no esquema público
-- chamada 'user_order_details'.
CREATE OR REPLACE VIEW public.user_order_details
-- CONFIGURAÇÃO DE SEGURANÇA:
-- Isso é VITAL. Significa que a visão será executada com as permissões
-- do usuário que está fazendo a consulta (o "invocador").
-- Se você tem RLS (Row Level Security) que diz "usuário só pode ver seus
-- próprios pedidos", esta linha FAZ com que essa regra seja obedecida.
WITH (security_invoker = true)
AS
-- AS (como): Aqui começa a "receita" da nossa visão.
-- O que ela vai mostrar? O resultado desta consulta SELECT:
SELECT
    -- Seleciona colunas da tabela 'orders' (Pedidos)
    orders.id AS order_id,
    orders.created_at AS order_created_at,
    orders.status AS order_status,
    orders.total_price AS order_total_price,
    
    -- Seleciona colunas da tabela 'order_items' (Itens do Pedido)
    order_items.id AS item_id,
    order_items.total_quantity AS item_quantity,
    order_items.total_price AS item_total_price,
    
    -- Seleciona colunas da tabela 'products' (Produtos)
    products.id AS product_id,
    products.name AS product_name,
    products.price AS product_unit_price
FROM 
    -- 1. Começa pela tabela de Pedidos
    orders
-- 2. Junta ("JOIN") com a tabela de Itens do Pedido
--    Onde o ID do pedido na tabela 'orders' for igual ao 'order_id' na tabela 'order_items'
JOIN 
    order_items ON orders.id = order_items.order_id
-- 3. Junta ("JOIN") com a tabela de Produtos
--    Onde o ID do produto na tabela 'order_items' for igual ao 'id' na tabela 'products'
JOIN 
    products ON order_items.product_id = products.id;

-- ---
-- COMANDO DE PERMISSÃO:
-- ---
-- Concede a permissão de LEITURA (SELECT)
-- sobre a visão (relatório) que acabamos de criar...
-- ...para QUALQUER usuário que esteja LOGADO (função 'authenticated' do Supabase).
GRANT SELECT ON public.user_order_details TO authenticated;