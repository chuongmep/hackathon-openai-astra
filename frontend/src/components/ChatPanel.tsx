import { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, Mic, Square, Sparkles } from "lucide-react";
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
  rows,
  selected,
  name,
}: {
  rows: ModelRow[];
  selected?: ModelRow;
  name: string;
}) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
      [],
    ),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [error, setError] = useState("");
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
      const response = await assistantAPI.chat({
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
    } catch {
      setError("Could not get a reply. Please try again.");
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
        <span className="badge">DEMO</span>
      </div>
      <div className="chat-context">
        <span className="dot" />{" "}
        {rows.length ? "Model context connected" : "Waiting for a model"}
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
              "How many walls are there?",
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
            <span>Model-aware mock chat</span>
            <button
              className="send"
              aria-label="Send message"
              disabled={busy || !draft.trim()}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
        <button
          className={`voice ${live ? "active" : ""}`}
          onClick={toggleVoice}
          disabled={busy && !live}
        >
          {live ? <Square size={16} /> : <Mic size={16} />}{" "}
          {live ? "End voice conversation" : "Start voice conversation"}
          <AudioLines size={19} />
        </button>
        <p className="fine-print">
          Browser speech · demo replies · no AI backend
        </p>
      </div>
    </aside>
  );
}
