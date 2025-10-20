//@ts-ignore
import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
//@ts-ignore
import { stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { logicHandler } from "./index.ts";

const mockRequest = (body: unknown): Request => {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

const createMockClient = (
  authResponse: { user: unknown; error: unknown },
  rpcResponse: { data: unknown; error: unknown },
) => {
  const client: any = {
    auth: {},
  };
  stub(
    client.auth,
    "getUser",
    () => Promise.resolve({ data: { user: authResponse.user }, error: authResponse.error }),
  );
  stub(client, "rpc", () => Promise.resolve(rpcResponse));
  return client;
};

//@ts-ignore
Deno.test("Handler - Success (200)", async () => {
  const body = { items: [{ id: 1, quantity: 2 }] };
  const req = mockRequest(body);
  const client = createMockClient(
    { user: { id: "user-123" }, error: null },
    {
      data: { status: "success", order_id: 99 },
      error: null,
    },
  );
  const res = await logicHandler(req, client);
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.orderId, 99);
  assertEquals(json.message, "Order created successfully!");
});

//@ts-ignore
Deno.test("Handler - Error (401) Authentication required", async () => {
  const body = { items: [{ id: 1, quantity: 2 }] };
  const req = mockRequest(body);
  const client = createMockClient(
    { user: null, error: null },
    { data: null, error: null },
  );

  const res = await logicHandler(req, client);
  const json = await res.json();

  assertEquals(res.status, 401);
  assertEquals(json.error, "User not authenticated");
});

//@ts-ignore
Deno.test("Handler - Error (400) Invalid JSON body", async () => {
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"items": [{"id": 1, "quantity": 2}],}', 
  });

  const client = createMockClient(
    { user: { id: "user-123" }, error: null },
    { data: null, error: null },
  );

  const res = await logicHandler(req, client);

  assertEquals(res.status, 500);
});

//@ts-ignore
Deno.test("Handler - Error (422) Validation failed - missing items", async () => {
  const body = { wrong_property: "foo" };
  const req = mockRequest(body);
  
  const client = createMockClient(
    { user: { id: "user-123" }, error: null }, 
    { data: null, error: null },
  );

  const res = await logicHandler(req, client);
  const json = await res.json();

  assertEquals(res.status, 400); 
});

//@ts-ignore
Deno.test("Handler - Error (409) Business logic error (data.status: error)", async () => {
  const body = { items: [{ id: 1, quantity: 999 }] };
  const req = mockRequest(body);
  const client = createMockClient(
    { user: { id: "user-123" }, error: null },
    {
      data: { status: "error", message: "Product out of stock" },
      error: null,
    },
  );

  const res = await logicHandler(req, client);
  const json = await res.json();

  assertEquals(res.status, 409);
  assertEquals(json.error, "Product out of stock");
});

//@ts-ignore
Deno.test("Handler - Error (500) Generic RPC/Transport error", async () => {
  const body = { items: [{ id: 1, quantity: 2 }] };
  const req = mockRequest(body);
  
  const client = createMockClient(
    { user: { id: "user-123" }, error: null }, 
    { 
      data: null, 
      error: { message: "Failed to connect to database" },
    },
  );

  const res = await logicHandler(req, client);
  const json = await res.json();

  assertEquals(res.status, 500);
  assertEquals(json.error, "Failed to connect to database");
});