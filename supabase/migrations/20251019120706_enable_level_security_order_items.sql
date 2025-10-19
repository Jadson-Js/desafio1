ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable users to view their own data only"
ON public.order_items
FOR SELECT
TO authenticated
USING 
  (order_id IN 
  ( SELECT orders.id FROM orders WHERE (orders.user_id = auth.uid())));