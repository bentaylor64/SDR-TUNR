// A single 4096-point Hann-window FFT per admitted frame, outside audio work.
export function spectrum(iq) {
  let n = 1;
  while (n * 2 <= Math.min(4096, Math.floor(iq.length / 2))) n *= 2;
  if (n < 4) return new Float32Array();
  const re = new Float64Array(n), im = new Float64Array(n);
  let windowSum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    windowSum += w;
    re[i] = (iq[i * 2] - 127.5) / 128 * w;
    im[i] = (iq[i * 2 + 1] - 127.5) / 128 * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let ur = 1, ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j, b = a + length / 2;
        const br = re[b] * ur - im[b] * ui, bi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - br; im[b] = im[a] - bi;
        re[a] += br; im[a] += bi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  const bins = new Float32Array(n);
  const norm = windowSum * windowSum;
  for (let i = 0; i < n; i++) {
    const k = (i + n / 2) % n;
    bins[i] = 10 * Math.log10(Math.max(1e-12, (re[k] * re[k] + im[k] * im[k]) / norm));
  }
  return bins;
}
if (typeof self !== 'undefined') self.onmessage = ({ data }) => {
  const header = new DataView(data);
  const bins = spectrum(new Uint8Array(data, 12));
  postMessage({ type: 'spectrum', center: header.getUint32(4, true), sampleRate: header.getUint32(8, true), bins }, [bins.buffer]);
};
