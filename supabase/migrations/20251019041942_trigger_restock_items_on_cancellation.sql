CREATE OR REPLACE FUNCTION public.restock_items_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.products
  SET
    quantity = public.products.quantity + oi.total_quantity
  FROM
    public.order_items AS oi
  WHERE
    public.products.id = oi.product_id
    AND
    oi.order_id = NEW.id;

  RETURN NEW;
END;
$$;
