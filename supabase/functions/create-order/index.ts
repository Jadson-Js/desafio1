// --- Configuração Inicial: Carregando as Ferramentas ---
import { AppError } from "../shared/utils/AppError.ts"; // Nosso ajudante para criar erros padronizados (Ex: "Não autorizado")
import { AppResponse } from "../shared/utils/AppResponse.ts"; // Nosso ajudante para criar respostas de sucesso padronizadas
import { corsHeaders } from "../shared/const/index.ts"; // Cabeçalhos de permissão para o navegador (CORS)
import { supabaseClient } from "../shared/supabaseClient.ts"; // Uma função que cria a conexão com o banco de dados
//@ts-ignore
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"; // O "tipo" (molde) de como é uma conexão Supabase

// --- O Cérebro: O Gerenciador da Lógica ---

/**
 * Esta é a "receita" principal para CADASTRAR um novo pedido.
 * Ela é responsável por:
 * 1. Verificar se o usuário está logado.
 * 2. Verificar se o carrinho de compras não está vazio.
 * 3. Mandar o banco de dados criar o pedido.
 * 4. Lidar com qualquer erro que possa acontecer.
 */
export const logicHandler = async (
  req: Request, // A requisição (o pedido) que chegou do usuário
  client: SupabaseClient, // A conexão com o banco de dados
): Promise<Response> => {
  try {
    // --- Bloco "Tentar" ---
    // O código vai TENTAR executar os passos abaixo, um por um.

    // 1. Autenticação: Quem é você?
    // Verifica o "crachá" (token) do usuário para saber quem está fazendo o pedido.
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      // Se não tiver um usuário logado (crachá inválido ou ausente),
      // paramos tudo e devolvemos um erro "Não autorizado".
      throw AppError.unauthorized();
    }

    // 2. Validação: O que você quer?
    // Lê o "pacote" de dados (JSON) que o app enviou (o carrinho de compras).
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      // Se a lista de "items" não existir, ou não for uma lista, ou estiver vazia,
      // paramos tudo e devolvemos um erro "Requisição inválida".
      throw AppError.badRequest("The item list cannot be empty");
    }

    // 3. Execução: Pedindo ao Banco de Dados para agir
    // Aqui, chamamos uma "função especial" (RPC) que JÁ EXISTE LÁ NO BANCO DE DADOS
    // chamada "create_order".
    // Em vez de fazermos a lógica (verificar estoque, calcular total) aqui no código,
    // nós apenas passamos o carrinho de compras ("cart_items: items") e
    // o próprio banco de dados faz todo o trabalho pesado.
    const { data, error } = await client.rpc("create_order", {
      cart_items: items,
    });

    // 4. Tratamento de Erro (Técnico do Banco)
    if (error) {
      // Se o banco de dados deu um erro técnico (Ex: a função "create_order" não existe),
      // nós paramos e avisamos que deu um erro interno.
      const message = error.message || "Database RPC error";
      throw new AppError(500, message);
    }

    // 5. Tratamento de Erro (Regra de Negócio)
    // A função do banco pode ter rodado, mas retornado um erro de "negócio"
    // (Ex: "item sem estoque", "cupom inválido").
    if (data && data.status === "error") {
      // Se a resposta da função tiver "status: 'error'",
      // usamos a mensagem de erro que ela nos deu (Ex: "Produto X esgotado").
      throw AppError.conflict(data.message || "Business logic conflict");
    }

    // 6. Sucesso!
    // Se tudo deu certo, o banco de dados nos devolve o ID do novo pedido.
    // Usamos nosso ajudante "AppResponse" para mandar uma resposta de "Sucesso" (200)
    // de volta para o aplicativo, contendo o ID do pedido.
    return new AppResponse(200, {
      orderId: data.order_id,
      message: "Order created successfully!",
    });
  } catch (error) {
    // --- Bloco "Capturar" ---
    // Se QUALQUER passo dentro do "try" falhar, o código pula para cá.

    // Se for um "erro conhecido" (AppError) que nós mesmos criamos (como 401, 400, 409)...
    if (error instanceof AppError) {
      // ...nós devolvemos o erro "bonitinho" com o status e a mensagem corretos.
      return new AppResponse(error.statusCode, { error: error.message });
    }

    // Se for um erro inesperado (um bug, algo quebrou feio)...
    return new AppResponse(500, {
      // ...devolvemos um erro genérico "500 - Erro interno"
      error: "internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// --- O Recepcionista ---

/**
 * Esta é uma função "ajudante" pequena.
 * Ela apenas prepara o "cliente" (a conexão com o Supabase)
 * passando a requisição (req) para dentro dela.
 * (Isso é importante para que o Supabase consiga ler o "crachá" do usuário
 * que está dentro da requisição).
 *
 * Depois, ela chama o "logicHandler" (o cérebro) para fazer o trabalho de verdade.
 */
export const handler = (req: Request): Promise<Response> => {
  const client = supabaseClient(req);
  return logicHandler(req, client);
};

// --- O Servidor: A Porta de Entrada ---

//@ts-ignore
// Isso "liga" o servidor. O Deno (ambiente de execução) fica "ouvindo"
// e, para cada requisição (req) que chega, ele executa o código abaixo.
Deno.serve(async (req) => {
  // 1. Checagem de "Pré-voo" (OPTIONS)
  // O navegador (Chrome, Firefox) envia uma requisição "OPTIONS" ANTES
  // da requisição real (POST, GET) para perguntar: "Ei, servidor,
  // eu (site X) posso enviar dados para você? É seguro?".
  if (req.method === "OPTIONS") {
    // Se for um OPTIONS, nós só respondemos "ok" (200)
    // e enviamos os "corsHeaders" (cabeçalhos de permissão),
    // que dizem ao navegador: "Sim, pode mandar a requisição real."
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // 2. Requisição Real
  // Se não for "OPTIONS" (provavelmente é "POST", para criar um pedido),
  // nós chamamos o "handler" (o recepcionista), que vai
  // chamar o "logicHandler" (o cérebro) para processar o pedido.
  return await handler(req);
});