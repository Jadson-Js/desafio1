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
  -- 1. Loop de verificação (Variável do loop é 'item')
  --    Usando o alias 'x' para o recordset para evitar ambiguidade AQUI
  FOR item IN 
    SELECT * FROM jsonb_to_recordset(cart_items) AS x(product_id BIGINT, quantity INT)
  LOOP
    -- 2. Trava a linha do produto
    SELECT price, quantity INTO product_info
    FROM products
    WHERE id = item.product_id -- 'item' refere-se à variável do loop
    FOR UPDATE; 

    -- 3. Verifica se o produto existe
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto com ID % não encontrado', item.product_id;
    END IF;

    -- 4. Verifica o estoque
    IF product_info.quantity < item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto ID %. Disponível: %, Solicitado: %', item.product_id, product_info.quantity, item.quantity;
    END IF;

    -- 5. Acumula o preço total
    total_price := total_price + (product_info.price * item.quantity);
  END LOOP;

  -- 6. Cria o Pedido (Orders)
  INSERT INTO orders (user_id, status, total_price)
  VALUES (auth.uid(), 'PENDING', total_price)
  RETURNING id INTO new_order_id;

  -- 7. OTIMIZADO: Insere os itens do pedido em lote
  --    CORRIGIDO: Usando o alias 'cart_item' para o recordset
  INSERT INTO order_items (order_id, product_id, total_quantity, total_price)
  SELECT new_order_id, p.id, cart_item.quantity, (p.price * cart_item.quantity)
  FROM products p
  JOIN jsonb_to_recordset(cart_items) AS cart_item(product_id BIGINT, quantity INT) 
    ON p.id = cart_item.product_id; -- 'cart_item' refere-se ao alias
    
  -- 8. OTIMIZADO: Subtrai o estoque em lote
  --    CORRIGIDO: Usando o alias 'cart_item' para o recordset
  UPDATE products p
  SET quantity = p.quantity - cart_item.quantity
  FROM jsonb_to_recordset(cart_items) AS cart_item(product_id BIGINT, quantity INT)
  WHERE p.id = cart_item.product_id; -- 'cart_item' refere-se ao alias

  -- 9. Sucesso!
  RETURN jsonb_build_object('order_id', new_order_id, 'status', 'SUCCESS');

EXCEPTION
  -- 10. Rollback
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;