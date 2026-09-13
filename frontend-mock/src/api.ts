export type Model = {id: string; model_id: string; model_revision: string; filename: string; summary: {element_count: number; schema: string}};
export type Entity = {GlobalId: string; Name: string | null; ifc_class: string; express_id: number};
export type Schedule = {workbook_id: string; sheet: string; guid_column: string; material_column: string; header_row: number};
export type Context = {model_id: string; model_revision: string; selected_guids: string[]; schedule: Schedule | null; history: {role: 'user' | 'assistant'; content: string}[]};
export type Action = {model_id: string; model_revision: string; action: 'select' | 'highlight' | 'isolate' | 'frame' | 'reset'; guids: string[]; color?: [number, number, number, number]};
export type Finding = {GlobalId: string; status: string; reason: string; actual: string[]; expected: string; source: {sheet: string; row: number}};
export type Report = {id: string; model_id: string; model_revision: string; findings: Finding[]; counts: Record<string,number>; uncovered_door_guids: string[]};
export type Workbook = {id: string; sheets: {name: string; preview: (string | number | null)[][]}[]};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? JSON.stringify(body?.detail ?? response.statusText));
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const json = (body: unknown, method = 'POST'): RequestInit => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
export const upload = <T>(path: string, file: File) => {
  const body = new FormData(); body.append('file', file); return api<T>(path, {method: 'POST', body});
};

export async function streamChat(body: unknown, signal: AbortSignal, onEvent: (event: string, data: unknown) => void) {
  const response = await fetch('/api/v1/chat', {...json(body), signal});
  if (!response.ok) {
    const error = await response.json(); throw new Error(error.error?.message ?? JSON.stringify(error));
  }
  if (!response.body) throw new Error('Chat stream unavailable');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      pending += decoder.decode(value, {stream: !done});
      let split: number;
      while ((split = pending.indexOf('\n\n')) !== -1) {
        const frame = pending.slice(0, split); pending = pending.slice(split + 2);
        const event = frame.split('\n').find(l => l.startsWith('event: '))?.slice(7);
        const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
        if (event && data) onEvent(event, JSON.parse(data));
      }
      if (done) break;
    }
  } finally {reader.releaseLock();}
}
