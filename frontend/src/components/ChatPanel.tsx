import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  Square,
  Sparkles,
  PanelRightClose,
} from "lucide-react";
import type { ReviewController } from "../lib/review";
import { assistantAPI } from "../mock-api";
import type { ModelRow } from "../lib/model";
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult:
    | ((event: {
        results: { isFinal: boolean; 0: { transcript: string } }[];
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function ChatPanel({
  controller,
  bridgeStatus,
  rows,
  selected,
  name,
  visible,
  onHide,
}: {
  controller: ReviewController;
  bridgeStatus: string;
  rows: ModelRow[];
  selected?: ModelRow;
  name: string;
  visible: boolean;
  onHide(): void;
}) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
      [],
    ),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = textareaRef.current;
    if (field && visible) {
      field.style.height = "auto";
      field.style.height = `${Math.min(160, Math.max(76, field.scrollHeight))}px`;
    }
  }, [draft, visible]);
  useEffect(() => {
    if (!visible) stop();
  }, [visible]);
  const recognition = useRef<Recognition>(),
    liveRef = useRef(false),
    replying = useRef(false),
    end = useRef<HTMLDivElement>(null),
    sendRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  useEffect(
    () => () => {
      liveRef.current = false;
      recognition.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    setBusy(true);
    replying.current = true;
    setError("");
    recognition.current?.stop();
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const action = await controller.command(text);
      const response = action
        ? { text: action }
        : await assistantAPI.chat({
            message: text,
            modelName: name,
            elements: rows,
            selected,
          });
      setMessages((m) => [...m, { role: "assistant", text: response.text }]);
      if (liveRef.current && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(response.text);
        utterance.onend = () => {
          replying.current = false;
          if (liveRef.current) startListening();
        };
        utterance.onerror = () => stop();
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not get a reply. Please try again.",
      );
      stop();
    } finally {
      setBusy(false);
    }
  }
  sendRef.current = (text) => void send(text);
  function stop() {
    liveRef.current = false;
    replying.current = false;
    setLive(false);
    recognition.current?.stop();
    window.speechSynthesis?.cancel();
  }
  function startListening() {
    try {
      recognition.current?.start();
    } catch {
      setError("Unable to resume microphone. Start voice conversation again.");
      stop();
    }
  }
  function toggleVoice() {
    if (live) {
      stop();
      return;
    }
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) {
      setError(
        "Speech recognition is unavailable. Use Chrome or Edge, or type a message.",
      );
      return;
    }
    const r = new Constructor();
    recognition.current = r;
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (event) => {
      const result = event.results[event.resultIndex];
      if (result.isFinal) sendRef.current(result[0].transcript);
    };
    r.onerror = (event) => {
      setError(`Microphone: ${event.error}. You can still type a message.`);
      stop();
    };
    r.onend = () => {
      if (liveRef.current && !replying.current) {
        setError("Listening ended. Start voice conversation to try again.");
        stop();
      }
    };
    liveRef.current = true;
    setLive(true);
    setError("");
    try {
      r.start();
    } catch {
      setError("Unable to start microphone. Check browser permissions.");
      stop();
    }
  }
  return (
    <aside className="chat-panel">
      <div className="panel-heading">
        <span>
          <Sparkles size={16} /> Model assistant
        </span>
        <div className="chat-heading-actions">
          <span className="badge">{bridgeStatus}</span>
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
      <div className="messages">
        {!messages.length && (
          <div className="assistant-intro">
            <h2>
              A clearer view of
              <br />
              your building.
            </h2>
            <p>
              Explore your model, understand its elements, and turn questions
              into insights.
            </p>
          </div>
        )}
        {!messages.length && (
          <div className="suggestions">
            {[
              "Summarize this model",
              "Isolate selected element",
              "Measure selected element",
              "Draft an issue",
              "Tell me about the selected element",
            ].map((text) => (
              <button
                key={text}
                onClick={() => void send(text)}
                disabled={busy}
              >
                {text}
                <ArrowUp size={14} />
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <small>{m.role === "user" ? "YOU" : "MODEL ASSISTANT"}</small>
            <p>{m.text}</p>
          </div>
        ))}
        {busy && <p className="muted">Reading model context…</p>}
        <div ref={end} />
      </div>
      <div className="chat-bottom">
        {live && (
          <div
            className={`voice-session ${busy ? "thinking" : ""}`}
            role="status"
          >
            <div className="voice-orb" />
            <strong>
              {busy ? "Working with your model…" : "Voice conversation active"}
            </strong>
            <span>Speak a model command or question</span>
          </div>
        )}
        {selected && (
          <div className="selection-context">
            Context · #{selected.id} {selected.type}
          </div>
        )}
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
            rows={3}
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
            <span>Local model assistant</span>
            <div className="composer-buttons">
              <button
                type="button"
                className={`voice-icon ${live ? "active" : ""}`}
                aria-label={
                  live ? "End voice conversation" : "Start voice conversation"
                }
                title={
                  live ? "End voice conversation" : "Start voice conversation"
                }
                aria-pressed={live}
                onClick={toggleVoice}
                disabled={busy && !live}
              >
                {live ? <Square size={17} /> : <AudioLines size={20} />}
              </button>
              <button
                className="send"
                aria-label="Send message"
                disabled={busy || !draft.trim()}
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
