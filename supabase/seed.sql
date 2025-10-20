INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_token, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_sent_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', '860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6', 'authenticated', 'authenticated', 'admin@admin.com', crypt('password', gen_salt('bf')), now(), '', NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', NULL);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6', 'admin@admin.com', '{"sub":"860b604c-4b3f-4e89-9a_id-4e83c4f7b8f6","provider":"email"}', 'email', now(), now(), now());

INSERT INTO "public"."products" 
  ("id", "created_at", "updated_at", "name", "price", "quantity") 
VALUES 
  (1, '2025-10-19 13:41:52.333919+00', '2025-10-19 13:41:52.333919+00', 'camiseta', 50, 100), 
  (2, '2025-10-19 13:42:03.390797+00', '2025-10-19 13:42:03.390797+00', 'calca', 100, 100), 
  (3, '2025-10-19 13:42:18.972258+00', '2025-10-19 13:42:18.972258+00', 'sapato', 75, 100);

SELECT pg_catalog.setval('"public"."products_id_seq"', (SELECT MAX(id) FROM public.products), true);