import { afterEach, expect, test } from "bun:test";
import { api, apiResponse, upload, streamChat } from "../src/lib/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("offline backend is detected before sending an IFC upload", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (url) => {
    requests.push(String(url));
    return new Response("", { status: 500 });
  }) as typeof fetch;
  await expect(
    upload("/models", new File(["IFC"], "test.ifc")),
  ).rejects.toThrow("Cannot reach the model service");
  expect(requests).toEqual(["/api/v1/health"]);
});

test("healthy backend receives the original file as multipart upload", async () => {
  const requests: string[] = [];
  const file = new File(["ISO-10303-21;"], "test.ifc");
  globalThis.fetch = (async (url, init) => {
    requests.push(String(url));
    if (String(url).endsWith("/health")) return Response.json({ status: "ok" });
    expect(init?.method).toBe("POST");
    const uploaded = (init?.body as FormData).get("file") as File;
    expect(uploaded.name).toBe(file.name);
    expect(await uploaded.text()).toBe(await file.text());
    return Response.json({ id: "model-1" });
  }) as typeof fetch;
  expect(await upload("/models", file)).toEqual({ id: "model-1" });
  expect(requests).toEqual(["/api/v1/health", "/api/v1/models"]);
});

test("Firefox network resets and health timeouts provide a useful connection error", async () => {
  for (const error of [
    new TypeError("NetworkError when attempting to fetch resource."),
    new DOMException("Timed out", "TimeoutError"),
  ]) {
    globalThis.fetch = (async () => {
      throw error;
    }) as typeof fetch;
    await expect(api("/health")).rejects.toThrow(
      "Cannot reach the model service",
    );
  }
});

test("backend validation errors and intentional cancellation are preserved", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      { error: { message: "Invalid IFC file" } },
      { status: 422 },
    )) as typeof fetch;
  await expect(api("/models")).rejects.toThrow("Invalid IFC file");
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = (async () => {
    throw controller.signal.reason;
  }) as typeof fetch;
  await expect(api("/models", { signal: controller.signal })).rejects.toBe(
    controller.signal.reason,
  );
});

test("original IFC download retains binary bytes", async () => {
  const bytes = new Uint8Array([0, 128, 255, 10]);
  globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
  const response = await apiResponse("/models/model-1/file");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

test("SSE parsing handles UTF-8 and event boundaries split between network chunks", async () => {
  const bytes = new TextEncoder().encode(
    'event: text_delta\ndata: {"text":"Acier é"}\n\nevent: done\ndata: {"status":"complete"}\n\n',
  );
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 3)
              controller.enqueue(bytes.slice(i, i + 3));
            controller.close();
          },
        }),
      ),
    )) as typeof fetch;
  const events: unknown[] = [];
  await streamChat({}, new AbortController().signal, (event, data) =>
    events.push([event, data]),
  );
  expect(events).toEqual([
    ["text_delta", { text: "Acier é" }],
    ["done", { status: "complete" }],
  ]);
});

test("missing API credentials are shown as an error, not an empty answer", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ error: { message: "Set OPENAI_API_KEY" } }),
        { status: 503 },
      ),
    )) as typeof fetch;
  await expect(
    streamChat({}, new AbortController().signal, () => {}),
  ).rejects.toThrow("Set OPENAI_API_KEY");
});
