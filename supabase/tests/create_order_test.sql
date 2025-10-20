BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

INSERT INTO auth.users (id, email) 
VALUES ('123e4567-e89b-12d3-a456-426614174000', 'testuser@example.com');

INSERT INTO public.products (id, name, price, quantity)
VALUES 
  (10, 'Gaming Mouse', 150.00, 20),
  (20, 'Mechanical Keyboard', 300.00, 5),
  (30, 'Ultrawide Monitor', 1200.00, 0);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '123e4567-e89b-12d3-a456-426614174000';

SELECT is(
  create_order('[{"product_id": 10, "quantity": 2}]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 1: Should create an order successfully (status)'
);

SELECT results_eq(
  $$ SELECT user_id, status, total_price FROM orders WHERE total_price = 300.00 $$,
  $$ VALUES ('123e4567-e89b-12d3-a456-426614174000'::uuid, 'PENDING'::status_order, 300.00::numeric) $$,
  'Test 2: Table "orders" should contain the correct order (2x Mouse)'
);

SELECT results_eq(
  $$ 
    SELECT product_id, total_quantity, total_price 
    FROM order_items 
    WHERE order_id = (SELECT id FROM orders WHERE total_price = 300.00 LIMIT 1)
  $$,
  $$ VALUES (10::bigint, 2::int, 300.00::numeric) $$,
  'Test 3: "order_items" table should contain the correct items'
);

SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (18) $$,
  'Test 4: Stock for product 10 should be reduced to 18'
);

SELECT is(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'status',
  'error',
  'Test 5: Should return "error" for insufficient stock'
);

SELECT matches(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'message',
  '^Estoque insuficiente para o produto ID 20',
  'Test 6: Should return the correct stock error message'
);

SELECT is_empty(
  $$ SELECT * FROM orders WHERE total_price = 3000.00 $$,
  'Test 7: No order should be created in case of stock failure'
);

SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (5) $$,
  'Test 8: Stock should not be changed on failure'
);

SELECT is(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'status',
  'error',
  'Test 9: Should return "error" for non-existent product'
);

SELECT matches(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'message',
  '^Produto com ID 999 não encontrado',
  'Test 10: Should return the correct "not found" error message'
);

SELECT is(
  create_order('[
    {"product_id": 10, "quantity": 1}, 
    {"product_id": 20, "quantity": 1}
  ]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 11: Should successfully create an order with multiple items'
);

SELECT results_eq(
  $$ SELECT total_price FROM orders WHERE total_price = 450.00 $$,
  $$ VALUES (450.00::numeric) $$,
  'Test 12: Total price for multiple items should be 450.00'
);

SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (17) $$,
  'Test 13: Stock for product 10 should be reduced to 17'
);

SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (4) $$,
  'Test 14: Stock for product 20 should be reduced to 4'
);

SELECT * FROM finish();

ROLLBACK;