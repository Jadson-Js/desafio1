
DROP TRIGGER IF EXISTS handle_order_cancellation ON public.orders;
CREATE TRIGGER handle_order_cancellation
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status = 'failed')
EXECUTE FUNCTION public.restock_items_on_cancellation();