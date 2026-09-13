import {api, json, type Context} from './api';

export class VoiceClient {
  private pc: RTCPeerConnection | null = null;
  private media: MediaStream | null = null;
  private events: EventSource | null = null;
  private id: string | null = null;
  private stopped = false;
  private audio = new Audio();

  async start(context: Context, onEvent: (name: string, data: unknown) => void) {
    this.stopped = false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({audio: true});
      if (this.stopped) {media.getTracks().forEach(t => t.stop()); return;}
      this.media = media;
      const pc = new RTCPeerConnection(); this.pc = pc;
      this.audio.autoplay = true;
      pc.ontrack = event => {this.audio.srcObject = event.streams[0]; this.audio.play().catch(() => onEvent('error', {message: 'Browser blocked voice playback. Allow audio and restart voice.'}));};
      this.media.getTracks().forEach(track => pc.addTrack(track, media));
      pc.createDataChannel('oai-events');
      pc.onconnectionstatechange = () => {if (pc.connectionState === 'failed') onEvent('error', {message: 'Voice media connection failed; restart voice.'});};
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {pc.removeEventListener('icegatheringstatechange', ready); reject(new Error('Voice connection negotiation timed out'));}, 15000);
          function ready() {if (pc.iceGatheringState === 'complete') {clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', ready); resolve();}}
          pc.addEventListener('icegatheringstatechange', ready); ready();
        });
      }
      if (this.stopped) return;
      const result = await api<{session: {id: string}; transport: {sdp: string}}>('/voice/sessions', json({...context, sdp: pc.localDescription?.sdp}));
      this.id = result.session.id;
      if (this.stopped) {await this.stop(); return;}
      this.events = new EventSource(`/api/v1/voice/sessions/${this.id}/events`);
      for (const name of ['progress', 'text_delta', 'result', 'viewer_action', 'done', 'transcript', 'error', 'closed']) {
        this.events.addEventListener(name, event => {
          if (event instanceof MessageEvent) onEvent(name, JSON.parse(event.data));
          if (name === 'closed') void this.stop();
        });
      }
      await pc.setRemoteDescription({type: 'answer', sdp: result.transport.sdp});
    } catch (error) {await this.stop(); throw error;}
  }
  async update(context: Context) {if (this.id) await api(`/voice/sessions/${this.id}`, json(context, 'PATCH'));}
  async stop() {
    this.stopped = true;
    this.events?.close(); this.events = null;
    this.pc?.close(); this.pc = null;
    this.media?.getTracks().forEach(track => track.stop()); this.media = null;
    this.audio.pause(); this.audio.srcObject = null;
    const id = this.id; this.id = null;
    if (id) await api(`/voice/sessions/${id}`, {method: 'DELETE'});
  }
}
