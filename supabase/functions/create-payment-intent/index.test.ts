//@ts-ignore
import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
//@ts-ignore
import { paymentHandler } from "./index.ts";
import { AppError } from "../shared/utils/AppError.ts";

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

//@ts-ignore
Deno.test("Payment Handler - Success (200) Payment intent created", async () => {
  const body = { order_id: "order-123" };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: { total_price: 9999 },
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

//@ts-ignore
Deno.test("Payment Handler - Error (400) Missing order_id", async () => {
  const body = { order_id: null };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: null,
    error: null,
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_test_secret_123",
  });

  try {
    await paymentHandler(req, supabaseClient, stripeClient);
    assertEquals(true, false);
  } catch (error: unknown) {
    const err = error as AppError;
    assertEquals(err instanceof AppError, true);
    assertEquals(err.statusCode, 400);
    assertEquals(err.message, "order_id is required");
  }
});

//@ts-ignore
Deno.test("Payment Handler - Error (400) Invalid JSON body", async () => {
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"order_id": "order-123",}',
  });

  const supabaseClient = createMockSupabaseClient({
    data: null,
    error: null,
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_test_secret_123",
  });

  try {
    await paymentHandler(req, supabaseClient, stripeClient);
    assertEquals(true, false);
  } catch (error: unknown) {
    const err = error as AppError;
    assertEquals(err instanceof AppError, true);
    assertEquals(err.statusCode, 400);
    assertEquals(err.message, "Invalid JSON body");
  }
});

//@ts-ignore
Deno.test("Payment Handler - Error (404) Order not found", async () => {
  const body = { order_id: "order-999" };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: null,
    error: { message: "No rows found" },
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_test_secret_123",
  });

  try {
    await paymentHandler(req, supabaseClient, stripeClient);
    assertEquals(true, false);
  } catch (error: unknown) {
    const err = error as AppError;
    assertEquals(err instanceof AppError, true);
    assertEquals(err.statusCode, 404);
    assertEquals(err.message, "order not found");
  }
});

//@ts-ignore
Deno.test("Payment Handler - Error (404) Order data is null", async () => {
  const body = { order_id: "order-456" };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: null,
    error: null,
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_test_secret_123",
  });

  try {
    await paymentHandler(req, supabaseClient, stripeClient);
    assertEquals(true, false);
  } catch (error: unknown) {
    const err = error as AppError;
    assertEquals(err instanceof AppError, true);
    assertEquals(err.statusCode, 404);
    assertEquals(err.message, "order not found");
  }
});

//@ts-ignore
Deno.test("Payment Handler - Success (200) Large order amount", async () => {
  const body = { order_id: "order-large" };
  const req = mockRequest(body);
  
  const supabaseClient = createMockSupabaseClient({
    data: { total_price: 500000 },
    error: null,
  });
  
  const stripeClient = createMockStripeClient({
    client_secret: "pi_large_secret_456",
  });

  const res = await paymentHandler(req, supabaseClient, stripeClient);
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.client_secret, "pi_large_secret_456");
});