-- =============================================================================
--  SCRIPT DE SEED (supabase/seed.sql)
--  Popula o banco de dados local com dados de teste.
--  Executado automaticamente com 'supabase db reset'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USUÁRIOS DE AUTENTICAÇÃO (AUTH)
-- -----------------------------------------------------------------------------
-- Cria um usuário 'admin@admin.com' com senha 'password'
-- UUID: 860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_token, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_sent_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', '860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6', 'authenticated', 'authenticated', 'admin@admin.com', crypt('password', gen_salt('bf')), now(), '', NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', NULL);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6', 'admin@admin.com', '{"sub":"860b604c-4b3f-4e89-9a_id-4e83c4f7b8f6","provider":"email"}', 'email', now(), now(), now());

-- Opcional: Se você tiver uma tabela 'public.profiles' para espelhar os usuários
-- (Descomente se for o caso)
-- INSERT INTO public.profiles (id, full_name)
-- VALUES ('860b604c-4b3f-4e89-9a3d-4e83c4f7b8f6', 'Admin User');


-- -----------------------------------------------------------------------------
-- 2. DADOS PÚBLICOS (public.products)
-- -----------------------------------------------------------------------------

INSERT INTO "public"."products" 
  ("id", "created_at", "updated_at", "name", "price", "quantity") 
VALUES 
  (1, '2025-10-19 13:41:52.333919+00', '2025-10-19 13:41:52.333919+00', 'camiseta', 50, 100), 
  (2, '2025-10-19 13:42:03.390797+00', '2025-10-19 13:42:03.390797+00', 'calca', 100, 100), 
  (3, '2025-10-19 13:42:18.972258+00', '2025-10-19 13:42:18.972258+00', 'sapato', 75, 100);


-- -----------------------------------------------------------------------------
-- 3. SINCRONIZAÇÃO DAS SEQUENCES (CONTADORES DE ID)
-- -----------------------------------------------------------------------------
-- IMPORTANTE: Atualiza o contador de ID da tabela 'products' para o valor
-- mais alto inserido (3), para que o próximo produto criado use o ID 4.

SELECT pg_catalog.setval('"public"."products_id_seq"', (SELECT MAX(id) FROM public.products), true);

-- Adicione mais linhas 'setval' aqui para outras tabelas (ex: orders)
-- se você também inserir IDs manualmente nelas.
-- SELECT pg_catalog.setval('"public"."orders_id_seq"', (SELECT MAX(id) FROM public.orders), true);
-- SELECT pg_catalog.setval('"public"."order_items_id_seq"', (SELECT MAX(id) FROM public.order_items), true);