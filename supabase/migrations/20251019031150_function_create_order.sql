/* Cria (ou substitui, se já existir) uma "receita" no banco de dados 
  chamada 'create_order'.
  
  Ela exige um único ingrediente: 'cart_items' (um "pacote" de dados JSON
  contendo a lista de produtos e quantidades do carrinho).
*/
CREATE OR REPLACE FUNCTION public.create_order(cart_items jsonb)
RETURNS  jsonb -- Informa que a receita, no final, vai devolver um "pacote" JSON
LANGUAGE plpgsql -- Informa que a linguagem da receita é plpgsql (a linguagem do PostgreSQL)

/*
  SECURITY DEFINER: ISSO É MUITO IMPORTANTE!
  Significa: "Execute esta receita com os poderes do 'Dono' (Administrador) 
  do banco de dados, e não com os poderes do usuário que a chamou".
  
  Por quê? Porque um usuário comum não pode (e não deve) ter permissão
  para alterar o estoque na tabela 'products' diretamente. Mas o "Dono" pode.
  Isso permite que a função faça seu trabalho com segurança.
*/
SECURITY DEFINER
SET search_path = 'public' -- Garante que o banco procure as tabelas no lugar certo
AS $$
DECLARE
  -- Aqui, "declaramos" (criamos) caixas vazias (variáveis)
  -- para guardar coisas que vamos usar durante a receita.
  
  new_order_id BIGINT; -- Caixa para guardar o ID do novo pedido que vamos criar.
  cart_item RECORD;    -- Caixa para guardar um item do carrinho de cada vez (durante o loop).
  product_info RECORD; -- Caixa para guardar as infos (preço, estoque) de um produto.
  total_price NUMERIC := 0; -- Caixa para calcular o preço total. Começa em zero.

BEGIN
  -- Aqui começa a receita de verdade.

  -- ### 1ª ETAPA: VERIFICAÇÃO (O "PORTEIRO") ###
  -- Antes de fazer qualquer coisa, vamos checar se o pedido é válido.
  -- Vamos olhar item por item do carrinho...
  FOR cart_item IN
    SELECT * FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
  LOOP
    -- ...para cada item, olhamos na tabela 'products' o preço e o estoque.
    SELECT price, quantity INTO product_info
    FROM products
    WHERE id = cart_item.product_id
    FOR UPDATE; -- "TRANCA A LINHA": Isso é crucial. Evita que duas pessoas 
                -- comprem o último item do estoque ao MESMO tempo.
                -- A primeira pessoa que "trancar" tem a preferência.

    -- Se o produto não for encontrado...
    IF NOT FOUND THEN
      -- ...nós "levantamos uma exceção" (GRITAMOS UM ERRO) e paramos tudo.
      RAISE EXCEPTION 'Produto com ID % não encontrado', cart_item.product_id;
    END IF;

    -- Se a quantidade em estoque for MENOR do que o cliente quer comprar...
    IF product_info.quantity < cart_item.quantity THEN
      -- ...nós também GRITAMOS UM ERRO e paramos tudo, avisando qual é o problema.
      RAISE EXCEPTION 'Estoque insuficiente para o produto ID %. Disponível: %, Solicitado: %', cart_item.product_id, product_info.quantity, cart_item.quantity;
    END IF;

    -- Se passou nas duas verificações, calculamos o subtotal (preço * qtd)
    -- e somamos ao preço total do pedido.
    total_price := total_price + (product_info.price * cart_item.quantity);
  END LOOP;
  -- Fim do loop. Se o código chegou até aqui, significa que todos
  -- os produtos existem e têm estoque suficiente.

  -- ### 2ª ETAPA: CRIAR O PEDIDO ###
  -- Agora que sabemos que está tudo OK, criamos o pedido na tabela 'orders'.
  INSERT INTO orders (user_id, status, total_price)
  VALUES (auth.uid(), 'PENDING', total_price) -- auth.uid() é uma mágica do Supabase
                                             -- que pega o ID do usuário logado.
  RETURNING id INTO new_order_id; -- Pega o ID do pedido que acabamos de criar
                                 -- e guarda na nossa "caixa" new_order_id.

  -- ### 3ª ETAPA: VINCULAR OS ITENS AO PEDIDO ###
  -- Cria as linhas na tabela 'order_items' (a "lista de compras" do pedido).
  INSERT INTO order_items (order_id, product_id, total_quantity, total_price)
  SELECT new_order_id, product.id, cart.quantity, (product.price * cart.quantity)
  FROM products product
  -- Pega os dados do carrinho (JSON) e transforma em tabela de novo
  JOIN jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
    ON product.id = cart.product_id; -- Junta com a tabela 'products' para pegar o preço

  -- ### 4ª ETAPA: DAR BAIXA NO ESTOQUE ###
  -- Finalmente, atualizamos a tabela 'products' para remover o que foi comprado.
  UPDATE products product
  SET quantity = product.quantity - cart.quantity -- Estoque = Estoque Atual - Qtd Comprada
  FROM jsonb_to_recordset(cart_items) AS cart(product_id BIGINT, quantity INT)
  WHERE product.id = cart.product_id; -- Faz isso para cada produto do carrinho.

  -- ### 5ª ETAPA: RESPOSTA DE SUCESSO ###
  -- Se tudo deu certo, devolve um "pacote" (JSON) de sucesso
  -- contendo o ID do novo pedido.
  RETURN jsonb_build_object('order_id', new_order_id, 'status', 'SUCCESS');

EXCEPTION
  -- ### A "REDE DE SEGURANÇA" (TRATAMENTO DE ERRO) ###
  -- Se QUALQUER erro acontecer (o estoque acabar, o produto não existir, etc.)...
  WHEN OTHERS THEN
    -- ...o banco de dados AUTOMATICAMENTE DESFAZ TUDO (não cria pedido, 
    -- não mexe no estoque). É como se nada tivesse acontecido.
    
    -- E então, ele devolve um "pacote" (JSON) de erro,
    -- com a mensagem que nós gritamos (Ex: "Estoque insuficiente...").
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;