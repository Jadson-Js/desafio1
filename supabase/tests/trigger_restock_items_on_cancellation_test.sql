BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id) VALUES ('a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6');

INSERT INTO public.products (id, name, price, quantity) VALUES
  (101, 'Laptop Pro', 5000.00, 10),
  (102, 'Wireless Mouse', 150.00, 50);

INSERT INTO public.orders (id, user_id, status, total_price) OVERRIDING SYSTEM VALUE VALUES
  (999, 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6', 'PENDING', 5300.00);

INSERT INTO public.order_items (order_id, product_id, total_quantity, total_price) VALUES
  (999, 101, 1, 5000.00),
  (999, 102, 2, 300.00);

UPDATE public.products SET quantity = 9 WHERE id = 101;
UPDATE public.products SET quantity = 48 WHERE id = 102;

SELECT results_eq(
  $$ SELECT quantity FROM public.products WHERE id = 101 $$,
  $$ VALUES (9) $$,
  'Test 1: Initial state - Laptop stock should be 9 after purchase'
);
SELECT results_eq(
  $$ SELECT quantity FROM public.products WHERE id = 102 $$,
  $$ VALUES (48) $$,
  'Test 2: Initial state - Mouse stock should be 48 after purchase'
);

UPDATE public.orders
SET status = 'FAILED'
WHERE id = 999;

SELECT results_eq(
  $$ SELECT status FROM public.orders WHERE id = 999 $$,
  $$ VALUES ('FAILED'::status_order) $$,
  'Test 3: Order status should be updated to FAILED'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.products WHERE id = 101 $$,
  $$ VALUES (10) $$,
  'Test 4: Trigger should restock Laptop quantity back to 10'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.products WHERE id = 102 $$,
  $$ VALUES (50) $$,
  'Test 5: Trigger should restock Mouse quantity back to 50'
);

SELECT * FROM finish();

ROLLBACK;