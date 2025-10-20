//@ts-ignore
import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
//@ts-ignore
import { stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { stripeWebhookHandler } from "./index.ts";


const mockRequest = (body: string, signature: string): Request => {
  return new Request("http://localhost/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: body,
  });
};

const mockPaymentIntentSucceededEvent = (orderId: string, paymentIntentId: string = "pi_test_123") => {
  return {
    type: "payment_intent.succeeded",
    id: "evt_test",
    data: {
      object: {
        id: paymentIntentId,
        metadata: {
          supabase_order_id: orderId,
        },
      },
    },
  };
};

const createMockStripeClient = (shouldSucceed: boolean = true, eventToReturn: any = null) => {
  const client: any = {
    webhooks: {
      constructEventAsync: (body: string, signature: string, secret: string) => {
        if (!shouldSucceed) {
          throw new Error("Invalid signature");
        }
        return Promise.resolve(eventToReturn || mockPaymentIntentSucceededEvent("order-123"));
      },
    },
  };
  return client;
};

const createMockSupabaseClient = (shouldSucceed: boolean = true) => {
  const client: any = {
    from: (table: string) => ({
      update: () => ({
        eq: () => Promise.resolve({
          data: shouldSucceed ? { id: "order-123" } : null,
          error: shouldSucceed ? null : { message: "Update failed" },
        }),
      }),
    }),
  };
  return client;
};


//@ts-ignore
Deno.test("Webhook - Success (200) Payment intent succeeded", async () => {
  const body = JSON.stringify(mockPaymentIntentSucceededEvent("order-123"));
  const req = mockRequest(body, "valid_signature");
  
  const stripeClient = createMockStripeClient(true, mockPaymentIntentSucceededEvent("order-123"));
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.received, true);
});

//@ts-ignore
Deno.test("Webhook - Error (400) Invalid Stripe signature", async () => {
  const body = JSON.stringify(mockPaymentIntentSucceededEvent("order-123"));
  const req = mockRequest(body, "invalid_signature");
  
  const stripeClient = createMockStripeClient(false);
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");

  assertEquals(res.status, 400);
});

//@ts-ignore
Deno.test("Webhook - Error (400) Missing stripe-signature header", async () => {
  const body = JSON.stringify(mockPaymentIntentSucceededEvent("order-123"));
  const req = new Request("http://localhost/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
  });
  
  const stripeClient = createMockStripeClient(true);
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");

  assertEquals(res.status, 400);
});

//@ts-ignore
Deno.test("Webhook - Error (400) Missing supabase_order_id in metadata", async () => {
  const eventWithoutOrderId = {
    type: "payment_intent.succeeded",
    id: "evt_test",
    data: {
      object: {
        id: "pi_test_123",
        metadata: {},
      },
    },
  };
  
  const body = JSON.stringify(eventWithoutOrderId);
  const req = mockRequest(body, "valid_signature");
  
  const stripeClient = createMockStripeClient(true, eventWithoutOrderId);
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");

  assertEquals(res.status, 400);
});

//@ts-ignore
Deno.test("Webhook - Error (500) Database update failed", async () => {
  const body = JSON.stringify(mockPaymentIntentSucceededEvent("order-123"));
  const req = mockRequest(body, "valid_signature");
  
  const stripeClient = createMockStripeClient(true, mockPaymentIntentSucceededEvent("order-123"));
  const supabaseClient = createMockSupabaseClient(false); 

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");
  const json = await res.json();

  assertEquals(res.status, 500);
  assertEquals(json.error, "Database error");
});

//@ts-ignore
Deno.test("Webhook - Success (200) Ignores non-payment_intent.succeeded events", async () => {
  const eventOtherType = {
    type: "charge.refunded",
    id: "evt_test",
    data: {
      object: {
        id: "ch_test_123",
      },
    },
  };
  
  const body = JSON.stringify(eventOtherType);
  const req = mockRequest(body, "valid_signature");
  
  const stripeClient = createMockStripeClient(true, eventOtherType);
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.received, true);
});

//@ts-ignore
Deno.test("Webhook - Success (200) Multiple order updates", async () => {
  const body = JSON.stringify(mockPaymentIntentSucceededEvent("order-456", "pi_test_456"));
  const req = mockRequest(body, "valid_signature");
  
  const stripeClient = createMockStripeClient(true, mockPaymentIntentSucceededEvent("order-456", "pi_test_456"));
  const supabaseClient = createMockSupabaseClient(true);

  const res = await stripeWebhookHandler(req, stripeClient, supabaseClient, "webhook_secret");
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.received, true);
});