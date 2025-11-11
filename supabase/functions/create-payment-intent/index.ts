// --- Configuração Inicial: Carregando as Ferramentas ---
// (Ignoramos alguns avisos do TypeScript, que é um checador de código)
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // Ferramenta para conectar ao banco de dados Supabase
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.0.0"; // Ferramenta para processar pagamentos (Stripe)
import { stripeSecretKey, supabaseAnonKey, supabaseUrl } from "../shared/const/index.ts"; // Nossas chaves secretas e endereços (como senhas de API)
import { AppError } from "../shared/utils/AppError.ts"; // Um ajudante para criar mensagens de erro padronizadas
import { AppResponse } from "../shared/utils/AppResponse.ts"; // Um ajudante para criar respostas de sucesso padronizadas

// Prepara a ferramenta de pagamento (Stripe) com nossa chave secreta.
// É como "ligar" a máquina de cartão de crédito e dizer que somos nós que estamos usando.
const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-08-16" });

// --- O Coração da Lógica: O Gerenciador de Pagamento ---

/**
 * Esta é a função principal (a "receita") que cuida de todo o processo de pagamento.
 * Ela será chamada toda vez que alguém tentar pagar.
 * Ela recebe:
 * - req: A requisição do usuário (contendo o ID do pedido).
 * - supabaseClient: A conexão com o banco de dados.
 * - stripeClient: A conexão com o sistema de pagamento.
 */
export const paymentHandler = async (
  req: Request,
  supabaseClient: any,
  stripeClient: any
) => {
  // 1. Lê o JSON da requisição e extrai o order_id diretamente
  const { order_id } = (await req.json()) as { order_id?: unknown };

  // 2. Validação: Verifica se o ID do pedido realmente foi enviado.
  if (!order_id) {
    // 3. Se não foi, lança um erro "400 - Requisição inválida".
    throw AppError.badRequest("order_id is required");
  }

  // 4. Busca o Pedido no Banco de Dados (Supabase)
  // Vamos na tabela "orders" (pedidos) e procuramos pelo pedido com o ID que recebemos.
  // Queremos saber apenas o "total_price" (preço total) desse pedido.
  const { data: order, error } = await supabaseClient
    .from("orders") // "Da tabela 'orders'..."
    .select("total_price") // "...selecione o 'total_price'..."
    .eq("id", order_id) // "...onde o 'id' é igual ao 'order_id' que recebemos"
    .single(); // Esperamos encontrar SÓ UM resultado

  // 5. Validação do Pedido: Verifica se encontramos o pedido.
  if (error || !order) {
    // Se deu erro na busca ou se o pedido simplesmente não existe,
    // paramos tudo e mandamos um erro "404 - Não encontrado".
    throw AppError.notFound("order not found");
  }

  // 6. Cria a "Intenção de Pagamento" no Stripe
  // Agora falamos com o Stripe para preparar o pagamento.
  // Isso ainda não cobra o cliente, apenas "prepara a cobrança".
  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: order.total_price, // O valor a ser cobrado (o preço total do pedido)
    currency: "brl", // A moeda (Real Brasileiro)
    automatic_payment_methods: {
      enabled: true, // Deixa o Stripe gerenciar os métodos (Cartão, Pix, etc.)
      allow_redirects: "never", // Diz ao Stripe para não redirecionar o usuário, o app vai cuidar disso.
    },
    metadata: {
      // Adiciona uma "etiqueta" de metadados.
      // Guardamos o ID do nosso pedido (do Supabase) dentro do pagamento do Stripe.
      // Isso ajuda a vincular os dois sistemas, para sabermos qual pedido foi pago.
      supabase_order_id: order_id,
    },
  });

  // 7. Envia a Resposta de Sucesso
  // O Stripe nos deu um "client_secret" (segredo do cliente).
  // Este "segredo" é uma senha temporária que o aplicativo (front-end) precisa
  // para mostrar o formulário de pagamento (cartão, Pix, etc.) para o usuário.
  return new AppResponse(200, {
    client_secret: paymentIntent.client_secret,
  });
};

// --- O Servidor: Colocando Tudo Para Funcionar ---

// @ts-ignore
// Isso "liga" o servidor. O Deno (ambiente de execução) fica "ouvindo"
// e, para cada requisição (req) que chega, ele executa o código abaixo.
Deno.serve(async (req) => {
  try {
    // --- Bloco "Tentar" ---
    // O servidor vai TENTAR executar a lógica de pagamento.

    // Antes de fazer qualquer coisa, preparamos a conexão com o Supabase.
    // Isso é especial: criamos um cliente que "age em nome do usuário".
    const supabaseClient = createClient(
      supabaseUrl, // Onde o banco de dados está
      supabaseAnonKey, // A chave pública do Supabase
      {
        global: {
          // Aqui está o truque:
          // Pegamos o "crachá de autorização" (Token JWT) do usuário que fez a requisição...
          // ...e o entregamos ao Supabase.
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );
    // Agora, o Supabase sabe QUEM é esse usuário e só vai permitir
    // que ele acesse os dados que ele tem permissão (graças às Regras de Segurança RLS).

    // Agora que temos as ferramentas prontas, chamamos nossa "receita"
    // (a função 'paymentHandler' lá de cima) para fazer o trabalho.
    return await paymentHandler(req, supabaseClient, stripe);

  } catch (error) {
    // --- Bloco "Capturar" ---
    // Se qualquer coisa dentro do "try" der errado (um "erro" for lançado),
    // o código pula para cá, para que o servidor não quebre.

    // Se o erro for um dos nossos "erros esperados" (AppError, como "ID obrigatório" ou "Pedido não encontrado")...
    if (error instanceof AppError) {
      // ...devolvemos uma resposta de erro "bonita" com a mensagem
      // e o código de status corretos (Ex: 400, 404).
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: error.statusCode,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    // Se for um erro inesperado (um bug, o Stripe caiu, etc.)...
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500, // Erro "500" significa "Deu ruim aqui dentro"
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});