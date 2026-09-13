import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api, json, upload, streamChat, type Model, type Entity, type Workbook, type Schedule, type Context, type Report, type Action} from './api';
import {ViewerBridge} from './viewer';
import {VoiceClient} from './voice';
import './style.css';

function App() {
  const [model, setModel] = useState<Model | null>(null);
  const [book, setBook] = useState<Workbook | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [details, setDetails] = useState<unknown>(null);
  const [status, setStatus] = useState('Starting local viewer…');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [tableOpen, setTableOpen] = useState(true);
  const [message, setMessage] = useState('How many doors are in this house? Show them.');
  const [conversation, setConversation] = useState<Context['history']>([]);
  const [answer, setAnswer] = useState('');
  const [transcript, setTranscript] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const bridge = useRef(new ViewerBridge());
  const voice = useRef(new VoiceClient());
  const abort = useRef<AbortController | null>(null);
  const active = useRef<Model | null>(null);
  const requestEpoch = useRef(0);
  const contextRef = useRef<Context | null>(null);
  const showError = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const context: Context | null = model ? {model_id: model.id, model_revision: model.model_revision,
    selected_guids: selection, schedule, history: conversation.slice(-40)} : null;
  contextRef.current = context;

  useEffect(() => {
    let disposed = false;
    void bridge.current.mount(container.current!, guid => setSelection(guid ? [guid] : []))
      .then(() => {if (!disposed) {setReady(true); setStatus('Upload an IFC model to begin');}}).catch(showError);
    return () => {disposed = true; bridge.current.destroy(); abort.current?.abort(); void voice.current.stop().catch(showError);};
  }, []);

  useEffect(() => {
    if (!model) return;
    const controller = new AbortController();
    void api<{items: Entity[]; total: number}>(`/models/${model.id}/entities?offset=${page * 100}&limit=100`, {signal: controller.signal})
      .then(r => {setEntities(r.items); setTotal(r.total);})
      .catch(e => {if (!controller.signal.aborted) showError(e);});
    return () => controller.abort();
  }, [model, page]);

  useEffect(() => {
    if (!model || !selection[0]) {setDetails(null); return;}
    const controller = new AbortController();
    void api(`/models/${model.id}/entities/${selection[0]}`, {signal: controller.signal}).then(setDetails)
      .catch(e => {if (!controller.signal.aborted) showError(e);});
    return () => controller.abort();
  }, [model, selection]);

  useEffect(() => {
    if (voiceOn && contextRef.current) void voice.current.update(contextRef.current).catch(showError);
  }, [selection, schedule]);

  function action(kind: Action['action'], guids: string[]) {
    if (kind === 'reset') setSelection([]);
    if (contextRef.current) void bridge.current.apply({...contextRef.current, action: kind, guids}).catch(showError);
  }

  async function loadFile(file: File) {
    setBusy(true); setError(''); requestEpoch.current++; abort.current?.abort();
    active.current = null;
    await voice.current.stop().catch(showError); setVoiceOn(false);
    setStatus('Parsing IFC on backend…'); setSelection([]); setReport(null); setConversation([]); setAnswer(''); setTranscript('');
    try {
      const loaded = await upload<Model>('/models', file);
      setModel(loaded); active.current = loaded; setPage(0);
      setStatus('Building 3D scene…'); await bridge.current.load(loaded);
      setStatus(`${loaded.summary.schema} · ${loaded.summary.element_count} elements`);
    } catch (e) {showError(e); setStatus('Model loading failed');}
    finally {setBusy(false);}
  }

  async function loadWorkbook(file: File) {
    setBusy(true); setError('');
    try {
      const loaded = await upload<Workbook>('/workbooks', file); setBook(loaded);
      const sheet = loaded.sheets.find(s => s.preview[0]?.includes('ExpectedMaterial')) ?? loaded.sheets[0];
      setSchedule({workbook_id: loaded.id, sheet: sheet.name, guid_column: 'GlobalId', material_column: 'ExpectedMaterial', header_row: 1});
      setReport(null);
    } catch (e) {showError(e);} finally {setBusy(false);}
  }

  async function validate() {
    if (!context || !schedule) return;
    setBusy(true); setError('');
    try {
      const result = await api<Report>('/validations', json({model_id: context.model_id, model_revision: context.model_revision, schedule}));
      setReport(result); setTableOpen(true);
      const failures = result.findings.filter(f => f.status === 'fail').map(f => f.GlobalId);
      if (failures.length) action('highlight', failures);
    } catch (e) {showError(e);} finally {setBusy(false);}
  }

  function handleEvent(name: string, raw: unknown) {
    const data = raw as Record<string, unknown>;
    if (name === 'error') setError(String(data.message));
    if (name === 'progress') setStatus(String(data.message ?? data.tool ?? 'Working…'));
    if (name === 'viewer_action') void bridge.current.apply(raw as Action).catch(showError);
    if (name === 'result' && data.tool === 'validate_materials') {
      const partial = data.data as Partial<Report>;
      if (partial.id) void api<Report>(`/validations/${partial.id}`).then(result => {
        if (active.current?.id === result.model_id && active.current.model_revision === result.model_revision) {setReport(result); setTableOpen(true);}
      }).catch(showError);
    }
    if (name === 'closed') {setVoiceOn(false); setStatus('Voice stopped');}
  }

  async function sendChat() {
    if (!context || !message.trim()) return;
    setError(''); setAnswer(''); setChatBusy(true);
    const question = message; const epoch = requestEpoch.current;
    abort.current = new AbortController(); let text = ''; let successful = false;
    try {
      await streamChat({...context, message: question}, abort.current.signal, (name, raw) => {
        if (epoch !== requestEpoch.current) return;
        if (name === 'text_delta') {text += (raw as {text: string}).text; setAnswer(text);}
        if (name === 'done') successful = (raw as {status: string}).status === 'complete';
        handleEvent(name, raw);
      });
      if (epoch === requestEpoch.current && successful) {setConversation(history => [...history, {role: 'user', content: question}, {role: 'assistant', content: text}]); setAnswer('');}
    } catch (e) {if (!abort.current.signal.aborted) showError(e);} finally {setChatBusy(false);}
  }

  async function toggleVoice() {
    if (voiceOn) {await voice.current.stop().catch(showError); setVoiceOn(false); return;}
    if (!context) return;
    setVoiceOn(true); setError(''); setStatus('Connecting microphone…');
    try {
      await voice.current.start(context, (name, raw) => {
        if (name === 'transcript') {const d = raw as {role: string; text: string}; setTranscript(t => t + (d.role === 'user' ? 'You: ' : 'Astra: ') + d.text + '\n');}
        handleEvent(name, raw);
      });
      setStatus('Voice connected');
    } catch (e) {showError(e); setVoiceOn(false);}
  }

  return <div className="app">
    <header><div><strong>Astra</strong><span>IFC Compliance · backend workbench</span></div><small>{status}</small></header>
    <div className="toolbar">
      <label className="button">Load IFC<input type="file" accept=".ifc" disabled={!ready || busy} onChange={e => e.target.files?.[0] && void loadFile(e.target.files[0])}/></label>
      <label className="button secondary">Load schedule<input type="file" accept=".xlsx" disabled={busy} onChange={e => e.target.files?.[0] && void loadWorkbook(e.target.files[0])}/></label>
      <button disabled={!model} onClick={() => action('reset', [])}>Reset view</button>
      <span>{model?.filename ?? 'No model loaded'}</span><a href="/api/docs" target="_blank">API docs ↗</a>
    </div>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <main><section className="scene"><div className="viewer" ref={container}/>
      {details !== null && <details className="properties"><summary>Selected element properties · {selection[0]}</summary><pre>{JSON.stringify(details, null, 2)}</pre></details>}
    </section><aside>
      <div className="panel-title"><h2>Model conversation</h2><span>{selection.length ? '1 selected' : 'Whole model'}</span></div>
      <div className="messages">{conversation.map((m, i) => <article key={i} className={m.role}><b>{m.role === 'user' ? 'You' : 'Astra'}</b><p>{m.content}</p></article>)}
        {answer && <article><b>Astra</b><p>{answer}</p></article>}
        {!conversation.length && !answer && <p className="hint">Ask about quantities or materials. Every model fact is looked up with IfcOpenShell.</p>}
        {transcript && <details open><summary>Live transcript</summary><pre>{transcript}</pre></details>}
      </div>
      <textarea aria-label="Message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask about your model…"/>
      <div className="chat-actions"><button className="primary" disabled={!model || busy || chatBusy || voiceOn} onClick={() => void sendChat()}>{chatBusy ? 'Checking…' : 'Send'}</button>
        <button disabled={!model || busy || chatBusy} onClick={() => void toggleVoice()}>{voiceOn ? 'Stop voice' : 'Start voice'}</button></div>
    </aside></main>
    <section className="table-panel"><div className="table-heading"><button onClick={() => setTableOpen(!tableOpen)}>{tableOpen ? '▾' : '▸'} {report ? 'Material validation' : 'Model entities'}</button>
      <span>{report ? `${JSON.stringify(report.counts)} · ${report.uncovered_door_guids.length} uncovered doors` : `${total} elements`}</span>
      {report && <><button onClick={() => {const ids = report.findings.filter(f => f.status === 'fail').map(f => f.GlobalId); if (ids.length) {action('isolate', ids); action('frame', ids);}}}>Isolate failures</button><a href={`/api/v1/validations/${report.id}?format=csv`}>Export CSV</a><button onClick={() => setReport(null)}>Model table</button></>}
    </div>
    {tableOpen && <>{book && schedule && <div className="schedule"><label>Sheet<select value={schedule.sheet} onChange={e => setSchedule({...schedule, sheet: e.target.value})}>{book.sheets.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <label>Header row<input type="number" min="1" max="1000" value={schedule.header_row} onChange={e => setSchedule({...schedule, header_row: Number(e.target.value)})}/></label>
      <label>GUID column<input value={schedule.guid_column} onChange={e => setSchedule({...schedule, guid_column: e.target.value})}/></label>
      <label>Material column<input value={schedule.material_column} onChange={e => setSchedule({...schedule, material_column: e.target.value})}/></label>
      <button className="primary" disabled={!model || busy} onClick={() => void validate()}>Check materials</button>
      <details><summary>Workbook preview</summary><pre>{JSON.stringify(book.sheets.find(s => s.name === schedule.sheet)?.preview, null, 2)}</pre></details>
    </div>}
    <div className="table-scroll"><table><thead><tr>{(report ? ['Status', 'GlobalId', 'Actual', 'Expected', 'Reason', 'Source row'] : ['Class', 'Name', 'GlobalId', 'Express ID']).map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{report ? report.findings.map((f, i) => <tr key={i} onClick={() => {setSelection([f.GlobalId]); action('select', [f.GlobalId]); action('frame', [f.GlobalId]);}}><td className={f.status}>{f.status}</td><td>{f.GlobalId}</td><td>{f.actual.join(', ') || 'Missing'}</td><td>{f.expected}</td><td>{f.reason}</td><td>{f.source.sheet}:{f.source.row}</td></tr>) : entities.map(e => <tr key={e.GlobalId} onClick={() => {setSelection([e.GlobalId]); action('select', [e.GlobalId]); action('frame', [e.GlobalId]);}}><td>{e.ifc_class}</td><td>{e.Name}</td><td>{e.GlobalId}</td><td>{e.express_id}</td></tr>)}</tbody></table></div>
      {!report && <div className="pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 100 >= total} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    </>}
    </section>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
