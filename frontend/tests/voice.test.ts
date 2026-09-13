import { afterEach, expect, test } from "bun:test";
import { VoiceClient } from "../src/lib/voice";
import type { Context } from "../src/lib/api";

const context: Context = {
  model_id: "m",
  model_revision: "r",
  selected_guids: [],
  schedule: null,
  history: [],
};
const originals = new Map<string, PropertyDescriptor | undefined>();
function global(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
function setup(remoteError = false) {
  let stopped = 0;
  const media = { getTracks: () => [{ stop: () => stopped++ }] };
  global("navigator", { mediaDevices: { getUserMedia: async () => media } });
  global(
    "Audio",
    class {
      pause() {}
    },
  );
  global(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  let peer: Peer;
  class Peer extends EventTarget {
    connectionState = "new";
    iceGatheringState = "complete";
    localDescription = { sdp: "offer" };
    constructor() {
      super();
      peer = this;
    }
    addTrack() {}
    createDataChannel() {}
    async createOffer() {
      return this.localDescription;
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      if (remoteError) throw new Error("SDP rejected");
    }
    close() {
      this.connectionState = "closed";
    }
    connect() {
      this.connectionState = "connected";
      this.dispatchEvent(new Event("connectionstatechange"));
    }
  }
  global("RTCPeerConnection", Peer);
  return { media, stopped: () => stopped, peer: () => peer };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("does not report connected until media connects, then closes the session", async () => {
  const env = setup();
  const requests: string[] = [];
  global("fetch", async (url: string) => {
    requests.push(url);
    return url.endsWith("/sessions")
      ? Response.json({
          session: { id: "live_test" },
          transport: { sdp: "answer" },
        })
      : new Response(null, { status: 204 });
  });
  const client = new VoiceClient();
  let ready = false;
  const start = client
    .start(context, () => {})
    .then(() => {
      ready = true;
    });
  await tick();
  expect(ready).toBe(false);
  env.peer().connect();
  await start;
  expect(ready).toBe(true);
  await client.stop();
  expect(env.stopped()).toBe(1);
  expect(requests).toContain("/api/v1/voice/sessions/live_test");
});

test("cancel during HTTP negotiation stops microphone and closes a late session", async () => {
  const env = setup();
  let reply!: (response: Response) => void;
  const deleted: string[] = [];
  global("fetch", (url: string) =>
    url.endsWith("/sessions")
      ? new Promise<Response>((resolve) => {
          reply = resolve;
        })
      : (deleted.push(url),
        Promise.resolve(new Response(null, { status: 204 }))),
  );
  const client = new VoiceClient();
  const start = client.start(context, () => {}).catch((error) => error);
  await tick();
  await client.stop();
  expect((await start).name).toBe("AbortError");
  expect(env.stopped()).toBe(1);
  reply(
    Response.json({ session: { id: "late" }, transport: { sdp: "answer" } }),
  );
  await tick();
  expect(deleted).toEqual(["/api/v1/voice/sessions/late"]);
});

test("cancel while microphone permission is pending stops a late microphone", async () => {
  const env = setup();
  let grant!: (value: unknown) => void;
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((resolve) => {
            grant = resolve;
          }),
      },
    },
    configurable: true,
  });
  const client = new VoiceClient();
  const start = client.start(context, () => {}).catch((error) => error);
  await client.stop();
  expect((await start).name).toBe("AbortError");
  grant(env.media);
  await tick();
  expect(env.stopped()).toBe(1);
});

test("cleanup failure preserves the original negotiation error", async () => {
  const env = setup(true);
  global("fetch", async (url: string) =>
    url.endsWith("/sessions")
      ? Response.json({ session: { id: "test" }, transport: { sdp: "answer" } })
      : Response.json({}, { status: 502 }),
  );
  const client = new VoiceClient();
  const start = client.start(context, () => {}).catch((error) => error);
  expect((await start).message).toBe("SDP rejected");
  expect(env.stopped()).toBe(1);
});
