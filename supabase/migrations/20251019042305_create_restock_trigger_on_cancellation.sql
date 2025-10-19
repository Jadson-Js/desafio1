
-- Primeiro, se você já tiver um trigger com esse nome, remova-o
DROP TRIGGER IF EXISTS handle_order_cancellation ON public.orders;

-- Cria o novo trigger
CREATE TRIGGER handle_order_cancellation
-- Dispara DEPOIS que a atualização for concluída
AFTER UPDATE ON public.orders
FOR EACH ROW
-- CONDIÇÃO: Só execute a função se a mudança de status for de 'pending' para 'canceled'
WHEN (OLD.status = 'pending' AND NEW.status = 'canceled')
-- A função que deve ser executada
EXECUTE FUNCTION public.restock_items_on_cancellation();