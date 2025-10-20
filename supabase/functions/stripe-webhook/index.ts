// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@14.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { StatusOrder } from '../shared/const/index.ts'

// ATENÇÃO: Use o 'service_role_key' aqui
// Este cliente ignora o RLS para poder atualizar o status do pedido
// Ele será chamado pelo Stripe, não por um usuário


const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient()
})

console.log(Deno.env.get('STRIPE_SECRET_KEY')!)

// Este secret é usado para verificar se a requisição veio MESMO do Stripe


Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! 
  )

  // 1. A verificação do Stripe requer o body como texto puro
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  // 2. Verifique a assinatura do Webhook
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('Falha na verificação da assinatura do Webhook:', err.message)
    return new Response(err.message, { status: 400 })
  }

  // 3. Lide com o evento (somente o que nos interessa)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent

    // Pegamos o ID do nosso pedido que salvamos no metadata
    const supabase_order_id = paymentIntent.metadata.supabase_order_id

    console.log(`PaymentIntent ${paymentIntent.id} sucedido para o pedido ${supabase_order_id}. Atualizando banco...`)

    // 4. Atualize o status do pedido no Supabase
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status: StatusOrder.SUCCESS }) // Seu status de 'pago'
      .eq('id', supabase_order_id)

    if (error) {
      console.error(`Erro ao atualizar pedido ${supabase_order_id}:`, error)
      // Se falhar, o Stripe tentará enviar o webhook novamente
      return new Response(JSON.stringify({ error: 'Erro no DB' }), { status: 500 })
    }

    console.log(`Pedido ${supabase_order_id} atualizado para 'paid'`)
  }

  // 5. Retorne 200 OK para o Stripe saber que recebemos
  return new Response(JSON.stringify({ received: true }), { status: 200 })
})