CREATE OR REPLACE VIEW public.user_order_details
WITH (security_invoker = true)
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
    
GRANT SELECT ON public.user_order_details TO authenticated;