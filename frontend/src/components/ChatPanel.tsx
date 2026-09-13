import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  Square,
  Sparkles,
  PanelRightClose,
} from "lucide-react";
import { streamChat, type Context } from "../lib/api";
import type { ReviewController } from "../lib/review";
import { VoiceClient } from "../lib/voice";

export function ChatPanel({
  context,
  onEvent,
  controller: review,
  bridgeStatus,
  visible,
  onHide,
}: {
  context: Context | null;
  controller: ReviewController;
  bridgeStatus: string;
  visible: boolean;
  onHide(): void;
  onEvent: (name: string, data: unknown) => void;
}) {
  const [messages, setMessages] = useState<Context["history"]>([]);
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [transcripts, setTranscripts] = useState<Context["history"]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = textareaRef.current;
    if (field && visible) {
      field.style.height = "auto";
      field.style.height = `${Math.min(140, Math.max(56, field.scrollHeight))}px`;
    }
  }, [draft, visible]);
  useEffect(() => {
    if (!visible) {
      const client = voice.current;
      voice.current = undefined;
      setLive(false);
      setConnecting(false);
      setProgress("");
      void client?.stop();
    }
  }, [visible]);
  const abort = useRef<AbortController>();
  const voice = useRef<VoiceClient>();
  const mounted = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const current = useRef(context);
  current.current = context;
  const eventHandler = useRef(onEvent);
  eventHandler.current = onEvent;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      void voice.current?.stop().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (live && current.current)
      void voice.current
        ?.update({ ...current.current, history: messages.slice(-40) })
        .catch((e) => setError(String(e)));
  }, [context?.selected_guids.join(","), context?.schedule, live]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, answer, transcripts]);
  function event(name: string, raw: unknown) {
    if (!mounted.current) return;
    const data = raw as {
      message?: string;
      tool?: string;
      role: "user" | "assistant";
      text: string;
    };
    if (name === "error") setError(data.message || "Voice connection failed");
    if (name === "progress")
      setProgress(
        data.message ||
          `Checking ${data.tool?.replaceAll("_", " ") || "model"}…`,
      );
    if (name === "closed") {
      setLive(false);
      setConnecting(false);
      setProgress("");
    }
    if (name === "transcript")
      setTranscripts((old) => {
        const last = old[old.length - 1];
        return last?.role === data.role
          ? [
              ...old.slice(0, -1),
              { ...last, content: last.content + data.text },
            ]
          : [...old, { role: data.role, content: data.text }];
      });
    eventHandler.current(name, raw);
  }
  async function send(text: string) {
    if (!context || !text.trim() || busy || live || connecting) return;
    setDraft("");
    setBusy(true);
    setAnswer("");
    setError("");
    const history = messages.slice(-40);
    let response = "";
    let complete = false;
    setMessages((old) => [...old, { role: "user", content: text }]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const local = await review.command(text);
      if (local) {
        setMessages((old) => [...old, { role: "assistant", content: local }]);
        return;
      }
      await streamChat(
        { ...context, history, message: text },
        controller.signal,
        (name, raw) => {
          if (!mounted.current) return;
          if (name === "text_delta") {
            response += (raw as { text: string }).text;
            setAnswer(response);
          }
          if (name === "done")
            complete = (raw as { status: string }).status === "complete";
          event(name, raw);
        },
      );
      if (mounted.current && complete) {
        setMessages((old) => [
          ...old,
          { role: "assistant", content: response },
        ]);
        setAnswer("");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function toggleVoice() {
    if (live || connecting) {
      const client = voice.current;
      voice.current = undefined;
      setLive(false);
      setConnecting(false);
      setProgress("");
      await client?.stop();
      return;
    }
    if (!context || connecting) return;
    const client = new VoiceClient();
    voice.current = client;
    setConnecting(true);
    setError("");
    try {
      await client.start(
        { ...context, history: messages.slice(-40) },
        (name, data) => {
          if (voice.current === client) event(name, data);
        },
      );
      if (!mounted.current || voice.current !== client) {
        await client.stop();
        return;
      }
      if (current.current)
        await client.update({
          ...current.current,
          history: messages.slice(-40),
        });
      if (voice.current === client && mounted.current) setLive(true);
    } catch (e) {
      if (mounted.current && voice.current === client) {
        setError(e instanceof Error ? e.message : String(e));
        setProgress("");
      }
    } finally {
      if (mounted.current && voice.current === client) setConnecting(false);
    }
  }
  return (
    <aside className="chat-panel">
      <div className="panel-heading">
        <span>
          <Sparkles size={16} /> Model assistant
        </span>
        <div className="chat-heading-actions">
          <span className="badge" title={bridgeStatus}>
            ASTRA
          </span>
          <button
            type="button"
            aria-label="Close chat panel"
            title="Hide chat panel"
            onClick={onHide}
          >
            <PanelRightClose size={17} />
          </button>
        </div>
      </div>
      <div className="chat-context">
        <span className="dot" />{" "}
        {context
          ? context.selected_guids.length
            ? "Selected element context"
            : "Whole model connected"
          : "Waiting for a model"}
      </div>
      <div className="messages">
        {!messages.length && (
          <>
            <div className="assistant-intro">
              <h2>
                A clearer view of
                <br />
                your building.
              </h2>
              <p>
                Explore your model, verify materials, and ask questions backed
                by IFC data.
              </p>
            </div>
            <div className="suggestions">
              {[
                "How many doors are there? Show them.",
                "Check the schedule materials and isolate failures.",
                "Tell me about the selected element",
              ].map((text) => (
                <button
                  key={text}
                  disabled={!context || busy || live || connecting}
                  onClick={() => void send(text)}
                >
                  {text}
                  <ArrowUp size={14} />
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <small>{m.role === "user" ? "YOU" : "ASTRA"}</small>
            <p>{m.content}</p>
          </div>
        ))}
        {answer && (
          <div className="message assistant">
            <small>ASTRA</small>
            <p>{answer}</p>
          </div>
        )}
        {transcripts.map((m, i) => (
          <div key={`voice-${i}`} className={`message ${m.role}`}>
            <small>{m.role === "user" ? "YOU · VOICE" : "GPT-LIVE"}</small>
            <p>{m.content}</p>
          </div>
        ))}
        {(busy || live || connecting) && progress && (
          <p className="muted">{progress}</p>
        )}
        <div ref={end} />
      </div>
      <div className="chat-bottom">
        {live && (
          <div className="voice-session" role="status">
            <div className="voice-orb" />
            <strong>Voice conversation active</strong>
            <span>Speak a model command or question</span>
          </div>
        )}
        {context?.selected_guids.length ? (
          <div className="selection-context">
            Context · {context.selected_guids[0]}
          </div>
        ) : null}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            aria-label="Message model assistant"
            placeholder="Ask about your model…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <div className="composer-actions">
            <span>Verified IFC data</span>
            <div className="composer-buttons">
              <button
                type="button"
                className={`voice-icon ${live ? "active" : ""}`}
                aria-label={
                  connecting
                    ? "Cancel voice connection"
                    : live
                      ? "End voice conversation"
                      : "Start voice conversation"
                }
                title={
                  connecting
                    ? "Cancel voice connection"
                    : live
                      ? "End voice conversation"
                      : "Start voice conversation"
                }
                aria-pressed={live}
                onClick={() => void toggleVoice()}
                disabled={!context || busy}
              >
                {live || connecting ? (
                  <Square size={17} />
                ) : (
                  <AudioLines size={20} />
                )}
              </button>
              <button
                className="send"
                aria-label="Send message"
                disabled={
                  !context || busy || live || connecting || !draft.trim()
                }
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
