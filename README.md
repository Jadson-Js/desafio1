# Backend Escribo - Teste Técnico Supabase

Este repositório contém a solução para o teste técnico de Desenvolvedor Júnior/Estagiário, focado na construção de um backend de e-commerce utilizando Supabase.

O projeto implementa a estrutura de banco de dados, regras de segurança (RLS), funções de banco de dados (RPC) e Edge Functions para gerenciar clientes, produtos e um fluxo de pedidos atômico.

## 1\. Visão Geral e Arquitetura

A arquitetura deste backend foi desenhada com foco em **segurança** e **integridade de dados**. A decisão principal foi **não permitir mutações (INSERT, UPDATE, DELETE) diretas via API padrão do Supabase** nas tabelas críticas (`orders`, `order_items`).

Toda a lógica de negócio (criação de pedidos, atualização de status, decremento de estoque) é encapsulada em **Funções SQL (RPC)**, que são chamadas exclusivamente por **Edge Functions** autenticadas. Isso cria uma camada de API segura, controlada e atômica.

## 2\. Features Implementadas

- [x] **Estrutura de Tabelas:** `products`, `orders`, `order_items`.
- [x] **Segurança Avançada (RLS):**
  - Leitura de produtos aberta ao público.
  - Leitura de pedidos e perfis restrita apenas ao próprio usuário (`auth.uid()`).
  - Bloqueio total de `INSERT`, `UPDATE`, `DELETE` diretos nas tabelas de pedidos.
- [x] **Funções de Banco de Dados (SQL/RPC):**
  - Função atômica `create_order` para garantir a consistência do pedido, itens do pedido e estoque.
  - Funções para lidar com webhooks de pagamento (sucesso e falha).
- [x] **Views:** Uma `VIEW` para facilitar a consulta de dados para exportação CSV.
- [x] **Edge Functions:**
  - `create-order`: Endpoint seguro para clientes criarem novos pedidos.
  - `create-payment-intent`: Integração com Stripe para iniciar pagamentos.
  - `generate-csv`: Endpoint para exportar os pedidos do cliente autenticado.
- [x] **Testes Automatizados:** Testes unitários para Edge Functions (Deno) e testes para funções SQL (`supabase db test`).
- [x] **Migrações:** Todo o schema, RLS e funções estão versionados na pasta `supabase/migrations`.

## 3\. Estrutura do Banco de Dados

### 3.1. Schema (Tabelas)

O schema é composto por três tabelas principais:

```sql
-- Tabela para armazenar os produtos disponíveis
CREATE TABLE public.products (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT '0'::numeric,
  quantity integer NOT NULL DEFAULT 0, -- Controla o estoque
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- Tabela principal de pedidos, ligada ao usuário autenticado
CREATE TABLE public.orders (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  status status_order NOT NULL DEFAULT 'PENDING'::status_order, -- ENUM (PENDING, SUCCESS, FAILED)
  total_price numeric NOT NULL DEFAULT '0'::numeric,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Tabela pivô para ligar produtos a pedidos
CREATE TABLE public.order_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  order_id bigint NOT NULL,
  product_id bigint NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT '0'::numeric, -- Preço no momento da compra
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
```

### 3.2. Funções de Banco de Dados (RPC)

- **`create_order (items JSONB)`:**

  - Esta é a função principal da aplicação, garantindo **atomicidade**.
  - Ela roda em uma única transação.
  - Cria a `orders` e suas respectivas `order_items`.
  - Calcula o `total_price` do pedido com base nos preços atuais dos produtos.
  - Decrementa a quantidade (`quantity`) da tabela `products` (controle de estoque).
  - Se qualquer etapa falhar (ex: falta de estoque), toda a transação é revertida (ROLLBACK).

- **Funções de Webhook (Stripe):**

  - **`handle_payment_success (order_id)`:** Chamada pelo webhook do Stripe em caso de pagamento bem-sucedido. Altera o `status` do pedido para `SUCCESS`.
  - **`handle_payment_failed (order_id)`:** Chamada em caso de falha. Altera o `status` para `FAILED` e invoca outra função para **reabastecer o estoque**, devolvendo as quantidades de `order_items` para a tabela `products`.

### 3.3. Views

- **`orders_csv_view` (Nome fictício, ajuste conforme o seu):**
  - Uma `VIEW` foi criada para simplificar a consulta de dados pela Edge Function `generate-csv`.
  - Ela provavelmente faz `JOIN` entre `orders`, `order_items` e `products` para retornar um formato "achatado" dos dados do pedido, facilitando a conversão para CSV.

## 4\. Segurança (Row-Level Security - RLS)

A estratégia de RLS é "negar por padrão" e habilitar apenas o necessário.

1.  **Mutação de Dados (INSERT, UPDATE, DELETE):**

    - **DESABILITADO** para todas as tabelas (`orders`, `order_items`).
    - A única forma de modificar dados é através das Funções SQL (RPC) chamadas pelas Edge Functions, que possuem privilégios de `security_invoker` ou rodam como `service_role`.

2.  **Leitura de Dados (SELECT):**

    - **`products`:** Política pública (`USING (true)`). Qualquer pessoa, autenticada ou não, pode ver os produtos.
    - **`orders`:** Habilitada para `authenticated`. A política `USING (auth.uid() = user_id)` garante que um usuário só possa ler os _seus próprios_ pedidos.
    - **`profiles` (ou similar):** Habilitada para `authenticated`. A política `USING (auth.uid() = id)` garante que um usuário só possa ver/editar _seu próprio_ perfil.

## 5\. Edge Functions (API Endpoints)

- **`POST /functions/v1/create-order`**

  - **Autenticação:** Obrigatória (Bearer Token).
  - **Corpo (Body):** `{ "items": [{ "product_id": 1, "quantity": 2 }] }`
  - **Ação:** Pega o `user_id` do token JWT e o `items` do corpo. Chama a função SQL `create_order` para iniciar o pedido de forma atômica.

- **`POST /functions/v1/create-payment-intent`**

  - **Autenticação:** Obrigatória (Bearer Token).
  - **Corpo (Body):** `{ "order_id": "7" }`
  - **Ação:** Integra-se com a API do Stripe para criar uma intenção de pagamento para um pedido existente.

- **`POST /functions/v1/generate-csv`**

  - **Autenticação:** Obrigatória (Bearer Token).
  - **Ação:** Pega o `user_id` do token. Consulta a `VIEW` de pedidos (filtrando por esse usuário) e retorna um arquivo CSV com o histórico de pedidos.

## 6\. Como Configurar e Rodar (Local)

### Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado.
- [Deno](https://deno.land/) (para testes de Edge Functions).
- Docker (necessário para o Supabase CLI).

### Passos para Execução

1.  **Iniciar os serviços do Supabase:**
    _(Certifique-se que o Docker esteja em execução)_

    ```bash
    supabase start
    ```

2.  **Aplicar as migrações e popular dados (se houver seed):**
    _O comando `db reset` irá apagar dados locais e recriar o banco a partir das migrações._

    ```bash
    supabase db reset
    ```

3.  **Servir as Edge Functions localmente:**
    _Crie um arquivo `.env` em `./supabase/.env` com suas chaves (Stripe, etc.)_

    ```bash
    supabase functions serve --env-file ./supabase/.env
    ```

O ambiente local estará disponível, e o Supabase Studio pode ser acessado em `http://localhost:54323`.

## 7\. Como Testar (API Endpoints)

Use as requisições cURL abaixo (ou um cliente API como Postman/Insomnia) para testar o fluxo.

**Substitua as variáveis:**

- `[SEU_PROJECT_URL]`: URL do seu projeto Supabase (ex: `https://zxbthhcnjkcmryvyiijn.supabase.co` ou `http://localhost:54321` para local)
- `[SUA_ANON_KEY]`: A chave `anon` do seu projeto.
- `[SEU_USER_TOKEN]`: O `access_token` obtido após o login.

---

**1. Criar um novo usuário (Sign Up):**

```bash
curl --request POST \
 --url [SEU_PROJECT_URL]/auth/v1/signup \
 --header 'Content-Type: application/json' \
 --header 'apiKey: [SUA_ANON_KEY]' \
 --data '{
"email": "teste@exemplo.com",
"password": "senha123"
}'
```

---

**2. Fazer Login (Obter Token):**

```bash
curl --request POST \
 --url '[SEU_PROJECT_URL]/auth/v1/token?grant_type=password' \
 --header 'Content-Type: application/json' \
 --header 'apiKey: [SUA_ANON_KEY]' \
 --data '{
"email": "teste@exemplo.com",
"password": "senha123"
}'
```

_(Copie o `access_token` da resposta para usar como `[SEU_USER_TOKEN]`)_

---

**3. Criar um Pedido:**

```bash
curl --request POST \
 --url [SEU_PROJECT_URL]/functions/v1/create-order \
 --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
 --header 'Content-Type: application/json' \
 --header 'apiKey: [SUA_ANON_KEY]' \
 --data '{
"items": [
  { "product_id": 1, "quantity": 2 },
  { "product_id": 2, "quantity": 1 }
]
}'
```

---

**4. Criar Intenção de Pagamento (Stripe):**
_(Assumindo que o pedido criado acima tenha `id: 7`)_

```bash
curl --request POST \
 --url [SEU_PROJECT_URL]/functions/v1/create-payment-intent \
 --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
 --header 'Content-Type: application/json' \
 --header 'apiKey: [SUA_ANON_KEY]' \
 --data '{
"order_id": "7"
}'
```

---

**5. Exportar CSV dos Pedidos:**

```bash
curl --request POST \
 --url [SEU_PROJECT_URL]/functions/v1/generate-csv \
 --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
 --header 'Content-Type: application/json' \
 --header 'apiKey: [SUA_ANON_KEY]'
```

## 8\. Fluxo de Teste Prático (End-to-End)

Esta seção descreve um fluxo completo, desde a criação do usuário até a simulação de pagamento via Stripe CLI.

**Substitua as variáveis:**

- `SUPABASE_URL` → no **Dashboard do projeto Supabase** → Settings → API → URL
- `SUPABASE_ANON_KEY` → Dashboard → Settings → API → anon key
- `SUPABASE_SERVICE_ROLE_KEY` → Dashboard → Settings → API → service_role key
- `STRIPE_PUBLIC_KEY` → Dashboard Stripe → Developers → API Keys → Publishable key
- `STRIPE_SECRET_KEY` → Dashboard Stripe → Developers → API Keys → Secret key
- `STRIPE_WEBHOOK_SECRET` → Dashboard Stripe → Developers → Webhooks → Your endpoint → Reveal secret

---

**1. Preparação do Ambiente:**
Certifique-se de que o Docker esteja em execução (se rodando local) e que você tenha o [Stripe CLI](https://stripe.com/docs/stripe-cli) instalado e configurado.

**2. Preparar Terminais:**
Abra dois terminais.

- **Terminal 1:** Será usado para os comandos `curl`.
- **Terminal 2:** Será usado para o Stripe CLI.

**3. Configurar Secrets:**
Certifique-se de que suas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `STRIPE_SECRET_KEY` estejam configuradas no Supabase (seja no `.env` local ou no dashboard do projeto).

**4. Criar Usuário (Sign Up):**
_(Este passo assume que a confirmação de e-mail está desabilitada para o teste, ou que você irá confirmá-lo)_

```bash
curl --request POST \
  --url [SEU_PROJECT_URL]/auth/v1/signup \
  --header 'Content-Type: application/json' \
  --header 'apiKey: [SUA_ANON_KEY]' \
  --data '{
 "email": "teste.fluxo@exemplo.com",
 "password": "admin123"
}'
```

**5. Confirmação de E-mail:**
Se a confirmação de e-mail estiver habilitada, acesse o e-mail (no Inbucket local: `http://localhost:54324` ou no seu provedor) e confirme a conta.

**6. Fazer Login (Obter Token):**
Execute este comando para obter o `access_token`.

```bash
curl --request POST \
  --url '[SEU_PROJECT_URL]/auth/v1/token?grant_type=password' \
  --header 'Content-Type: application/json' \
  --header 'apiKey: [SUA_ANON_KEY]' \
  --data '{
 "email": "teste.fluxo@exemplo.com",
 "password": "admin123"
}'
```

**-\> Guarde o `access_token` retornado.**

**7. Popular Produtos (Manual):**
Acesse o Supabase Studio (local ou remoto) e, na tabela `products`, adicione manualmente pelo menos dois produtos para o teste (ex: `product_id: 1` e `product_id: 2`), garantindo que eles tenham estoque (`quantity`) suficiente.

**8. Criar um Pedido:**
Use o token do passo 6 para criar um pedido.

```bash
curl --request POST \
  --url [SEU_PROJECT_URL]/functions/v1/create-order \
  --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
  --header 'Content-Type: application/json' \
  --header 'apiKey: [SUA_ANON_KEY]' \
  --data '{
  "items": [
    { "product_id": 1, "quantity": 3 },
    { "product_id": 2, "quantity": 1 }
  ]
}'
```

**-\> Guarde o `orderId` retornado na resposta.**

**9. Criar Intenção de Pagamento:**
Use o `orderId` do passo 8.

```bash
curl --request POST \
  --url [SEU_PROJECT_URL]/functions/v1/create-payment-intent \
  --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
  --header 'Content-Type: application/json' \
  --header 'apiKey: [SUA_ANON_KEY]' \
  --data '{
  "order_id": "[SEU_ORDER_ID]"
}'
```

**-\> Guarde o ID do Payment Intent (ex: `pi_...`) que está dentro do `client_secret` retornado.**

**10. Iniciar Webhook Listener (Terminal 2):**
No seu segundo terminal, faça login no Stripe CLI e inicie o listener para encaminhar eventos para sua Edge Function.

```bash
# Primeiro, faça login (se ainda não fez)
stripe login

# Inicie o listener
stripe listen --forward-to [SEU_PROJECT_URL]/functions/v1/stripe-webhook
```

**11. Simular Confirmação de Pagamento (Terminal 2):**
Use o Payment Intent ID (`pi_...`) do passo 9 para simular uma confirmação de pagamento com um cartão de teste.

```bash
# Use o ID do Payment Intent (pi_...)
stripe payment_intents confirm [SEU_PAYMENT_INTENT_ID] --payment-method pm_card_visa
```

- Observe o **Terminal 2**: Você deverá ver os eventos do Stripe (como `payment_intent.succeeded`) sendo recebidos e encaminhados.
- Verifique no Supabase Studio: O `status` do seu pedido na tabela `orders` deve mudar para `SUCCESS`.

**12. Gerar Planilha CSV (Terminal 1):**
Após o pagamento bem-sucedido, você pode testar a exportação de CSV.

```bash
curl --request POST \
  --url [SEU_PROJECT_URL]/functions/v1/generate-csv \
  --header 'Authorization: Bearer [SEU_USER_TOKEN]' \
  --header 'Content-Type: application/json' \
  --header 'apiKey: [SUA_ANON_KEY]'
```

_(Isso deve retornar um conteúdo CSV contendo os detalhes do pedido confirmado.)_

## 9\. Testes Automatizados

O projeto inclui testes unitários para as Edge Functions e testes para as funções SQL.

```bash
# Rodar testes de Edge Functions (Deno)
deno test --allow-net

# Rodar testes de banco de dados (pgTAP)
supabase db test
```

## 10\. Decisões de Design Adicionais

- **Triggers para `updated_at`:** Utilizei triggers em todas as tabelas para atualizar automaticamente o campo `updated_at`, facilitando a auditoria.
- **Gatilho de Estoque:** Implementei um gatilho para garantir que o estoque (`products.quantity`) se mantenha sempre coerente (ex: não ficar negativo).
- **Supabase CLI:** O uso do CLI foi essencial para permitir o versionamento de todo o schema do banco de dados (`supabase/migrations`), facilitando o deploy e o desenvolvimento em equipe.

## 11\. Melhorias Futuras

Se houvesse mais tempo, as seguintes funcionalidades seriam adicionadas:

- **RBAC (Role-Based Access Control):** Implementar um sistema de permissões para diferenciar usuários (clientes) de administradores (que poderiam gerenciar produtos pelo Studio).
- **E-mail de Confirmação:** Envio de e-mail transacional (usando Resend ou SendGrid) após a confirmação do pedido (`status: SUCCESS`).
- **Interface de Checkout:** Uma interface de frontend simples (ex: Next.js) para consumir a API e finalizar o pagamento com o Stripe.
- **Tratamento de Erros Aprimorado:** Adicionar mensagens de erro mais descritivas e padronizadas, com códigos de status consistentes e logs detalhados para facilitar depuração e monitoramento.
