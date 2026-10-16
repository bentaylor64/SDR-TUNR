let socket;
let audioPort;
let pendingAudio = 0;
let audioDropped = false;
let spectrumWorker;
let spectrumBusy = false;
let spectrumEnabled = false;
let generation = 0;
let spectrumGeneration = 0;
let connectionError = '';
let connectionCode = '';
function reset() {
  generation++;
  audioPort?.postMessage({ type: 'reset' });
}
self.onmessage = ({ data }) => {
  if (data.type === 'connect') {
    socket?.close();
    connectionError = ''; connectionCode = '';
    socket = new WebSocket(data.url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => postMessage({ type: 'connected' });
    socket.onclose = event => {
      reset();
      postMessage({ type: 'disconnected', code: connectionCode,
        message: connectionError || event.reason || 'Receiver bridge disconnected. Press Start to reconnect.' });
    };
    socket.onerror = () => {
      connectionError ||= 'Could not connect to the local receiver bridge. Check that it is running and no other browser tab owns the SDR.';
      postMessage({ type: 'error', message: connectionError });
    };
    socket.onmessage = ({ data: packet }) => {
      if (typeof packet === 'string') {
        try {
          const event = JSON.parse(packet);
          if (event.type === 'error') { connectionError = event.message; connectionCode = event.code || ''; }
          if (event.reset || event.running === false || event.type === 'error') reset();
          postMessage(event);
        } catch { postMessage({ type: 'error', message: 'The receiver sent an invalid status message.' }); }
        return;
      }
      if (packet.byteLength < 4) return;
      const type = new DataView(packet).getUint32(0, true);
      if (type === 1 && (packet.byteLength - 4) % 4 === 0) {
        // If the OS suspends the audio thread, bound MessagePort traffic too;
        // a bounded ring alone would not bound suspended port messages.
        if (!audioPort) return;
        if (pendingAudio >= 8) { audioDropped = true; return; }
        if (audioDropped) { audioPort.postMessage({ type: 'reset' }); audioDropped = false; }
        pendingAudio++;
        audioPort.postMessage({ type: 'pcm', buffer: packet, offset: 4 }, [packet]);
      } else if (type === 2 && packet.byteLength >= 12 && spectrumEnabled && !spectrumBusy) {
        if (!spectrumWorker) {
          spectrumWorker = new Worker(new URL('./spectrum-worker.js', import.meta.url), { type: 'module' });
          spectrumWorker.onmessage = ({ data: frame }) => {
            spectrumBusy = false;
            if (spectrumEnabled && spectrumGeneration === generation) postMessage(frame, [frame.bins.buffer]);
          };
          spectrumWorker.onerror = () => { spectrumBusy = false; spectrumWorker.terminate(); spectrumWorker = null; };
        }
        spectrumBusy = true; spectrumGeneration = generation;
        spectrumWorker.postMessage(packet, [packet]);
      }
    };
  } else if (data.type === 'audio-port') {
    audioPort?.close(); audioPort = data.port;
    pendingAudio = 0; audioDropped = false;
    audioPort.onmessage = ({ data: event }) => {
      if (event.type === 'accepted') pendingAudio = Math.max(0, pendingAudio - 1);
    };
  } else if (data.type === 'command') {
    const command = data.command;
    if (command.type === 'spectrum') spectrumEnabled = command.enabled;
    if (['start', 'stop', 'tune'].includes(command.type)) reset();
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  } else if (data.type === 'close') {
    reset(); socket?.close(1000, 'Page closed'); spectrumWorker?.terminate(); self.close();
  }
};
