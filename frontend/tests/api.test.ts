import { afterEach, expect, test } from "bun:test";
import { streamChat } from "../src/lib/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
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
