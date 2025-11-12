// Este é um arquivo de teste para a função 'logicHandler'.
// O objetivo é simular diferentes cenários (sucesso, erros, etc.)
// para garantir que a função se comporte como esperado.

// Ignora avisos do TypeScript, comum em arquivos de teste Deno
//@ts-ignore 
// Importa a função 'assertEquals' da biblioteca padrão do Deno.
// É usada para verificar se um resultado é IGUAL ao que esperamos.
import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";

//@ts-ignore
// Importa a função 'stub'. Esta é a ferramenta de "mock" (simulação).
// Ela nos permite substituir funções reais (como 'client.auth.getUser')
// por versões falsas que retornam o que quisermos para o teste.
import { stub } from "https://deno.land/std@0.203.0/testing/mock.ts";

// Importa a função principal que queremos testar.
import { logicHandler } from "./index.ts";

// ---
// FUNÇÕES DE AJUDA (HELPERS) PARA OS TESTES
// ---

// Helper 1: Cria um objeto 'Request' (Requisição) falso.
// Simula uma chamada HTTP POST com um corpo (body) em JSON.
const mockRequest = (body: unknown): Request => {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Converte o objeto de teste em uma string JSON, como um navegador faria.
    body: JSON.stringify(body),
  });
};

// Helper 2: Cria um cliente Supabase "falso" (mockado).
// Esta é a parte mais importante dos testes.
const createMockClient = (
  // O que o 'client.auth.getUser()' deve retornar?
  authResponse: { user: unknown; error: unknown },
  // O que o 'client.rpc()' (chamada ao banco) deve retornar?
  rpcResponse: { data: unknown; error: unknown },
) => {
  // Cria um objeto de cliente vazio.
  const client: any = {
    auth: {},
  };

  // USA O 'stub' PARA SUBSTITUIR A FUNÇÃO REAL:
  // "Quando 'client.auth.getUser' for chamado...
  stub(
    client.auth,
    "getUser",
    // ...não vá ao Supabase, apenas retorne esta promessa resolvida."
    () => Promise.resolve({ data: { user: authResponse.user }, error: authResponse.error }),
  );

  // USA O 'stub' PARA SUBSTITUIR A FUNÇÃO REAL:
  // "Quando 'client.rpc' for chamado...
  stub(client, "rpc", 
    // ...não vá ao banco de dados, apenas retorne esta promessa resolvida."
    () => Promise.resolve(rpcResponse));
  
  // Retorna o cliente falso, pronto para ser usado no teste.
  return client;
};

// ---
// INÍCIO DOS TESTES
// ---

//@ts-ignore
// Teste 1: O "Caminho Feliz" (Happy Path)
Deno.test("Handler - Success (200)", async () => {
  // 1. ARRANGE (Organizar): Preparamos os dados do teste.
  const body = { items: [{ id: 1, quantity: 2 }] }; // Um corpo de requisição válido
  const req = mockRequest(body);
  const client = createMockClient(
    // Simula um usuário logado com sucesso
    { user: { id: "user-123" }, error: null },
    // Simula uma chamada de banco de dados (RPC) que deu certo
    {
      data: { status: "success", order_id: 99 },
      error: null,
    },
  );

  // 2. ACT (Agir): Executamos a função que estamos testando.
  const res = await logicHandler(req, client);
  const json = await res.json();

  // 3. ASSERT (Verificar): Checamos se os resultados estão corretos.
  assertEquals(res.status, 200); // Esperamos o status HTTP 200 (OK)
  assertEquals(json.orderId, 99); // Esperamos o 'order_id' que o mock retornou
  assertEquals(json.message, "Order created successfully!");
});

//@ts-ignore
// Teste 2: Erro de Autenticação (Usuário não logado)
Deno.test("Handler - Error (401) Authentication required", async () => {
  // 1. ARRANGE
  const body = { items: [{ id: 1, quantity: 2 }] };
  const req = mockRequest(body);
  const client = createMockClient(
    // AQUI ESTÁ A MUDANÇA: Simulamos que NÃO há usuário logado (user: null)
    { user: null, error: null },
    // A chamada RPC nem vai acontecer, então não importa o que ela retorna.
    { data: null, error: null },
  );

  // 2. ACT
  const res = await logicHandler(req, client);
  const json = await res.json();

  // 3. ASSERT
  // Esperamos o status HTTP 401 (Não Autorizado)
  assertEquals(res.status, 401);
  assertEquals(json.error, "User not authenticated");
});

//@ts-ignore
// Teste 3: Erro de JSON inválido (o corpo da requisição está quebrado)
Deno.test("Handler - Error (400) Invalid JSON body", async () => {
  // 1. ARRANGE
  // Criamos uma requisição manualmente com JSON malformado
  // (Note a vírgula extra no final do body)
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"items": [{"id": 1, "quantity": 2}],}', // JSON INVÁLIDO!
  });

  // O mock do cliente nem é tão importante, pois o código deve falhar
  // antes de tentar usá-lo (ao tentar ler o 'req.json()').
  const client = createMockClient(
    { user: { id: "user-123" }, error: null },
    { data: null, error: null },
  );

  // 2. ACT
  const res = await logicHandler(req, client);

  // 3. ASSERT
  // O teste espera um status 500 (Erro Interno do Servidor),
  // o que sugere que a falha ao 'parsear' o JSON não está
  // sendo tratada de forma elegante e quebra a função.
  assertEquals(res.status, 500);
});

//@ts-ignore
// Teste 4: Erro de Validação (JSON é válido, mas os dados estão errados)
Deno.test("Handler - Error (422) Validation failed - missing items", async () => {
  // 1. ARRANGE
  // O JSON é válido, mas não tem a propriedade 'items' que a função espera.
  const body = { wrong_property: "foo" }; 
  const req = mockRequest(body);
  
  // Simula um usuário logado
  const client = createMockClient(
    { user: { id: "user-123" }, error: null }, 
    { data: null, error: null },
  );

  // 2. ACT
  const res = await logicHandler(req, client);
  const json = await res.json();

  // 3. ASSERT
  // Espera um status 400 (Bad Request), pois os dados enviados não
  // passaram na validação de schema (ex: Zod). O nome do teste
  // sugere 422, mas a asserção é 400.
  assertEquals(res.status, 400); 
});

//@ts-ignore
// Teste 5: Erro de Lógica de Negócio (Ex: Sem estoque)
Deno.test("Handler - Error (409) Business logic error (data.status: error)", async () => {
  // 1. ARRANGE
  // A requisição é perfeitamente válida.
  const body = { items: [{ id: 1, quantity: 999 }] }; // Tenta comprar 999
  const req = mockRequest(body);
  const client = createMockClient(
    // Usuário está logado.
    { user: { id: "user-123" }, error: null },
    // AQUI ESTÁ A MUDANÇA: O banco de dados (RPC) respondeu,
    // mas com uma *mensagem de erro de negócio*.
    {
      data: { status: "error", message: "Product out of stock" },
      error: null,
    },
  );

  // 2. ACT
  const res = await logicHandler(req, client);
  const json = await res.json();

  // 3. ASSERT
  // Esperamos um status 409 (Conflito) - uma boa escolha para
  // falhas de lógica de negócio (como "sem estoque").
  assertEquals(res.status, 409);
  assertEquals(json.error, "Product out of stock");
});

//@ts-ignore
// Teste 6: Erro Genérico do Banco de Dados (Ex: Falha de conexão)
Deno.test("Handler - Error (500) Generic RPC/Transport error", async () => {
  // 1. ARRANGE
  const body = { items: [{ id: 1, quantity: 2 }] };
  const req = mockRequest(body);
  
  const client = createMockClient(
    // Usuário está logado.
    { user: { id: "user-123" }, error: null }, 
    // AQUI ESTÁ A MUDANÇA: A própria chamada RPC falhou
    // (ex: o banco de dados estava offline).
    // O objeto 'error' não é nulo.
    { 
      data: null, 
      error: { message: "Failed to connect to database" },
    },
  );

  // 2. ACT
  const res = await logicHandler(req, client);
  const json = await res.json();

  // 3. ASSERT
  // Isso é um erro técnico, não de negócio.
  // Esperamos um status 500 (Erro Interno do Servidor).
  assertEquals(res.status, 500);
  assertEquals(json.error, "Failed to connect to database");
});