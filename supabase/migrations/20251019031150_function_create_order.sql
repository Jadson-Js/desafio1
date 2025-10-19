CREATE OR REPLACE FUNCTION public.create_order(cart_items jsonb) -- Cria uma função chamada create_orde  que recebe o parametro cart_items como jsonb
RETURNS  jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE -- Declara-se a variaveis e tipos que serão usadas na função
  new_order_id BIGINT; -- Tipo Inteiro grande
  cart_item RECORD; -- Tipo generico para referir a row do DB
  product_info RECORD;
  total_price NUMERIC := 0;
BEGIN
  -- Validação
  FOR cart_item IN -- Vai criar um loop para percorrer cada linha da query
    -- Selecione tudo do card_items (convertido em RECORD) como 
    SELECT * FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT) 
  LOOP
    SELECT price, quantity INTO product_info
    FROM products
    WHERE id = cart_item.product_id 
    FOR UPDATE; 

    -- Valida se o item informado existe
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto com ID % não encontrado', cart_item.product_id;
    END IF;

    -- Valida se a quantidade requisitada é menor que o stock
    IF product_info.quantity < cart_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto ID %. Disponível: %, Solicitado: %', cart_item.product_id, product_info.quantity, cart_item.quantity;
    END IF;

    -- Foi delcarado do loop, agora vai acumular até o final do loop
    total_price := total_price + (product_info.price * cart_item.quantity);
  END LOOP;

  -- Insere dentro do order um user_id, status e preço total. Retorne o id deste order e guarde na variavel new_order_id
  INSERT INTO orders (user_id, status, total_price)
  VALUES (auth.uid(), 'PENDING', total_price)
  RETURNING id INTO new_order_id;

  -- Insere os itens do pedido na tabela order_items, incluindo:
  INSERT INTO order_items (order_id, product_id, total_quantity, total_price)
  -- O JOIN combina cada item do carrinho (cart_items) com a tabela products,
  -- garantindo que só sejam inseridos produtos existentes no banco e usando o preço atual.
  SELECT new_order_id, product.id, cart.quantity, (product.price * cart.quantity)
  FROM products product
  JOIN jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT) 
    ON product.id = cart.product_id;

    

  UPDATE products product
  SET quantity = product.quantity - cart_item.quantity
  FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
  WHERE product.id = cart.product_id;

  RETURN jsonb_build_object('order_id', new_order_id, 'status', 'SUCCESS');
EXCEPTION
  -- 10. Rollback
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;