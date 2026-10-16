// No radio samples pass through the rendering thread. The socket worker sends
// PCM directly to AudioWorklet through a MessageChannel.
function deadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
const BUSY_MESSAGE = 'The receiver is in use in another browser tab. Stop it there, then press Start here.';

export class ReceiverTransport extends EventTarget {
  constructor() {
    super();
    this.worker = null;
    this.context = null;
    this.volume = 0.7;
    this.session = null;
    this.connected = false;
    this.connecting = null;
    this.audioReady = null;
    this.actionRevision = 0;
    this.connectionRevision = 0;
    this.startupTimeoutMs = 5000;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async probe() {
    const response = await fetch('/api/session', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('The local receiver bridge is unavailable. Check that its launcher is running.');
    this.session = await response.json();
    return this.session;
  }
  async connect() {
    if (this.connected) return this.session;
    if (this.connecting) return this.connecting;
    const pending = this.open();
    this.connecting = pending;
    try { return await pending; }
    finally { if (this.connecting === pending) this.connecting = null; }
  }
  async open() {
    const revision = ++this.connectionRevision;
    await this.probe();
    if (revision !== this.connectionRevision) throw new DOMException('Connection cancelled.', 'AbortError');
    if (this.session.receiverBusy) throw new Error(BUSY_MESSAGE);
    if (this.worker) this.worker.terminate();
    const worker = new Worker(new URL('./stream-worker.js', import.meta.url), { type: 'module' });
    this.worker = worker;
    await new Promise((resolve, reject) => {
      const fail = error => {
        clearTimeout(timer); worker.terminate();
        if (this.worker === worker) { this.worker = null; this.connected = false; }
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('The receiver connection timed out.')), 5000);
      this.cancelConnection = () => fail(new DOMException('Connection cancelled.', 'AbortError'));
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || revision !== this.connectionRevision) return;
        if (data.type === 'connected') {
          clearTimeout(timer); this.cancelConnection = null; this.connected = true; resolve();
        } else if (data.type === 'disconnected') {
          clearTimeout(timer); this.connected = false;
          reject(new Error(data.message || 'The receiver connection closed.'));
          this.emit('status', { running: false, connected: false, error: data.message, receiverBusy: data.code === 'receiver_busy' });
        } else if (data.type === 'error') {
          this.emit('error', { message: data.message });
        } else this.emit(data.type, data);
      };
      worker.onerror = () => {
        if (this.worker !== worker || revision !== this.connectionRevision) return;
        clearTimeout(timer); this.connected = false;
        const message = 'The audio connection worker could not start. Reload this page.';
        fail(new Error(message)); this.emit('error', { message });
      };
      const url = new URL('/stream', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('token', this.session.token);
      worker.postMessage({ type: 'connect', url: url.href });
    });
    // A reconnect needs a fresh direct audio port, but keeps the audio context.
    if (this.node) this.attachAudio();
    return this.session;
  }
  async devices() {
    const response = await fetch('/api/devices', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not detect receivers.');
    return result;
  }
  async prepareAudio() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass || !globalThis.AudioWorkletNode) throw new Error('Use a browser with AudioWorklet support on localhost.');
      this.context = new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' });
      const context = this.context;
      this.audioReady = context.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url)).then(() => {
        if (this.context !== context || context.state === 'closed') throw new DOMException('Audio startup cancelled.', 'AbortError');
        this.node = new AudioWorkletNode(context, 'sdr-playback', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume;
        this.node.connect(this.gain).connect(this.context.destination);
        this.node.port.onmessage = ({ data }) => {
          if (this.context === context) this.emit('audio-metrics', { ...data, outputLatency: context.outputLatency || 0, baseLatency: context.baseLatency || 0 });
        };
      }).catch(error => {
        if (this.context === context) {
          this.context = null; this.node = null; this.gain = null; this.audioReady = null;
          context.close().catch(() => {});
        }
        throw error;
      });
    }
    // Called before any network await so the click authorizes browser audio.
    const context = this.context;
    const resumed = context.resume();
    try {
      await deadline(Promise.all([resumed, this.audioReady]), this.startupTimeoutMs,
        'Browser audio could not start. Check that sound is allowed for this site in Brave, then press Start again.');
      if (context.state !== 'running') throw new Error('Browser audio is paused. Allow sound for this site, then press Start again.');
    } catch (error) {
      if (this.context === context) {
        this.context = null; this.node = null; this.gain = null; this.audioReady = null;
        context.close().catch(() => {});
      }
      throw error;
    }
  }
  attachAudio() {
    const channel = new MessageChannel();
    this.node.port.postMessage({ type: 'attach', port: channel.port1 }, [channel.port1]);
    this.worker.postMessage({ type: 'audio-port', port: channel.port2 }, [channel.port2]);
  }
  async start(settings) {
    this.cancelStartWait?.();
    const revision = ++this.actionRevision;
    try {
      await this.prepareAudio();
      if (revision !== this.actionRevision) return false;
      await this.connect();
      if (revision !== this.actionRevision) return false;
      this.attachAudio();
      const acknowledged = new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          this.removeEventListener('status', status);
          this.removeEventListener('error', error);
          if (this.cancelStartWait === cancel) this.cancelStartWait = null;
        };
        const finish = failure => { cleanup(); failure ? reject(failure) : resolve(); };
        const status = ({ detail }) => {
          if (detail.error) finish(new Error(detail.error));
          else if (detail.running && detail.reset && detail.frequency === settings.frequency && detail.mode === settings.mode) finish();
        };
        const error = ({ detail }) => finish(new Error(detail.message));
        const cancel = () => finish(new DOMException('Receiver start cancelled.', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('The receiver did not start in time. Check its USB connection and close other SDR apps, then try again.')), this.startupTimeoutMs);
        this.cancelStartWait = cancel;
        this.addEventListener('status', status); this.addEventListener('error', error);
        try { this.send({ ...settings, type: 'start' }); }
        catch (failure) { finish(failure); }
      });
      await acknowledged;
    } catch (error) {
      if (revision !== this.actionRevision) return false;
      this.release();
      throw error;
    }
    if (revision !== this.actionRevision) return false;
    return true;
  }
  cancelPendingStart() { this.actionRevision++; this.cancelStartWait?.(); }
  send(command) {
    if (!this.connected) throw new Error('Connect to the local receiver bridge first.');
    this.worker.postMessage({ type: 'command', command });
  }
  async tune(settings) { this.send({ ...settings, type: 'tune' }); }
  async stop() {
    this.cancelPendingStart();
    if (this.connected) this.send({ type: 'stop' });
    this.release();
    this.node?.port.postMessage({ type: 'reset' });
    this.emit('status', { running: false, released: true });
  }
  release() {
    this.connectionRevision++;
    this.cancelConnection?.(); this.cancelConnection = null; this.connecting = null;
    const worker = this.worker;
    this.worker = null; this.connected = false;
    worker?.postMessage({ type: 'close' });
    // Also release a worker stalled before it could handle the close command.
    if (worker) setTimeout(() => worker.terminate(), 500);
  }
  setSpectrum(enabled) { if (this.connected) this.send({ type: 'spectrum', enabled: !!enabled }); }
  setSquelch(value) { if (this.connected) this.send({ type: 'squelch', value }); }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.gain) this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01);
  }
  close() {
    this.cancelPendingStart(); this.release();
    this.node?.port.postMessage({ type: 'reset' });
    this.context?.close().catch(() => {}); this.context = null; this.node = null; this.gain = null; this.audioReady = null;
    this.connected = false;
  }
}
