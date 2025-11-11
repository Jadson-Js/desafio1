//@ts-ignore
import Stripe from "https://esm.sh/stripe@14.0.0"; // Ferramenta para processar pagamentos (Stripe)
//@ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2' // Ferramenta para conectar ao banco de dados Supabase
import { StatusOrder } from '../shared/const/index.ts' // Nossas constantes (Ex: StatusOrder.SUCCESS = "PAGO")

/**
 * Este é o "Gerenciador do Webhook do Stripe" (ou "Ouvinte de Pagamentos").
 *
 * Pense assim:
 * 1. O usuário paga no seu aplicativo (front-end).
 * 2. O Stripe processa o pagamento (demora alguns segundos).
 * 3. Quando o Stripe CONFIRMA o pagamento, ele "toca a campainha" do nosso servidor.
 * Esta função é o código que "atende a campainha".
 * Ela é chamada DIRETAMENTE PELO STRIPE, não pelo aplicativo do usuário.
 */
export const stripeWebhookHandler = async (
  req: Request, // A requisição (notificação) que o Stripe nos enviou
  stripeClient: any, // Nossa ferramenta do Stripe
  supabaseClient: any, // Nossa ferramenta do Supabase (com poderes de admin)
  webhookSecret: string // A "senha secreta" da nossa campainha
) => {
  let body: string;
  
  try {
    // 1. Lê a notificação do Stripe
    // As notificações (webhooks) vêm como texto puro, não JSON.
    body = await req.text();
  } catch {
    // Se não conseguirmos nem ler, algo está muito errado.
    return new Response("Invalid request body", { status: 400 });
  }

  // 2. Verifica a "Assinatura Secreta"
  // Como sabemos que foi o Stripe que "tocou a campainha" e não um impostor?
  // O Stripe envia uma "assinatura" (um código secreto) no cabeçalho.
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    // Se não tiver assinatura, é um impostor. Rejeitamos.
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // 3. Valida a Assinatura
  // Esta é a parte crucial da segurança.
  // Usamos a notificação (body), a assinatura (signature) e nossa "senha secreta" (webhookSecret)
  // para verificar matematicamente se a mensagem é 100% autêntica do Stripe.
  let event: Stripe.Event;
  try {
    event = await stripeClient.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    // Se a assinatura for inválida (impostor ou erro), rejeitamos.
    return new Response(err.message, { status: 400 });
  }

  // 4. Processa o Evento (A Notificação)
  // Agora que sabemos que a notificação é real, vemos o que ela diz.
  // O Stripe envia dezenas de tipos de eventos (pagamento falhou, cartão recusado, etc.)
  // Mas nós SÓ nos importamos com um: 'payment_intent.succeeded' (Pagamento Concluído com Sucesso!)
  if (event.type === 'payment_intent.succeeded') {
    // Pegamos os detalhes do pagamento que foi aprovado
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // L lembra da "etiqueta" (metadata) que colocamos no pagamento lá no primeiro arquivo?
    // Agora nós lemos ela de volta!
    // Isso nos diz QUAL pedido do nosso banco de dados (Supabase) acabou de ser pago.
    const supabase_order_id = paymentIntent.metadata.supabase_order_id;

    if (!supabase_order_id) {
      // Se, por algum motivo, o pagamento veio sem a etiqueta, não podemos
      // atualizar o pedido. Devolvemos um erro.
      return new Response(JSON.stringify({ error: 'Missing order ID' }), { status: 400 });
    }

    // 5. Atualiza o Pedido no Banco de Dados
    // Agora que sabemos qual pedido foi pago, nós vamos no banco...
    const { error } = await supabaseClient
      .from('orders') // ...na tabela 'orders'
      .update({ status: StatusOrder.SUCCESS }) // ...atualizamos o 'status' para "PAGO" (ou "SUCESSO")
      .eq('id', supabase_order_id); // ...exatamente para o pedido com o ID que pegamos da etiqueta.

    if (error) {
      // Se der erro ao salvar no banco, avisamos.
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }
  }

  // 6. Responde ao Stripe
  // Este é o passo final. Temos que mandar uma resposta "200 OK" para o Stripe.
  // Isso significa: "Obrigado, recebi sua notificação, está tudo certo!".
  // Se não enviarmos isso, o Stripe vai achar que falhamos e
  // vai continuar "tocando a campainha" (enviando a notificação) várias vezes.
  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

// --- O Servidor: Ligando o "Ouvinte" ---

//@ts-ignore
Deno.serve(async (req) => {
  // 1. Carrega todas as chaves secretas do "ambiente"
  // (São variáveis seguras que não ficam salvas no código)
  //@ts-ignore
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY'); // Chave geral do Stripe
  //@ts-ignore
  const stripeWebHookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET'); // A "senha da campainha"
  //@ts-ignore
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); // Endereço do banco
  //@ts-ignore
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); // A "Chave Mestra" do banco

  // Validação básica
  if (!stripeSecretKey || !stripeWebHookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    // Se faltar alguma chave, o servidor não pode funcionar.
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }

  // 2. Prepara as ferramentas
  // Cria a ferramenta do Stripe
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient()
  });

  // Cria a ferramenta do Supabase
  // !! MUITO IMPORTANTE !!
  // Note que aqui usamos a 'supabaseServiceRoleKey' (a Chave Mestra).
  // Isso cria um cliente "Super Admin" do Supabase.
  // Por quê? Porque quem está atualizando o pedido é o *nosso servidor*,
  // não um usuário logado. O servidor precisa de permissão total
  // para ignorar todas as regras de segurança (RLS) e atualizar
  // o status do pedido de "PENDENTE" para "PAGO".
  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey
  );

  // 3. Chama o "Ouvinte"
  // Finalmente, passa a requisição do Stripe e as ferramentas (Stripe e Supabase Admin)
  // para o nosso "gerenciador de campainha" (o stripeWebhookHandler) fazer o trabalho.
  return await stripeWebhookHandler(
    req,
    stripe,
    supabaseAdmin,
    stripeWebHookSecret
  );
});