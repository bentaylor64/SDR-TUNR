// Public preview only. No driver, socket, microphone, or hardware access.
export class HostedDemoTransport extends EventTarget {
  constructor() {
    super();
    this.session = { demo: true, version: '1.14.0' };
    this.connected = true; this.running = false; this.volume = 0.65;
    this.revision = 0; this.spectrumEnabled = false; this.squelch = -60;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async probe() { this.connected = true; return this.session; }
  async devices() { return { demo: true, devices: [], driverAvailable: false }; }
  async prepareAudio() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error('This browser does not support the audio demo. Try a current desktop browser.');
    if (!this.context) {
      this.context = new Audio({ latencyHint: 'interactive' });
      this.gain = this.context.createGain(); this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
    }
    const context = this.context;
    let timer;
    try {
      await Promise.race([context.resume(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio could not start. Allow sound for this site and try again.')), 5000);
      })]);
      if (context.state !== 'running') throw new Error('Audio is paused. Allow sound for this site and try again.');
    } catch (error) {
      if (this.context === context) { this.context = null; this.gain = null; }
      context.close().catch(() => {}); throw error;
    } finally { clearTimeout(timer); }
  }
  async start(settings) {
    const revision = ++this.revision;
    await this.prepareAudio();
    if (revision !== this.revision) return false;
    this.connected = true; this.running = true;
    this.center = settings.frequency;
    this.oscillator?.stop();
    this.oscillator = this.context.createOscillator();
    this.oscillator.connect(this.gain); this.oscillator.start();
    await this.tune(settings);
    this.updateTimer(); return true;
  }
  async tune(settings) {
    this.settings = { ...settings }; this.squelch = settings.squelch ?? this.squelch;
    if (Math.abs(settings.frequency - this.center) > 600000) this.center = settings.frequency;
    if (this.oscillator) this.oscillator.frequency.setTargetAtTime(440 + ((settings.frequency % 100000) / 100000) * 220, this.context.currentTime, 0.02);
    this.updateGain();
    this.emit('status', { ...settings, running: this.running, demo: true, reset: true, power: -42 });
  }
  updateGain() {
    if (this.gain) this.gain.gain.setTargetAtTime(this.running && this.squelch <= -42 ? this.volume * 0.035 : 0, this.context.currentTime, 0.015);
  }
  setVolume(value) { this.volume = Math.max(0, Math.min(1, Number(value) || 0)); this.updateGain(); }
  setSquelch(value) { this.squelch = value; this.updateGain(); }
  setSpectrum(enabled) { this.spectrumEnabled = !!enabled; this.updateTimer(); }
  updateTimer() {
    clearInterval(this.timer); this.timer = null;
    if (this.running && this.spectrumEnabled) this.timer = setInterval(() => this.frame(), 100);
  }
  frame() {
    const bins = new Float32Array(1024);
    const phase = performance.now() / 700;
    for (let i = 0; i < bins.length; i++) {
      const x = (i / bins.length - 0.5) * 1536000;
      const peak = (center, width, height) => height * Math.exp(-(((x - center) / width) ** 2));
      bins[i] = -105 + 3 * Math.sin(i * 2.37 + phase) + peak(0, 8500, 63) + peak(-240000, 19000, 46) + peak(325000, 32000, 39);
    }
    this.emit('spectrum', { center: this.center, sampleRate: 1536000, bins });
  }
  cancelPendingStart() { this.revision++; }
  async stop() {
    this.cancelPendingStart(); this.running = false;
    this.updateTimer(); this.updateGain();
    this.oscillator?.stop(); this.oscillator = null;
    this.emit('status', { running: false, released: true, demo: true });
  }
  close() {
    this.stop(); this.context?.close().catch(() => {});
    this.context = null; this.gain = null; this.connected = false;
  }
}

export function setupHostedPreview() {
  const banner = document.createElement('aside');
  banner.className = 'hosted-banner'; banner.setAttribute('aria-label', 'Public testing preview');
  banner.innerHTML = '<div><strong>1.14.0 · Public testing preview</strong><p>Start demo plays a generated tone and spectrum. To test a real SDR, download the local receiver package.</p></div><a class="button" href="#connections">Use my SDR</a>';
  document.querySelector('main').prepend(banner);
  for (const id of ['detect-button', 'connection-detect']) document.getElementById(id).textContent = 'Use my SDR';
  document.querySelector('.spectrum-panel h2').lastChild.textContent = 'Demo spectrum';
  document.getElementById('spectrum').setAttribute('aria-label', 'Synthetic demo spectrum; click to tune');
  document.getElementById('waterfall').setAttribute('aria-label', 'Synthetic demo signal history');
  document.getElementById('waterfall-empty').textContent = 'Demo history appears when you start';
  document.getElementById('browser-status').textContent = 'Online demo · no hardware access';
  document.querySelector('.diagnostics').hidden = true;
  document.getElementById('identify-usb').hidden = true;
  document.getElementById('webusb-detail').textContent = 'USB identification is available in the downloaded local app. This public preview does not access your hardware.';
  for (const id of ['gain-setting', 'ppm-setting', 'device-setting']) document.getElementById(id).disabled = true;
  document.querySelector('#settings-form > p').textContent = 'Hardware settings are available in the local receiver app. This online demo generates a tone; it does not simulate the six radio demodulators.';
  const setup = document.createElement('article');
  setup.className = 'panel info-card hosted-setup'; setup.id = 'tester-setup';
  setup.innerHTML = `<h2>Test with your own receiver</h2>
    <p>The online demo works without hardware. Real reception runs in the same interface at a local address on your computer, using the SDR's USB driver.</p>
    <p><a class="button primary" href="/downloads/SDR-TUNR-1.14.0-browser-preview.zip" download>Download receiver package · 1.14.0</a></p>
    <p class="help-text"><a href="/downloads/SDR-TUNR-1.14.0-browser-preview.zip.sha256">SHA-256 checksum</a> · <a href="/downloads/README.txt" target="_blank" rel="noreferrer">Full setup instructions</a></p>
    <ol class="setup-steps">
      <li><strong>Unzip the package.</strong><p>Use a desktop computer with an RTL-SDR. Install Python 3.9 or later and the native RTL-SDR library.</p></li>
      <li><strong>Prepare your platform.</strong><p><b>macOS:</b> the package includes an Apple silicon radio core; install librtlsdr with Homebrew or MacPorts. Other architectures require a rebuild. <b>Windows:</b> follow the full instructions for WinUSB, the matching 64-bit RTL-SDR DLL and a one-time MinGW-w64 core build. Windows reception is not yet hardware-verified.</p></li>
      <li><strong>Launch your local receiver.</strong><p>Open <code>web/Launch-Web.command</code> on Mac or <code>web/Launch-Web.bat</code> on Windows after setup. Keep the launcher open and use the local browser page it opens. Select Detect receiver, then Start.</p></li>
    </ol>
    <p>Already running the helper on its default port? <a href="http://127.0.0.1:8780/#explore" target="_blank" rel="noreferrer">Open local receiver ↗</a></p>
    <p class="help-text">For feedback, send the person who shared this link your OS, browser, receiver model, what you tried, and any visible error. Please distinguish online demo tests from actual SDR reception.</p>`;
  const connections = document.getElementById('page-connections');
  connections.querySelector('.connection-path').before(setup);
}
