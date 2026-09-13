import { IFCLiteEmbed } from '@ifc-lite/embed-sdk';
import type {Action, Model} from './api';

export class ViewerBridge {
  private viewer: IFCLiteEmbed | null = null;
  private model: Model | null = null;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private applying = false;
  async mount(container: HTMLElement, selected: (guid: string | null) => void) {
    this.viewer = await IFCLiteEmbed.create({container, origin: window.location.origin, theme: 'dark'});
    this.viewer.on('entity-selected', data => {if (!this.applying) selected(data.globalId ?? null);});
    this.viewer.on('entity-deselected', () => {if (!this.applying) selected(null);});
  }
  async load(model: Model) {
    const generation = ++this.generation;
    this.model = null;
    await this.queue.catch(() => undefined);
    if (!this.viewer) throw new Error('Viewer is not ready');
    const response = await fetch(`/api/v1/models/${model.id}/file`);
    if (!response.ok) throw new Error('Unable to load IFC from backend');
    const bytes = await response.arrayBuffer();
    if (generation !== this.generation) return;
    await this.viewer.loadModelBuffer(bytes);
    if (generation === this.generation) this.model = model;
  }
  apply(action: Action): Promise<void> {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const viewer = this.viewer;
      if (!viewer || !this.model || action.model_id !== this.model.id || action.model_revision !== this.model.model_revision) return;
      this.applying = true;
      try {
        if (action.action === 'reset') {await viewer.showAll(); await viewer.resetColors(); await viewer.clearSelection(); await viewer.fitToView(); return;}
        const {resolved} = await viewer.selectByGuid(action.guids);
        if (!resolved.length) throw new Error('No requested entities could be resolved in the viewer');
        if (action.action === 'isolate') await viewer.isolate(resolved);
        if (action.action === 'frame') await viewer.fitToView(resolved);
        if (action.action === 'highlight') await viewer.setColors(Object.fromEntries(resolved.map(id => [id, action.color ?? [1, .25, .15, 1]])));
      } finally {this.applying = false;}
    });
    return this.queue;
  }
  destroy() {this.generation++; this.viewer?.destroy(); this.viewer = null;}
}
