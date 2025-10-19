// @ts-ignore
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.203.0/assert/mod.ts";
// @ts-ignore
import { stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { handler } from "./index.ts";
import { AppError } from "../shared/utils/AppError.ts";

// --- Helpers (sem alterações) ---
const mockRequest = (): Request => {
  // ...
  return new Request("http://localhost/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
};

const createMockClient = (
  authResponse: { user: unknown; error: unknown },
  fromResponse: { data: unknown; error: unknown },
) => {
  // ... (sem alterações)
  const client: any = { auth: {}, from: () => ({ select: () => Promise.resolve(fromResponse) }) };
  stub(client.auth, "getUser", () => Promise.resolve({ data: { user: authResponse.user }, error: authResponse.error }));
  stub(client, "from", (...args: unknown[]) => {
    const tableName = args[0] as string; 
    assertEquals(tableName, "user_order_details"); 
    return { select: () => Promise.resolve(fromResponse) };
  });
  return client;
};

// --- Dados Mockados (sem alterações) ---
const mockDbData = [
  // ... (seus dados mockados)
  {
    order_id: 101, order_created_at: "2025-10-19T14:00:00Z", order_status: "completed",
    order_total_price: 150.50, item_id: 201, item_quantity: 2, item_total_price: 50.00,
    product_id: 301, product_name: "Test Product A", product_unit_price: 25.00,
  },
  {
    order_id: 101, order_created_at: "2025-10-19T14:00:00Z", order_status: "completed",
    order_total_price: 150.50, item_id: 202, item_quantity: 1, item_total_price: 100.50,
    product_id: 302, product_name: "Test Product B", product_unit_price: 100.50,
  },
];

// --- Test Cases ---
// @ts-ignore
Deno.test("Handler - Success (200) - Generates CSV", async () => {
  // 1. Setup
  const req = mockRequest();
  const client = createMockClient( // Cliente mockado
    { user: { id: "user-123" }, error: null },
    { data: mockDbData, error: null },
  );

  // 2. Execução
  // --- CORREÇÃO AQUI ---
  const res = await handler(req, client); // <-- Passe o client mockado

  // 3. Assertivas (agora devem passar)
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("Content-Type")!, "text/csv");
  const lines = (await res.text()).trim().split('\n');
  assertEquals(lines.length, 3);
  assertEquals(lines[1], "101,2025-10-19T14:00:00Z,completed,150.5,201,2,50,301,Test Product A,25");
});

// @ts-ignore
Deno.test("Handler - Success (200) - Correctly escapes CSV values", async () => {
  const dataWithQuotes = [{ ...mockDbData[0], product_name: 'Product, "with" quotes' }];
  const req = mockRequest();
  const client = createMockClient(
    { user: { id: "user-123" }, error: null },
    { data: dataWithQuotes, error: null },
  );

  // --- CORREÇÃO AQUI ---
  const res = await handler(req, client); // <-- Passe o client mockado

  const lines = (await res.text()).trim().split('\n');
  const expectedCsvRow = '101,2025-10-19T14:00:00Z,completed,150.5,201,2,50,301,"Product, ""with"" quotes",25';
  assertEquals(lines[1], expectedCsvRow);
});

// @ts-ignore
Deno.test("Handler - Error (401) Authentication required", async () => {
  const req = mockRequest();
  const client = createMockClient(
    { user: null, error: null },
    { data: null, error: null },
  );

  // --- CORREÇÃO AQUI ---
  const res = await handler(req, client); // <-- Passe o client mockado

  const json = await res.json();
  assertEquals(res.status, 401);
  assertEquals(json.error, "User not authenticated");
});

// @ts-ignore
Deno.test("Handler - Error (500) Database query failed", async () => {
  const req = mockRequest();
  const client = createMockClient(
    { user: { id: "user-1t" }, error: null },
    { data: null, error: { message: "An unexpected error occurred." } },
  );

  // --- CORREÇÃO AQUI ---
  const res = await handler(req, client); // <-- Passe o client mockado

  const json = await res.json();
  assertEquals(res.status, 500);
  assertEquals(json.error, "An unexpected error occurred.");
});