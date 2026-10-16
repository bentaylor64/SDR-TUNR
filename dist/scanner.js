// One receiver, one pass. This intentionally scans exact listed channels; it
// does not infer station identity from energy or re-label noisy data as speech.
export class ChannelScanner extends EventTarget {
  constructor(transport) {
    super(); this.transport = transport; this.run = null;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async start(channels, settings) {
    const valid = channels.filter(c => Number.isInteger(c.frequency) && c.frequency >= 25000000 && c.frequency <= 1750000000);
    if (!valid.length) throw new Error('This band has no listed channels to scan. Use precision tuning.');
    // Authorize audio while still inside the click handler, before any await.
    this.cancel(false);
    const run = { settings: { ...settings }, volume: this.transport.volume, cancelled: false, results: [], index: 0 };
    this.run = run;
    this.transport.setVolume(0);
    try {
      await this.transport.prepareAudio();
      if (run.cancelled || this.run !== run) return [];
      // Start owns hardware and unlocks audio on the user's click, even though
      // candidate measurements themselves are silent.
      await this.transport.start({ ...settings, frequency: valid[0].frequency, mode: valid[0].mode || settings.mode });
      if (run.cancelled || this.run !== run) return [];
      for (let i = 0; i < valid.length && !run.cancelled; i++) {
        const channel = valid[i]; run.index = i;
        this.emit('status', { running: true, index: i + 1, total: valid.length, message: `Checking channel ${i + 1} of ${valid.length}` });
        const observation = this.measure(channel, settings, run);
        if (i > 0) await this.transport.tune({ ...settings, frequency: channel.frequency, mode: channel.mode || settings.mode });
        const power = await observation;
        if (run.cancelled) break;
        if (power !== null) {
          const result = { frequency: channel.frequency, mode: channel.mode || settings.mode, power, name: channel.name || channel.label || 'Detected signal' };
          run.results.push(result);
          run.results.sort((a, b) => b.power - a.power);
          run.results.length = Math.min(12, run.results.length);
          this.emit('result', result);
        }
      }
    } catch (error) {
      if (!run.cancelled) this.emit('error', { message: error.message });
    } finally {
      run.endObservation?.();
      if (this.run === run) {
        this.run = null;
        this.transport.setVolume(run.volume);
        if (!run.cancelled) {
          try { await this.transport.tune(run.settings); } catch { /* Connection failure already surfaces in the receiver UI. */ }
        }
        this.emit('status', { running: false, index: run.index + 1, total: valid.length, message: run.cancelled ? 'Scan stopped' : 'Scan complete' });
        this.emit('complete', { results: run.results, cancelled: run.cancelled });
      }
    }
    return run.results;
  }
  measure(channel, settings, run) {
    return new Promise((resolve, reject) => {
      let started = 0, consecutive = 0, peak = -120;
      const onStatus = ({ detail: s }) => {
        if (s.running === false && s.error) return finish(new Error(s.error));
        if (s.frequency !== channel.frequency || s.mode !== (channel.mode || settings.mode) || !s.running) return;
        if (!started) { started = performance.now(); return; }
        if (performance.now() - started < 300 || !Number.isFinite(s.power)) return;
        if (s.power >= (settings.squelch ?? -60)) {
          consecutive++; peak = Math.max(peak, s.power);
          if (consecutive >= 2) finish(null, peak);
        } else consecutive = 0;
      };
      const onError = ({ detail }) => finish(new Error(detail.message));
      const finish = (error = null, result = null) => {
        clearTimeout(timer);
        this.transport.removeEventListener('status', onStatus);
        this.transport.removeEventListener('error', onError);
        run.endObservation = null;
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => finish(), 1300);
      run.endObservation = () => finish();
      this.transport.addEventListener('status', onStatus);
      this.transport.addEventListener('error', onError);
      if (run.cancelled) finish();
    });
  }
  async cancel(restore = true) {
    const run = this.run;
    if (!run) return;
    run.cancelled = true;
    this.transport.cancelPendingStart?.();
    run.endObservation?.();
    this.run = null;
    this.transport.setVolume(run.volume);
    if (restore) try { await this.transport.tune(run.settings); } catch { /* Closing also cancels a scan. */ }
    this.emit('status', { running: false, message: 'Scan stopped' });
    this.emit('complete', { results: run.results, cancelled: true });
  }
}
