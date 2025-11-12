-- --- INICIA UMA TRANSAÇÃO ---
-- O 'BEGIN' e o 'ROLLBACK' (no final) são a parte mais importante de um teste.
-- Eles criam um "ambiente seguro". Tudo o que fizermos aqui (INSERTs, UPDATEs)
-- será DESFEITO no final. O banco de dados voltará ao estado original.
BEGIN;

-- Garante que a extensão 'pgtap' (a ferramenta de teste) esteja
-- disponível para uso neste script.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Define o "plano de testes". Estamos dizendo ao pgtap:
-- "Eu espero rodar exatamente 14 testes. Se mais ou menos testes
-- rodarem, o teste geral deve falhar."
SELECT plan(14);

-- ---
-- DADOS DE TESTE (SETUP)
-- ---

-- Cria um usuário "falso" de teste na tabela de autenticação
-- para que possamos simular que ele está fazendo o pedido.
INSERT INTO auth.users (id, email) 
VALUES ('123e4567-e89b-12d3-a456-426614174000', 'testuser@example.com');

-- Insere produtos "falsos" no nosso catálogo para podermos "comprá-los"
-- nos testes. Note os estoques: 20, 5 e 0 (para testar diferentes casos).
INSERT INTO public.products (id, name, price, quantity)
VALUES 
  (10, 'Gaming Mouse', 150.00, 20),
  (20, 'Mechanical Keyboard', 300.00, 5),
  (30, 'Ultrawide Monitor', 1200.00, 0);

-- ---
-- SIMULAÇÃO DE USUÁRIO LOGADO
-- ---
-- A partir daqui, estamos "vestindo a capa" de um usuário logado.

-- Muda a "permissão" (role) da sessão atual para 'authenticated'.
SET LOCAL ROLE authenticated;

-- Define QUAL usuário está logado. Isso faz com que a função auth.uid()
-- retorne o ID do nosso usuário de teste.
SET LOCAL request.jwt.claim.sub = '123e4567-e89b-12d3-a456-426614174000';

-- ---
-- INÍCIO DOS TESTES
-- ---

-- --- TESTE 1-4: CAMINHO FELIZ (SUCESSO) ---
-- Testa se a função 'create_order' funciona em condições ideais.

-- Teste 1:
-- Chama a função 'create_order' e verifica se o campo 'status'
-- do JSON retornado é exatamente 'SUCCESS'.
SELECT is(
  create_order('[{"product_id": 10, "quantity": 2}]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 1: Should create an order successfully (status)'
);

-- Teste 2:
-- Verifica se o pedido foi realmente salvo na tabela 'orders'
-- com os dados corretos (user_id, status e preço total de 300.00).
SELECT results_eq(
  $$ SELECT user_id, status, total_price FROM orders WHERE total_price = 300.00 $$,
  $$ VALUES ('123e4567-e89b-12d3-a456-426614174000'::uuid, 'PENDING'::status_order, 300.00::numeric) $$,
  'Test 2: Table "orders" should contain the correct order (2x Mouse)'
);

-- Teste 3:
-- Verifica se os *itens* do pedido foram salvos corretamente
-- na tabela 'order_items'.
SELECT results_eq(
  $$ 
    SELECT product_id, total_quantity, total_price 
    FROM order_items 
    WHERE order_id = (SELECT id FROM orders WHERE total_price = 300.00 LIMIT 1)
  $$,
  $$ VALUES (10::bigint, 2::int, 300.00::numeric) $$,
  'Test 3: "order_items" table should contain the correct items'
);

-- Teste 4:
-- Verifica se o estoque do produto (ID 10) foi reduzido corretamente.
-- Começou com 20, comprou 2, deve sobrar 18.
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (18) $$,
  'Test 4: Stock for product 10 should be reduced to 18'
);

-- --- TESTE 5-8: FALHA (ESTOQUE INSUFICIENTE) ---
-- Testa o que acontece se o usuário tentar comprar mais do que temos.

-- Teste 5:
-- Tenta comprar 10 teclados (ID 20), mas só temos 5.
-- Espera que o 'status' retornado seja 'error'.
SELECT is(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'status',
  'error',
  'Test 5: Should return "error" for insufficient stock'
);

-- Teste 6:
-- Verifica se a *mensagem de erro* de estoque insuficiente está correta.
-- 'matches' é usado para checar o início da string (regex).
SELECT matches(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'message',
  '^Estoque insuficiente para o produto ID 20',
  'Test 6: Should return the correct stock error message'
);

-- Teste 7:
-- GARANTIA: Verifica se NENHUM pedido foi criado na tabela 'orders'
-- após a falha de estoque (procurando pelo preço de 10x300=3000).
SELECT is_empty(
  $$ SELECT * FROM orders WHERE total_price = 3000.00 $$,
  'Test 7: No order should be created in case of stock failure'
);

-- Teste 8:
-- GARANTIA: Verifica se o estoque do teclado (ID 20) NÃO mudou
-- e continua sendo 5, já que a transação falhou.
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (5) $$,
  'Test 8: Stock should not be changed on failure'
);

-- --- TESTE 9-10: FALHA (PRODUTO INEXISTENTE) ---

-- Teste 9:
-- Tenta comprar um produto (ID 999) que não existe. Espera 'error'.
SELECT is(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'status',
  'error',
  'Test 9: Should return "error" for non-existent product'
);

-- Teste 10:
-- Verifica se a mensagem de erro "não encontrado" está correta.
SELECT matches(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'message',
  '^Produto com ID 999 não encontrado',
  'Test 10: Should return the correct "not found" error message'
);

-- --- TESTE 11-14: SUCESSO (MÚLTIPLOS ITENS) ---
-- Testa um pedido com mais de um produto diferente.

-- Teste 11:
-- Compra 1 Mouse (ID 10) e 1 Teclado (ID 20). Espera 'SUCCESS'.
SELECT is(
  create_order('[
    {"product_id": 10, "quantity": 1}, 
    {"product_id": 20, "quantity": 1}
  ]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 11: Should successfully create an order with multiple items'
);

-- Teste 12:
-- Verifica se o preço total do pedido está correto (150 + 300 = 450).
SELECT results_eq(
  $$ SELECT total_price FROM orders WHERE total_price = 450.00 $$,
  $$ VALUES (450.00::numeric) $$,
  'Test 12: Total price for multiple items should be 450.00'
);

-- Teste 13:
-- Verifica o estoque do produto 10. Tinha 18 (do Teste 4), comprou 1,
-- deve ser 17.
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (17) $$,
  'Test 13: Stock for product 10 should be reduced to 17'
);

-- Teste 14:
-- Verifica o estoque do produto 20. Tinha 5 (do Teste 8), comprou 1,
-- deve ser 4.
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (4) $$,
  'Test 14: Stock for product 20 should be reduced to 4'
);

-- ---
-- FINALIZAÇÃO
-- ---

-- Informa ao pgtap que os testes acabaram. Ele vai conferir
-- se os 14 testes do "plano" foram executados.
SELECT * FROM finish();

-- --- DESFAZ TUDO (LIMPEZA) ---
-- Desfaz TODAS as alterações (INSERTs, UPDATEs) feitas desde o 'BEGIN'.
-- O banco de dados volta ao estado original, limpo para o próximo teste.
ROLLBACK;