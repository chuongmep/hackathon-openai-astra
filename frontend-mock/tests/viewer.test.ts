import {afterEach, expect, mock, test} from 'bun:test';

const calls: unknown[] = [];
const viewer = {
  on() {}, destroy() {},
  async loadModelBuffer() {},
  async selectByGuid(guids: string[]) {calls.push(['resolve', guids]); return {resolved: [42]};},
  async isolate(ids: number[]) {calls.push(['isolate', ids]);},
  async fitToView(ids: number[]) {calls.push(['frame', ids]);},
};
mock.module('@ifc-lite/embed-sdk', () => ({IFCLiteEmbed: {create: async () => viewer}}));
const {ViewerBridge} = await import('../src/viewer');
const originalFetch = globalThis.fetch;
afterEach(() => {globalThis.fetch = originalFetch; calls.length = 0;});

test('viewer resolves IFC GUIDs and rejects stale model/revision actions', async () => {
  Object.defineProperty(globalThis, 'window', {value: {location: {origin: 'http://localhost'}}, configurable: true});
  globalThis.fetch = (() => Promise.resolve(new Response(new Uint8Array([1])))) as typeof fetch;
  const bridge = new ViewerBridge();
  await bridge.mount({} as HTMLElement, () => {});
  await bridge.load({id: 'm', model_id: 'm', model_revision: 'r', filename: 'a.ifc', summary: {schema: 'IFC4', element_count: 1}});
  await bridge.apply({model_id: 'other', model_revision: 'r', action: 'isolate', guids: ['g']});
  await bridge.apply({model_id: 'm', model_revision: 'old', action: 'isolate', guids: ['g']});
  expect(calls).toEqual([]);
  await bridge.apply({model_id: 'm', model_revision: 'r', action: 'isolate', guids: ['g']});
  expect(calls).toEqual([['resolve', ['g']], ['isolate', [42]]]);
  bridge.destroy();
});
