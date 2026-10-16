// 64 ms reserve, 160 ms maximum queued audio. An overrun discards old audio
// instead of allowing listening delay to grow. Rendering never allocates.
class SDRPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(16384);
    this.read = 0; this.write = 0; this.count = 0; this.playing = false;
    this.reserve = 3072; this.maximum = 7680;
    this.underruns = 0; this.droppedFrames = 0; this.reportFrames = 0;
    this.phase = 0; this.ratio = 48000 / sampleRate;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'attach') {
        this.input?.close(); this.input = data.port;
        this.input.onmessage = event => this.receive(event.data);
        this.clear();
      } else this.receive(data);
    };
  }
  clear() { this.read = this.write = this.count = 0; this.phase = 0; this.playing = false; }
  receive(data) {
    if (data.type === 'reset') { this.clear(); return; }
    if (data.type !== 'pcm') return;
    const pcm = new Float32Array(data.buffer, data.offset || 0);
    this.input?.postMessage({ type: 'accepted' });
    let offset = Math.max(0, pcm.length - this.maximum);
    this.droppedFrames += offset;
    const incoming = pcm.length - offset;
    if (this.count + incoming > this.maximum) {
      const drop = this.count + incoming - this.reserve;
      const fromQueue = Math.min(this.count, drop);
      this.read = (this.read + fromQueue) & 16383;
      this.count -= fromQueue; this.droppedFrames += fromQueue;
      const fromPacket = Math.min(incoming, drop - fromQueue);
      offset += fromPacket; this.droppedFrames += fromPacket;
      this.phase = 0;
    }
    for (let i = offset; i < pcm.length; i++) {
      this.ring[this.write] = Number.isFinite(pcm[i]) ? pcm[i] : 0;
      this.write = (this.write + 1) & 16383;
      this.count++;
    }
    if (!this.playing && this.count >= this.reserve) this.playing = true;
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    out.fill(0);
    if (this.playing) for (let i = 0; i < out.length; i++) {
      if (this.count < Math.max(2, Math.ceil(this.ratio))) {
        this.playing = false; this.underruns++; break;
      }
      const a = this.ring[this.read], b = this.ring[(this.read + 1) & 16383];
      out[i] = a + (b - a) * this.phase;
      this.phase += this.ratio;
      const advance = Math.floor(this.phase);
      this.phase -= advance;
      this.read = (this.read + advance) & 16383; this.count -= advance;
    }
    this.reportFrames += out.length;
    if (this.reportFrames >= sampleRate) {
      this.reportFrames = 0;
      this.port.postMessage({ queuedMs: this.count / 48, underruns: this.underruns, droppedFrames: this.droppedFrames });
    }
    return true;
  }
}
registerProcessor('sdr-playback', SDRPlayback);
