BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Declares that we will have 14 tests in our suite
SELECT plan(14);

---------------------------------------------------------------------
-- 1. SETUP: Mock data insertion
---------------------------------------------------------------------

-- Insert a mock user to satisfy the foreign key in the orders table
INSERT INTO auth.users (id, email) 
VALUES ('123e4567-e89b-12d3-a456-426614174000', 'testuser@example.com');

-- Insert mock products into the stock
INSERT INTO public.products (id, name, price, quantity)
VALUES 
  (10, 'Gaming Mouse', 150.00, 20),
  (20, 'Mechanical Keyboard', 300.00, 5),
  (30, 'Ultrawide Monitor', 1200.00, 0);

-- Set the session context to run tests as the mock user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '123e4567-e89b-12d3-a456-426614174000';

---------------------------------------------------------------------
-- 2. TEST: Success Scenario (1 item)
---------------------------------------------------------------------
-- Try to create a valid order
SELECT is(
  create_order('[{"product_id": 10, "quantity": 2}]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 1: Should create an order successfully (status)'
);

-- Check if the order was created in the 'orders' table with the correct total price
SELECT results_eq(
  $$ SELECT user_id, status, total_price FROM orders WHERE total_price = 300.00 $$,
  $$ VALUES ('123e4567-e89b-12d3-a456-426614174000'::uuid, 'PENDING'::status_order, 300.00::numeric) $$,
  'Test 2: Table "orders" should contain the correct order (2x Mouse)'
);

-- Check if the order items were created in the 'order_items' table
SELECT results_eq(
  $$ 
    SELECT product_id, total_quantity, total_price 
    FROM order_items 
    WHERE order_id = (SELECT id FROM orders WHERE total_price = 300.00 LIMIT 1)
  $$,
  $$ VALUES (10::bigint, 2::int, 300.00::numeric) $$,
  'Test 3: "order_items" table should contain the correct items'
);

-- Check if the product stock was correctly reduced
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (18) $$, -- Initial stock was 20, bought 2
  'Test 4: Stock for product 10 should be reduced to 18'
);

---------------------------------------------------------------------
-- 3. TEST: Failure Scenario (Insufficient Stock)
---------------------------------------------------------------------
-- Try to buy 10 units of the Keyboard (only 5 in stock)
SELECT is(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'status',
  'error',
  'Test 5: Should return "error" for insufficient stock'
);

-- Check the specific error message
SELECT matches(
  create_order('[{"product_id": 20, "quantity": 10}]'::jsonb) ->> 'message',
  '^Estoque insuficiente para o produto ID 20',
  'Test 6: Should return the correct stock error message'
);

-- ROLLBACK VERIFICATION (Important!): 
-- Ensure no order was created on failure
SELECT is_empty(
  $$ SELECT * FROM orders WHERE total_price = 3000.00 $$,
  'Test 7: No order should be created in case of stock failure'
);

-- Ensure stock was not altered on failure
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (5) $$, -- Should remain 5
  'Test 8: Stock should not be changed on failure'
);


---------------------------------------------------------------------
-- 4. TEST: Failure Scenario (Product Not Found)
---------------------------------------------------------------------
SELECT is(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'status',
  'error',
  'Test 9: Should return "error" for non-existent product'
);

-- Check the specific error message (using 'matches' function to avoid conflict)
SELECT matches(
  create_order('[{"product_id": 999, "quantity": 1}]'::jsonb) ->> 'message',
  '^Produto com ID 999 não encontrado',
  'Test 10: Should return the correct "not found" error message'
);


---------------------------------------------------------------------
-- 5. TEST: Success Scenario (Multiple Items)
---------------------------------------------------------------------
-- Order: 1x Mouse ($150) + 1x Keyboard ($300) = $450
-- Initial stock: Mouse (18), Keyboard (5)
-- Final stock: Mouse (17), Keyboard (4)
SELECT is(
  create_order('[
    {"product_id": 10, "quantity": 1}, 
    {"product_id": 20, "quantity": 1}
  ]'::jsonb) ->> 'status',
  'SUCCESS',
  'Test 11: Should successfully create an order with multiple items'
);

-- NEW TEST: Check the total price of the new order
SELECT results_eq(
  $$ SELECT total_price FROM orders WHERE total_price = 450.00 $$,
  $$ VALUES (450.00::numeric) $$,
  'Test 12: Total price for multiple items should be 450.00'
);

-- NEW TEST: Check the stock of the FIRST item
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 10 $$,
  $$ VALUES (17) $$, -- Stock was 18, bought 1 more
  'Test 13: Stock for product 10 should be reduced to 17'
);

-- NEW TEST: Check the stock of the SECOND item
SELECT results_eq(
  $$ SELECT quantity FROM products WHERE id = 20 $$,
  $$ VALUES (4) $$, -- Stock was 5, bought 1
  'Test 14: Stock for product 20 should be reduced to 4'
);


-- Finish the tests
SELECT * FROM finish();

-- Undo all changes made to the database
ROLLBACK;
