import { api, json, type Context } from "./api";

/** Wait for a browser operation without leaving timers/listeners after cancellation. */
function bounded<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Voice connection cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error(message));
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error) => {
        finish();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

export class VoiceClient {
  private pc: RTCPeerConnection | null = null;
  private media: MediaStream | null = null;
  private events: EventSource | null = null;
  private id: string | null = null;
  private controller = new AbortController();
  private audio = new Audio();

  async start(
    context: Context,
    onEvent: (name: string, data: unknown) => void,
  ) {
    const signal = this.controller.signal;
    const progress = (message: string) => onEvent("progress", { message });
    try {
      progress("Waiting for microphone permission…");
      const media = await bounded(
        navigator.mediaDevices.getUserMedia({ audio: true }).then((media) => {
          // Permission can resolve after cancellation; never leave the microphone running.
          if (signal.aborted)
            media.getTracks().forEach((track) => track.stop());
          return media;
        }),
        signal,
        20000,
        "Microphone permission timed out. Allow microphone access and try again.",
      );
      this.media = media;
      const pc = new RTCPeerConnection();
      this.pc = pc;
      this.audio.autoplay = true;
      pc.ontrack = (event) => {
        this.audio.srcObject =
          event.streams[0] ?? new MediaStream([event.track]);
        this.audio.play().catch(() =>
          onEvent("error", {
            message:
              "Browser blocked voice playback. Allow audio and restart voice.",
          }),
        );
      };
      media.getTracks().forEach((track) => pc.addTrack(track, media));
      pc.createDataChannel("oai-events");
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && !signal.aborted) {
          onEvent("error", {
            message:
              "Voice audio connection failed. Check your network or VPN and restart voice.",
          });
          onEvent("closed", {});
          void this.stop();
        }
      };
      progress("Preparing voice audio connection…");
      await bounded(
        pc.setLocalDescription(await pc.createOffer()),
        signal,
        5000,
        "Could not prepare voice audio.",
      );
      // GPT-Live expects gathered candidates in its single SDP exchange.
      await this.waitFor(
        pc,
        "icegatheringstatechange",
        () => pc.iceGatheringState === "complete",
        10000,
        "Voice network negotiation timed out. Check your network or VPN.",
      );
      progress("Connecting to GPT-Live…");
      // Keep the request alive on cancellation so a late session ID can be closed.
      const creation = api<{
        session: { id: string };
        transport: { sdp: string };
      }>("/voice/sessions", {
        ...json({ ...context, sdp: pc.localDescription?.sdp }),
        signal: AbortSignal.timeout(35000),
      }).then(async (result) => {
        this.id = result.session.id;
        if (signal.aborted) await this.stop();
        return result;
      });
      const result = await bounded(
        creation,
        signal,
        35000,
        "GPT-Live did not respond within 35 seconds. Please retry.",
      );
      this.events = new EventSource(`/api/v1/voice/sessions/${this.id}/events`);
      for (const name of [
        "progress",
        "text_delta",
        "result",
        "viewer_action",
        "done",
        "transcript",
        "error",
        "closed",
      ]) {
        this.events.addEventListener(name, (event) => {
          if (signal.aborted) return;
          if (event instanceof MessageEvent)
            onEvent(name, JSON.parse(event.data));
          if (name === "closed") void this.stop();
        });
      }
      progress("Connecting microphone audio…");
      await bounded(
        pc.setRemoteDescription({ type: "answer", sdp: result.transport.sdp }),
        signal,
        5000,
        "Could not negotiate GPT-Live audio.",
      );
      await this.waitFor(
        pc,
        "connectionstatechange",
        () => pc.connectionState === "connected",
        12000,
        "GPT-Live started, but audio could not connect. Check your network or VPN and retry.",
      );
      progress("Voice connected — you can speak now.");
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async waitFor(
    pc: RTCPeerConnection,
    event: string,
    ready: () => boolean,
    ms: number,
    message: string,
  ) {
    let check = () => {};
    const operation = new Promise<void>((resolve) => {
      check = () => {
        if (ready()) resolve();
      };
      pc.addEventListener(event, check);
      check();
    });
    try {
      await bounded(operation, this.controller.signal, ms, message);
    } finally {
      pc.removeEventListener(event, check);
    }
  }

  async update(context: Context) {
    if (this.id && !this.controller.signal.aborted)
      await api(`/voice/sessions/${this.id}`, {
        ...json(context, "PATCH"),
        signal: AbortSignal.timeout(10000),
      });
  }

  async stop() {
    this.controller.abort();
    this.events?.close();
    this.events = null;
    this.pc?.close();
    this.pc = null;
    this.media?.getTracks().forEach((track) => track.stop());
    this.media = null;
    this.audio.pause();
    this.audio.srcObject = null;
    const id = this.id;
    this.id = null;
    // Cleanup failures must not hide the original connection error or block the UI.
    if (id)
      await api(`/voice/sessions/${id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
  }
}
