CREATE OR REPLACE FUNCTION public.create_order(cart_items jsonb)
RETURNS  jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_order_id BIGINT;
  cart_item RECORD;
  product_info RECORD;
  total_price NUMERIC := 0;
BEGIN
  -- Validação
  FOR cart_item IN
    SELECT * FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
  LOOP
    SELECT price, quantity INTO product_info
    FROM products
    WHERE id = cart_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto com ID % não encontrado', cart_item.product_id;
    END IF;

    IF product_info.quantity < cart_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto ID %. Disponível: %, Solicitado: %', cart_item.product_id, product_info.quantity, cart_item.quantity;
    END IF;

    total_price := total_price + (product_info.price * cart_item.quantity);
  END LOOP;

  INSERT INTO orders (user_id, status, total_price)
  VALUES (auth.uid(), 'PENDING', total_price)
  RETURNING id INTO new_order_id;

  INSERT INTO order_items (order_id, product_id, total_quantity, total_price)
  SELECT new_order_id, product.id, cart.quantity, (product.price * cart.quantity)
  FROM products product
  JOIN jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
    ON product.id = cart.product_id;


  UPDATE products product
  SET quantity = product.quantity - cart.quantity
  FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
  WHERE product.id = cart.product_id;

  RETURN jsonb_build_object('order_id', new_order_id, 'status', 'SUCCESS');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;