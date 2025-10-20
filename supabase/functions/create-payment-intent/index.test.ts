//@ts-ignore
import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
//@ts-ignore
import { stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { paymentHandler } from "./index.ts";
import { AppError } from "../shared/utils/AppError.ts";

// --- Helpers de Teste ---
const mockRequest = (body: unknown): Request => {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

const createMockSupabaseClient = (
  orderData: { data: unknown; error: unknown }
) => {
  const client: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(orderData),
        }),
      }),
    }),
  };
  return client;
};

const createMockStripeClient = (
  paymentIntentResponse: { client_secret: string }
) => {
  const client: any = {
    paymentIntents: {
      create: () => Promise.resolve(paymentIntentResponse),
    },
  };
  return client;
};

// --- Test Cases ---

//@ts-ignore
Deno.test("Payment Handler - Success (200) Payment intent created", async () => {
  const body = { order_id: "order-123" };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: { total_price: 9999 }, // R$ 99.99
    error: null,
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_test_secret_123",
  });

  const res = await paymentHandler(req, supabaseClient, stripeClient);
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.client_secret, "pi_test_secret_123");
});