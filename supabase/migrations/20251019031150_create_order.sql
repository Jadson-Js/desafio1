CREATE OR REPLACE FUNCTION public.create_order(cart_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_order_id BIGINT;
  item RECORD;
  product_info RECORD;
  total_price NUMERIC := 0;
BEGIN
  -- 1. Loop de verificação, cálculo de preço e trava
  FOR item IN 
    SELECT * FROM jsonb_to_recordset(cart_items) AS item(product_id BIGINT, quantity INT)
  LOOP
    -- 2. Trava a linha do produto e obtém dados
    --    CORRIGIDO: Seleciona 'stock_quantity' e 'price'
    SELECT price, quantity INTO product_info
    FROM products
    WHERE id = item.product_id
    FOR UPDATE; -- Trava esta linha até o fim da transação

    -- 3. Verifica se o produto existe
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto com ID % não encontrado', item.product_id;
    END IF;

    -- 4. Verifica o estoque
    --    CORRIGIDO: Acessa 'product_info.stock_quantity'
    IF product_info.quantity < item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto ID %. Disponível: %, Solicitado: %', item.product_id, product_info.quantity, item.quantity;
    END IF;

    -- 5. Acumula o preço total
    total_price := total_price + (product_info.price * item.quantity);
  END LOOP;

  -- 6. Cria o Pedido (Orders)
  INSERT INTO orders (user_id, status, total_price)
  VALUES (auth.uid(), 'pending', total_price)
  RETURNING id INTO new_order_id;

  -- 7. OTIMIZADO: Insere os itens do pedido em lote (uma única query)
  INSERT INTO order_items (order_id, product_id, quantity, total_price)
  SELECT new_order_id, p.id, item.quantity, (p.price * item.quantity)
  FROM products p
  JOIN jsonb_to_recordset(cart_items) AS item(product_id BIGINT, quantity INT) 
    ON p.id = item.product_id;
    
  -- 8. OTIMIZADO: Subtrai o estoque em lote (uma única query)
  --    CORRIGIDO: Atualiza 'stock_quantity'
  UPDATE products p
  SET quantity = p.quantity - item.quantity
  FROM jsonb_to_recordset(cart_items) AS item(product_id BIGINT, quantity INT)
  WHERE p.id = item.product_id;

  -- 9. Sucesso! Retorna o ID do pedido.
  RETURN jsonb_build_object('order_id', new_order_id, 'status', 'success');

EXCEPTION
  -- 10. Se qualquer 'RAISE EXCEPTION' acontecer, tudo é desfeito (rollback).
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;