import { ReceiverTransport } from './transport.js';
import { ChannelScanner } from './scanner.js';
import {
  BANDS, MODES, MIN_FREQUENCY, MAX_FREQUENCY, getBand, isFrequency,
  parseFrequency, formatFrequency, stepLabel, channelPlan, scanChannels, resolveProfile,
  adjacentFrequency, snappedFrequency, selectBand, FineTuningSelection, loadFavorites, saveFavorites,
} from './radio-model.js';
import { RadioDirectory, DIRECTORY_CATEGORIES, DIRECTORY_NOTE, validLocation } from './directory.js';

const $ = id => document.getElementById(id);
const hostedPreview = document.documentElement.dataset.runtime === 'hosted';
const hosted = hostedPreview ? await import('./hosted-preview.js') : null;
const UI_KEY = 'sdr-tunr.web.settings.v1';
function readStored(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
const saved = readStored(UI_KEY) || {};
const inRange = (value, min, max, fallback) => Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const state = {
  frequency: isFrequency(saved.frequency) ? saved.frequency : 162550000,
  mode: MODES.includes(saved.mode) ? saved.mode : 'FM',
  bandID: getBand(saved.bandID)?.id || 'weather',
  gain: Math.round(inRange(saved.gain, -1, 500, 300)), ppm: Math.round(inRange(saved.ppm, -200, 200, 0)),
  squelch: Math.round(inRange(saved.squelch, -120, 0, -60)), device: Math.round(inRange(saved.device, 0, 255, 0)),
  volume: inRange(saved.volume, 0, 1, 0.65), muted: saved.muted === true,
  model: ['unknown', 'mini', 'smart', 'smart5', 'other'].includes(saved.model) ? saved.model : 'unknown',
  spectrumWidth: [1200000, 300000, 75000].includes(saved.spectrumWidth) ? saved.spectrumWidth : 1200000,
  location: validLocation(saved.location) ? saved.location : null,
  running: false, busy: false, connected: false, demo: false, hardware: false,
  page: 'explore', favorites: loadFavorites(),
};
const transport = hostedPreview ? new hosted.HostedDemoTransport() : new ReceiverTransport();
const scanner = new ChannelScanner(transport);
const directory = new RadioDirectory();
const precision = new FineTuningSelection();
let detecting = false, currentScan = false, scanResults = [], favoriteTarget = null;
let directoryCategory = 'recommended', stations = [], stationLimit = 60, directoryRevision = 0;
let tuningTimer = 0, searchTimer = 0, tuningRevision = 0, lastError = '';
const modeLabel = mode => mode === 'FM' ? 'NFM' : mode === 'WFM' ? 'Wide FM' : mode;
const settings = () => ({ frequency: state.frequency, mode: state.mode, gain: state.gain, ppm: state.ppm, squelch: state.squelch, device: state.device });
function persist() {
  store(UI_KEY, { ...settings(), bandID: state.bandID, volume: state.volume, muted: state.muted, model: state.model, location: state.location, spectrumWidth: state.spectrumWidth });
}
function notice(message, error = false) {
  $('notice-text').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = false;
}
function report(error) { notice(error?.message || String(error), true); }
function setDot(id, active, error = false) {
  $(id).classList.toggle('green', active);
  $(id).classList.toggle('error', error);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}
function emptyState(title, description, symbol = 'radio') {
  const wrapper = element('div', 'empty-state');
  wrapper.append(icon(symbol), element('h2', '', title), element('p', '', description));
  return wrapper;
}
function activeProfile() { return resolveProfile(state.frequency, state.mode, state.bandID); }
function currentFavorite() { return state.favorites.find(f => f.frequency === state.frequency && f.mode === state.mode); }
function chooseContainingBand() {
  const selected = getBand(state.bandID);
  if (selected && state.frequency >= selected.lowerFrequency && state.frequency <= selected.upperFrequency) return;
  const containing = BANDS.find(b => state.frequency >= b.lowerFrequency && state.frequency <= b.upperFrequency);
  if (containing) state.bandID = containing.id;
}

const descriptions = {
  weather: ['Weather, around the clock.', 'Try the seven NOAA channels to find your strongest local weather broadcast. These are national channel assignments; local reception varies.'],
  fm: ['Music, talk, and everything between.', 'Explore local FM broadcasts. Wide FM is selected for broadcast audio.'],
  air: ['Listen to the world above.', 'Civil aviation voice uses AM. The directory can help you find nearby airport frequencies.'],
  '2m': ['Your local amateur airwaves.', 'Explore 2 meter simplex and repeater activity. Local repeater listings are available in Nearby stations.'],
  '70cm': ['Small wavelength. Local conversations.', 'Explore 70 centimeter amateur activity. Signal strength depends on antenna, terrain, and transmitter activity.'],
  gmrs: ['Conversations closer to home.', 'US shared handheld channels and GMRS repeater outputs. This receiver listens only.'],
  frs: ['A neighborhood of signals.', 'US FRS channel assignments. Handheld radio activity varies by location and time.'],
  rail: ['Along the tracks.', 'US railroad voice channels. Channel labels are assignments, not confirmed local stations.'],
  marine: ['Out on the water.', 'US VHF marine voice channels. Reception is most likely near harbors and waterways.'],
  murs: ['Local handheld conversations.', 'Five US MURS channels for local two-way voice. Activity is intermittent.'],
  '10m': ['A little farther across the airwaves.', 'The 10 meter amateur band includes single-sideband voice. Use fine tuning to bring a voice into focus.'],
  '6m': ['Explore the six meter band.', 'Start with a suitable VHF antenna. CW audio is available; automatic Morse text decoding is a native-app feature.'],
};

function renderFrequency() {
  const hz = state.frequency, formatted = formatFrequency(hz);
  $('receiver-frequency').textContent = formatted;
  $('frequency-display').setAttribute('aria-label', `Enter exact frequency; currently ${hz} hertz`);
  $('freq-mhz').textContent = Math.floor(hz / 1000000);
  $('freq-khz').textContent = String(Math.floor(hz / 1000) % 1000).padStart(3, '0');
  $('freq-hz').textContent = String(hz % 1000).padStart(3, '0');
  $('precision-frequency').setAttribute('aria-label', `Tuned frequency: ${hz} hertz`);
  $('mode-select').value = state.mode;
  $('footer-frequency').textContent = `${formatted} MHz · ${modeLabel(state.mode)}`;
  $('exact-frequency').placeholder = `${formatted} MHz`;
  const band = getBand(state.bandID);
  const inside = band && hz >= band.lowerFrequency && hz <= band.upperFrequency;
  $('current-band').textContent = inside ? band.title : 'Free tuning';
  $('band-select').value = state.bandID;
  const lower = inside ? band.lowerFrequency : Math.max(MIN_FREQUENCY, hz - 1000000);
  const upper = inside ? band.upperFrequency : Math.min(MAX_FREQUENCY, hz + 1000000);
  $('band-range').textContent = `${formatFrequency(band.lowerFrequency)} — ${formatFrequency(band.upperFrequency)} MHz`;
  $('frequency-slider').min = lower; $('frequency-slider').max = upper;
  $('frequency-slider').step = 1; $('frequency-slider').value = hz;
  $('frequency-slider').setAttribute('aria-valuetext', `${formatted} MHz`);
  $('slider-min').textContent = `${formatFrequency(lower)}`;
  $('slider-max').textContent = `${formatFrequency(upper)} MHz`;
  const favorite = currentFavorite();
  $('save-button').classList.toggle('saved', !!favorite);
  $('save-button').querySelector('span').textContent = favorite ? 'Saved' : 'Save';
  $('save-button').setAttribute('aria-label', favorite ? 'Edit the saved favorite for this frequency' : 'Save current frequency as a favorite');
  renderPrecision(); renderBandContext();
}
function renderPrecision() {
  const profile = activeProfile(), step = precision.step(profile);
  $('fine-toggle').checked = precision.fine;
  $('step-description').textContent = step === 'channel' ? 'US channel steps' : `${stepLabel(step)} steps`;
  $('step-options').replaceChildren(...precision.options(profile).map(option => {
    const button = element('button', option === step ? 'selected' : '', stepLabel(option));
    button.type = 'button'; button.setAttribute('aria-pressed', String(option === step));
    button.setAttribute('aria-label', `${stepLabel(option)} tuning step`);
    button.addEventListener('click', () => { precision.select(option, profile); renderPrecision(); });
    return button;
  }));
  for (const [id, direction] of [['tune-down', -1], ['tune-up', 1]]) {
    $(id).disabled = adjacentFrequency(state.frequency, direction, step, profile) === null;
    $(id).setAttribute('aria-label', step === 'channel' ? `${direction < 0 ? 'Previous' : 'Next'} US channel` : `Tune ${direction < 0 ? 'down' : 'up'} ${stepLabel(step)}`);
  }
}
function renderBandContext() {
  const band = getBand(state.bandID);
  const [title, detail] = descriptions[band.id];
  $('band-context-title').textContent = title; $('band-context-detail').textContent = detail;
  let channels = channelPlan(band);
  // Keep this quick access area compact. All listed channels remain accessible through precision steps and scan.
  if (channels.length > 8) {
    let nearest = channels.reduce((best, c, i) => Math.abs(c.frequency - state.frequency) < Math.abs(channels[best].frequency - state.frequency) ? i : best, 0);
    const start = Math.max(0, Math.min(channels.length - 7, nearest - 3));
    channels = channels.slice(start, start + 7);
  }
  $('channel-shortcuts').replaceChildren(...channels.map(channel => {
    const button = element('button', `channel-button${channel.frequency === state.frequency ? ' selected' : ''}`, formatFrequency(channel.frequency));
    button.title = `${channel.label} · ${channel.detail}`;
    button.setAttribute('aria-label', `Tune ${channel.label}, ${formatFrequency(channel.frequency)} MHz`);
    button.addEventListener('click', () => tuneTo(channel.frequency, band.defaultMode));
    return button;
  }));
  const targets = scanChannels(band);
  $('scan-button').disabled = hostedPreview || !targets.length || state.busy;
  $('scan-hint').textContent = hostedPreview ? 'Channel scanning is available with your local receiver.' : currentScan ? $('scan-hint').textContent : targets.length ? `One pass · ${targets.length} channels · measured candidates` : 'Use manual tuning on this band.';
}
function renderReceiver() {
  $('start-label').textContent = state.running || state.busy || currentScan ? 'Stop' : hostedPreview ? 'Start demo' : 'Start';
  $('start-icon').textContent = state.running || state.busy || currentScan ? '■' : '▶';
  $('start-button').classList.toggle('primary', !state.running && !state.busy && !currentScan);
  $('start-button').setAttribute('aria-label', state.running || state.busy || currentScan ? hostedPreview ? 'Stop demo' : 'Stop receiver' : hostedPreview ? 'Start demo' : 'Start receiver');
  $('receiver-state').textContent = currentScan ? 'Scanning listed channels' : state.busy ? hostedPreview ? 'Starting demo…' : 'Starting receiver…' : state.running ? state.demo ? 'Playing demo' : 'Listening live' : hostedPreview ? 'Demo stopped' : 'Receiver stopped';
  $('live-label').textContent = currentScan ? 'CHANNEL SCAN' : state.running ? state.demo ? 'DEMO SIGNAL' : 'LIVE RECEPTION' : 'RECEIVER IDLE';
  for (const id of ['receiver-dot', 'live-dot']) setDot(id, state.running);
  $('demo-badge').hidden = !state.demo;
  $('footer-status').textContent = state.demo ? `DEMO · synthetic signal${state.running ? '' : ' · stopped'}` : state.running ? 'Receiving locally · audio stays on this PC' : state.connected ? 'Local bridge connected · receiver stopped' : 'Local bridge unavailable · open Connections';
  setDot('footer-dot', state.connected); setDot('connection-dot', state.connected);
  $('bridge-status').textContent = hostedPreview ? 'Use the downloaded helper for hardware' : state.connected ? state.demo ? 'Connected · demo mode' : 'Connected on localhost' : 'Unavailable · start the bridge';
  $('hardware-badge').textContent = state.demo ? 'DEMO' : state.hardware ? 'DETECTED' : 'NOT DETECTED';
  $('hardware-badge').classList.toggle('connected', state.hardware || state.demo);
  $('squelch').value = state.squelch;
  $('squelch-output').textContent = state.squelch <= -120 ? 'Off' : String(state.squelch).replace('-', '−');
  $('squelch').setAttribute('aria-valuetext', state.squelch <= -120 ? 'Off' : `${state.squelch} dBFS`);
  $('volume').value = Math.round(state.volume * 100);
  $('volume-output').textContent = state.muted ? 'Mute' : `${Math.round(state.volume * 100)}%`;
  $('mute-button').setAttribute('aria-label', state.muted ? 'Unmute audio' : 'Mute audio');
  $('mute-button').setAttribute('aria-pressed', String(state.muted));
  $('mute-button').style.color = state.muted ? 'var(--accent)' : '';
}
function applyVolume() { transport.setVolume(currentScan || state.muted ? 0 : state.volume); renderReceiver(); persist(); }

async function cancelScan(restore = false) { if (currentScan) await scanner.cancel(restore); }
async function tuneTo(frequency, mode = state.mode, { defer = false } = {}) {
  if (!isFrequency(frequency) || !MODES.includes(mode)) return;
  const revision = ++tuningRevision;
  clearTimeout(tuningTimer);
  await cancelScan(false);
  if (revision !== tuningRevision) return;
  state.frequency = frequency; state.mode = mode; chooseContainingBand();
  renderFrequency(); persist();
  if (!state.running && !state.busy) return;
  const apply = () => { if (revision === tuningRevision) transport.tune(settings()).catch(report); };
  if (defer) tuningTimer = setTimeout(apply, 65); else apply();
}
async function toggleReceiver() {
  clearTimeout(tuningTimer); tuningRevision++;
  if (state.running || state.busy || currentScan) {
    await cancelScan(false); await transport.stop(); state.busy = false; state.running = false;
    clearPlots(); renderReceiver(); return;
  }
  state.busy = true; lastError = ''; renderReceiver();
  try {
    // start() resumes browser audio before it awaits the bridge connection.
    const started = await transport.start(settings());
    if (!started) return;
    state.busy = false;
    state.connected = transport.connected; state.demo = !!transport.session?.demo;
    updateSpectrumSubscription(); renderReceiver();
  } catch (error) { state.busy = false; renderReceiver(); report(error); }
}
async function connectBridge() {
  try {
    const session = await transport.probe();
    state.connected = true; state.demo = !!session.demo;
    if (session.receiverBusy && !transport.connected) notice('The receiver is in use in another browser tab. Stop it there, then press Start here.');
    if (state.demo) {
      $('device-name').textContent = 'Synthetic demo receiver';
      $('device-detail').textContent = 'Generated signal · no hardware reception';
      $('connection-hardware-status').textContent = 'Demo · no real receiver in use';
    }
    updateSpectrumSubscription(); renderReceiver(); return session;
  } catch (error) { state.connected = false; renderReceiver(); throw error; }
}
async function detectReceiver() {
  if (hostedPreview) { showPage('connections'); $('tester-setup').scrollIntoView({ block: 'start' }); return; }
  if (detecting) return;
  detecting = true;
  for (const id of ['detect-button', 'connection-detect']) { $(id).disabled = true; $(id).textContent = 'Looking for your SDR…'; }
  try {
    await connectBridge();
    const result = await transport.devices();
    const devices = Array.isArray(result.devices) ? result.devices : [];
    state.hardware = devices.length > 0 && !state.demo;
    $('device-setting').replaceChildren(...(devices.length ? devices : [{ index: 0, name: 'Default receiver' }]).map(device => {
      const option = element('option', '', device.name || `RTL-SDR ${device.index}`); option.value = device.index; return option;
    }));
    if (devices.length && !devices.some(d => d.index === state.device)) state.device = devices[0].index;
    $('device-setting').value = state.device;
    if (!state.demo && state.hardware) {
      const device = devices.find(d => d.index === state.device) || devices[0];
      $('device-name').textContent = device.name || 'RTL-SDR receiver';
      $('device-detail').textContent = `${devices.length} receiver${devices.length === 1 ? '' : 's'} detected · native USB driver`;
      $('connection-hardware-status').textContent = device.name || 'RTL-SDR detected';
      notice('Your receiver is ready. Select Start to listen.');
    } else if (!state.demo) {
      $('device-name').textContent = 'No receiver detected';
      $('device-detail').textContent = result.driverAvailable ? 'Check USB cable, driver, and other radio apps.' : 'The native RTL-SDR driver is unavailable.';
      $('connection-hardware-status').textContent = result.driverAvailable ? 'Not found · check USB access' : 'Native driver unavailable';
      notice(result.error || (result.driverAvailable ? 'No RTL-SDR was found. Connect it, check the USB driver, and close other apps that may be using the receiver.' : 'The RTL-SDR library is not available. Open Connections for local driver setup.'), true);
    } else notice('Demo mode is active. Audio and spectrum are synthetic; a real SDR is not being used.');
    persist();
  } catch (error) { report(error); }
  finally {
    detecting = false;
    for (const id of ['detect-button', 'connection-detect']) { $(id).disabled = false; $(id).textContent = 'Detect receiver'; }
    renderReceiver();
  }
}

function showPage(page, replaceHash = false) {
  if (!['explore', 'nearby', 'favorites', 'equipment', 'connections'].includes(page)) page = 'explore';
  state.page = page;
  for (const section of document.querySelectorAll('.page')) section.hidden = section.id !== `page-${page}`;
  for (const button of document.querySelectorAll('[data-page]')) {
    const selected = button.dataset.page === page; button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    button.title = button.querySelector('span')?.textContent || page;
    button.setAttribute('aria-label', button.title);
  }
  if (replaceHash) history.replaceState(null, '', `#${page}`); else if (location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
  updateSpectrumSubscription();
  if (page === 'nearby') updateDirectory();
  if (page === 'favorites') renderFavorites();
  if (page === 'explore') resizePlots();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function updateSpectrumSubscription() {
  const visible = !document.hidden && state.page === 'explore';
  transport.setSpectrum(visible);
  if (!visible) { latestSpectrum = null; clearTimeout(paintTimer); paintTimer = 0; }
}

function openFavorite() {
  favoriteTarget = { frequency: state.frequency, mode: state.mode, bandName: getBand(state.bandID)?.title || '' };
  const existing = currentFavorite();
  $('favorite-frequency').textContent = `${formatFrequency(state.frequency)} MHz · ${modeLabel(state.mode)}`;
  $('favorite-name').value = existing?.name || '';
  $('favorite-dialog').showModal(); $('favorite-name').focus();
}
function renderFavorites() {
  $('favorite-count').textContent = state.favorites.length;
  if (!state.favorites.length) {
    $('favorites-list').replaceChildren(emptyState('Your next good find belongs here.', 'Tune to a frequency, then select Save. Its exact frequency and listening mode will be ready for next time.', 'star'));
  } else $('favorites-list').replaceChildren(...state.favorites.map(favorite => {
    const row = element('article', 'station-row');
    const main = element('div', 'station-main');
    main.append(element('h2', 'station-name', favorite.name), element('p', 'station-detail', favorite.bandName || 'Saved frequency'));
    const frequency = element('div', 'station-frequency', `${formatFrequency(favorite.frequency)} MHz`);
    frequency.append(element('small', '', modeLabel(favorite.mode)));
    const tune = element('button', 'button', 'Tune in');
    tune.addEventListener('click', () => { tuneTo(favorite.frequency, favorite.mode); showPage('explore'); });
    const remove = element('button', 'remove-favorite', '×');
    remove.setAttribute('aria-label', `Remove ${favorite.name} from favorites`);
    remove.addEventListener('click', () => {
      state.favorites = state.favorites.filter(f => f.id !== favorite.id);
      if (!saveFavorites(state.favorites)) notice('The favorite was removed for this session, but this browser could not save the change.', true);
      renderFavorites(); renderFrequency();
    });
    row.append(main, frequency, tune, remove); return row;
  }));
}
function renderStations() {
  $('station-list').replaceChildren(...stations.slice(0, stationLimit).map(station => {
    const row = element('article', 'station-row'), main = element('div', 'station-main');
    main.append(element('h2', 'station-name', station.name), element('p', 'station-detail', station.detail));
    const source = element('div', 'station-source');
    const distance = station.isNationwide ? 'National channel plan' : Number.isFinite(station.distanceMiles) ? `${station.distanceMiles.toFixed(1)} mi from ZIP center` : 'Published listing';
    source.append(document.createTextNode(`${distance} · `));
    const link = element('a', '', station.sourceName || 'Source');
    try { const url = new URL(station.sourceURL); if (['http:', 'https:'].includes(url.protocol)) { link.href = url.href; link.target = '_blank'; link.rel = 'noreferrer'; source.append(link); } } catch { /* No link if a malformed catalog row is supplied. */ }
    if (station.updatedAt) source.append(document.createTextNode(` · ${station.updatedAt}`));
    main.append(source);
    const frequency = element('div', 'station-frequency', `${formatFrequency(station.frequency)} MHz`);
    frequency.append(element('small', '', modeLabel(station.mode)));
    const tune = element('button', 'button', 'Tune in');
    tune.addEventListener('click', () => { tuneTo(station.frequency, station.mode); showPage('explore'); });
    row.append(main, frequency, tune); return row;
  }));
  if (!stations.length) $('station-list').append(emptyState(state.location ? 'No matching stations in this view.' : 'Find the signals around you.', state.location ? 'Try a wider radius, another category, or a shorter search.' : 'Set your five-digit U.S. ZIP code to browse local airport and repeater listings. National channel plans are available without a location.', 'compass'));
  const nationalCount = stations.filter(s => s.isNationwide).length;
  const localCount = stations.length - nationalCount;
  $('directory-summary').textContent = `${stations.length} listening candidate${stations.length === 1 ? '' : 's'}${localCount && nationalCount ? ` · ${localCount} nearby, ${nationalCount} national` : ''}`;
  $('load-more-stations').hidden = stationLimit >= stations.length;
}
async function updateDirectory() {
  const revision = ++directoryRevision;
  $('directory-summary').textContent = 'Finding listening candidates…';
  $('directory-provenance').textContent = DIRECTORY_NOTE;
  try {
    const result = await directory.find({ location: state.location, category: directoryCategory, radiusMiles: Number($('search-radius').value), search: $('station-search').value });
    if (revision !== directoryRevision) return;
    stations = result; stationLimit = 60; renderStations();
    const catalogs = directory.catalogs || [];
    if (catalogs.length) $('directory-provenance').textContent = `${DIRECTORY_NOTE} Directory listings are snapshots and may have changed.`;
  } catch (error) {
    if (revision !== directoryRevision || error.name === 'AbortError') return;
    $('directory-summary').textContent = 'Directory unavailable';
    $('station-list').replaceChildren(emptyState('The directory could not load.', error.message, 'compass'));
    $('load-more-stations').hidden = true;
  }
}
function renderLocation() {
  $('zip-code').value = state.location?.zip || '';
  $('location-label').textContent = state.location ? `${state.location.city}, ${state.location.state} · ${state.location.zip}` : 'Set a location to find nearby transmitters.';
}
function renderEquipment() {
  $('receiver-model').value = state.model;
  $('equipment-model-detail').textContent = {
    unknown: 'Choose your model to see its connector and receive range.',
    mini: 'MCX female connector · approximately 25–1750 MHz advertised receive range.',
    smart: 'SMA female connector · approximately 25–1750 MHz advertised receive range.',
    smart5: 'SMA female connector · hardware advertises 100 kHz–1750 MHz. This browser receiver uses 25–1750 MHz quadrature mode; direct sampling is not available.',
    other: 'Frequency coverage and connectors vary by model. This application requires an RTL-SDR compatible receiver.',
  }[state.model];
}

// A canvas keeps a bounded 300-row image, not an ever-growing array of frames.
// Actual FFT bins only; the idle grid is not a generated radio trace.
const spectrum = $('spectrum'), waterfall = $('waterfall');
const spectrumContext = spectrum.getContext('2d', { alpha: false });
const waterfallContext = waterfall.getContext('2d', { alpha: false });
const historyCanvas = document.createElement('canvas'); historyCanvas.width = 1024; historyCanvas.height = 300;
const historyContext = historyCanvas.getContext('2d', { alpha: false });
let latestSpectrum = null, displayedSpectrum = null, viewport = null, paintTimer = 0, lastPaint = 0, historyRows = 0;
function frameViewport(frame, forceCenter = false) {
  const span = Math.min(state.spectrumWidth, frame.sampleRate);
  const captureLow = frame.center - frame.sampleRate / 2;
  const captureHigh = frame.center + frame.sampleRate / 2;
  const oldLow = viewport ? viewport.center - viewport.span / 2 : Infinity;
  const oldHigh = viewport ? viewport.center + viewport.span / 2 : -Infinity;
  if (!forceCenter && viewport?.span === span && oldLow >= captureLow && oldHigh <= captureHigh && state.frequency >= oldLow && state.frequency <= oldHigh) return viewport;
  // Keep the requested window inside the samples actually captured by the SDR.
  const center = Math.max(captureLow + span / 2, Math.min(captureHigh - span / 2, state.frequency));
  return { center, span };
}
function visibleBinBounds(frame) {
  const window = viewport || { center: frame.center, span: frame.sampleRate };
  const captureLow = frame.center - frame.sampleRate / 2;
  const first = Math.max(0, Math.floor((window.center - window.span / 2 - captureLow) / frame.sampleRate * frame.bins.length));
  const last = Math.min(frame.bins.length, Math.ceil((window.center + window.span / 2 - captureLow) / frame.sampleRate * frame.bins.length));
  return { first, last, window };
}
function clearHistory() {
  historyRows = 0; historyContext.fillStyle = '#101b28'; historyContext.fillRect(0, 0, 1024, 300);
}
function sizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
  if (!rect.width || !rect.height) return;
  const width = Math.min(1600, Math.round(rect.width * ratio)), height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}
function resizePlots() {
  if (state.page !== 'explore') return;
  sizeCanvas(spectrum); sizeCanvas(waterfall);
  drawSpectrum(displayedSpectrum);
  drawWaterfall();
}
function drawSpectrum(frame) {
  const ctx = spectrumContext, w = spectrum.width, h = spectrum.height;
  ctx.fillStyle = '#141e28'; ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1; ctx.strokeStyle = '#243444'; ctx.beginPath();
  for (let i = 1; i < 8; i++) { const x = Math.round(w * i / 8) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let i = 1; i < 5; i++) { const y = Math.round(h * i / 5) + .5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  const scale = Math.max(1, w / Math.max(1, spectrum.clientWidth));
  ctx.fillStyle = '#637b94'; ctx.font = `${9 * scale}px ui-monospace, monospace`;
  for (let i = 1; i < 5; i++) ctx.fillText(String(-i * 24), 5 * scale, h * i / 5 - 5 * scale);
  if (!frame?.bins?.length) return;
  const bins = frame.bins, { first, last, window } = visibleBinBounds(frame);
  const visibleCount = Math.max(1, last - first), count = Math.min(visibleCount, Math.max(1, Math.ceil(w)));
  const toY = value => h * (1 - Math.max(0, Math.min(1, (value + 120) / 120)));
  const path = new Path2D();
  for (let x = 0; x < count; x++) {
    const from = first + Math.floor(x * visibleCount / count), to = Math.min(last, Math.max(from + 1, first + Math.floor((x + 1) * visibleCount / count)));
    let peak = -120;
    for (let i = from; i < to; i++) if (Number.isFinite(bins[i])) peak = Math.max(peak, bins[i]);
    const px = x * w / Math.max(1, count - 1), py = toY(peak);
    if (x === 0) path.moveTo(px, py); else path.lineTo(px, py);
  }
  const fill = new Path2D(path); fill.lineTo(w, h); fill.lineTo(0, h); fill.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#57c9ea44'); gradient.addColorStop(1, '#57c9ea04');
  ctx.fillStyle = gradient; ctx.fill(fill); ctx.strokeStyle = '#57c9ea'; ctx.lineWidth = 1.2 * scale; ctx.stroke(path);
  const tunedX = ((state.frequency - window.center) / window.span + .5) * w;
  if (tunedX >= 0 && tunedX <= w) { ctx.strokeStyle = '#f5a96e'; ctx.lineWidth = scale; ctx.setLineDash([4 * scale, 4 * scale]); ctx.beginPath(); ctx.moveTo(tunedX, 0); ctx.lineTo(tunedX, h); ctx.stroke(); ctx.setLineDash([]); }
}
const colors = [[-120, [13, 24, 39]], [-85, [26, 49, 76]], [-65, [32, 104, 135]], [-45, [55, 178, 184]], [-25, [129, 216, 157]], [-10, [245, 169, 110]], [0, [255, 233, 175]]];
const colorTable = Array.from({ length: 121 }, (_, index) => {
  const db = index - 120; let j = 1; while (j < colors.length - 1 && db > colors[j][0]) j++;
  const [low, a] = colors[j - 1], [high, b] = colors[j], t = (db - low) / (high - low);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
});
function appendWaterfall(frame) {
  historyContext.drawImage(historyCanvas, 0, 0, 1024, 299, 0, 1, 1024, 299);
  const row = historyContext.createImageData(1024, 1);
  const { first, last } = visibleBinBounds(frame), count = Math.max(1, last - first);
  for (let x = 0; x < 1024; x++) {
    const value = frame.bins[Math.min(last - 1, first + Math.floor(x * count / 1024))];
    const rgb = colorTable[Math.max(0, Math.min(120, Math.round((Number.isFinite(value) ? value : -120) + 120)))];
    row.data[x * 4] = rgb[0]; row.data[x * 4 + 1] = rgb[1]; row.data[x * 4 + 2] = rgb[2]; row.data[x * 4 + 3] = 255;
  }
  historyContext.putImageData(row, 0, 0); historyRows = Math.min(300, historyRows + 1); drawWaterfall();
}
function drawWaterfall() {
  waterfallContext.fillStyle = '#101b28'; waterfallContext.fillRect(0, 0, waterfall.width, waterfall.height);
  if (historyRows) waterfallContext.drawImage(historyCanvas, 0, 0, 1024, 300, 0, 0, waterfall.width, waterfall.height);
}
function clearPlots() {
  latestSpectrum = null; displayedSpectrum = null; viewport = null; clearTimeout(paintTimer); paintTimer = 0; clearHistory();
  $('spectrum-empty').hidden = false; $('waterfall-empty').hidden = false;
  $('spectrum-empty').querySelector('strong').textContent = 'The airwaves are waiting.';
  $('spectrum-empty').querySelector('span').textContent = hostedPreview ? 'Select Start demo to explore a generated signal.' : 'Start your receiver to see live signals.';
  $('power-value').textContent = '— dBFS'; $('spectrum-span').textContent = 'Awaiting receiver data';
  for (const tick of $('frequency-axis').children) tick.textContent = '—';
  drawSpectrum(null); drawWaterfall();
}
function paintPending() {
  paintTimer = 0;
  if (!latestSpectrum || document.hidden || state.page !== 'explore' || !state.running) return;
  const frame = latestSpectrum; latestSpectrum = null;
  const nextView = frameViewport(frame);
  if (viewport && (viewport.center !== nextView.center || viewport.span !== nextView.span)) clearHistory();
  viewport = nextView;
  displayedSpectrum = frame; lastPaint = performance.now();
  $('spectrum-empty').hidden = true; $('waterfall-empty').hidden = true;
  drawSpectrum(frame); appendWaterfall(frame);
  renderSpectrumAxis();
}
function renderSpectrumAxis() {
  if (!viewport) return;
  [...$('frequency-axis').children].forEach((tick, i) => { tick.textContent = `${((viewport.center - viewport.span / 2 + viewport.span * i / 4) / 1000000).toFixed(viewport.span < 100000 ? 4 : 3)}`; });
  const label = viewport.span >= 1000000 ? `${(viewport.span / 1000000).toFixed(1)} MHz` : `${Math.round(viewport.span / 1000)} kHz`;
  $('spectrum-span').textContent = `${label} view · ${state.demo ? 'synthetic demo' : 'measured IQ'} · up to 10 fps`;
}
function queueSpectrum(frame) {
  if (document.hidden || state.page !== 'explore' || !state.running || !frame.bins?.length || !Number.isFinite(frame.center) || !(frame.sampleRate > 0)) return;
  latestSpectrum = frame;
  if (!paintTimer) paintTimer = setTimeout(paintPending, Math.max(0, 100 - (performance.now() - lastPaint)));
}

// One pass over published channels. Candidate strength never claims station identity.
const scanTools = element('div', 'scan-tools');
const scanButton = element('button', 'button', 'Scan channels'); scanButton.id = 'scan-button';
const scanHint = element('span', 'help-text'); scanHint.id = 'scan-hint';
scanTools.append(scanButton, scanHint); document.querySelector('.band-context').append(scanTools);
const scanPanel = element('article', 'panel info-card scan-results'); scanPanel.hidden = true;
scanPanel.append(element('h2', '', 'Measured channel candidates'));
const scanList = element('div'); scanPanel.append(scanList);
scanPanel.append(element('p', 'help-text', 'Energy above your squelch threshold does not identify a station or guarantee intelligible audio. Select a frequency to listen.'));
document.querySelector('.spectrum-column').append(scanPanel);
function renderScanResults() {
  scanPanel.hidden = false;
  scanList.replaceChildren(...scanResults.map(result => {
    const row = element('div', 'scan-result');
    const button = element('button', '', `${formatFrequency(result.frequency)} MHz · ${modeLabel(result.mode)}`);
    button.addEventListener('click', () => tuneTo(result.frequency, result.mode));
    row.append(button, element('span', 'mono subtle', `${result.power.toFixed(1)} dBFS`)); return row;
  }));
  if (!scanResults.length) scanList.append(element('p', 'help-text', currentScan ? 'Checking settled signal levels…' : 'No candidates crossed the selected threshold. Try a different band, antenna position, or squelch threshold.'));
}
scanButton.addEventListener('click', async () => {
  if (currentScan) { await scanner.cancel(); return; }
  clearTimeout(tuningTimer); tuningRevision++; scanResults = []; currentScan = true; renderScanResults();
  scanButton.textContent = 'Stop scan'; renderReceiver();
  try { await scanner.start(scanChannels(state.bandID), settings()); }
  catch (error) { report(error); currentScan = false; scanButton.textContent = 'Scan channels'; renderReceiver(); }
});
scanner.addEventListener('status', ({ detail }) => {
  currentScan = detail.running; scanButton.textContent = currentScan ? 'Stop scan' : 'Scan channels';
  $('scan-hint').textContent = detail.message; renderReceiver();
});
scanner.addEventListener('result', ({ detail }) => {
  scanResults.push(detail); scanResults.sort((a, b) => b.power - a.power); scanResults.length = Math.min(12, scanResults.length); renderScanResults();
});
scanner.addEventListener('complete', ({ detail }) => { scanResults = detail.results || scanResults; renderScanResults(); renderFrequency(); applyVolume(); });
scanner.addEventListener('error', ({ detail }) => report(detail.message));

transport.addEventListener('status', ({ detail }) => {
  const wasRunning = state.running;
  if (typeof detail.running === 'boolean') {
    state.running = detail.running;
    // The socket's initial stopped status is not a failed Start acknowledgement.
    if (detail.running || detail.reset || detail.error || detail.released || detail.connected === false) state.busy = false;
  }
  if (detail.released || detail.receiverBusy) state.connected = true;
  else if (detail.connected === false) state.connected = false;
  else if (transport.connected) state.connected = true;
  if (typeof detail.demo === 'boolean') state.demo = detail.demo;
  if (detail.running && !state.demo && !state.hardware) {
    state.hardware = true;
    $('device-name').textContent = 'RTL-SDR receiver';
    $('device-detail').textContent = 'Receiving through the local USB driver';
    $('connection-hardware-status').textContent = 'Connected and receiving';
  }
  if (Number.isFinite(detail.power) && state.running) $('power-value').textContent = `${detail.power.toFixed(1)} dBFS`;
  if (!state.running && wasRunning) clearPlots();
  if (detail.reset) {
    // Discard an in-flight frame but keep a stationary view and its history.
    // A captured window or viewport change is handled by the next actual frame.
    latestSpectrum = null;
  }
  if (detail.error && detail.error !== lastError) { lastError = detail.error; report(detail.error); }
  renderReceiver();
});
transport.addEventListener('error', ({ detail }) => { state.busy = false; report(detail.message); renderReceiver(); });
transport.addEventListener('spectrum', ({ detail }) => queueSpectrum(detail));
transport.addEventListener('audio-metrics', ({ detail }) => {
  $('metric-queue').textContent = Number.isFinite(detail.queuedMs) ? `${detail.queuedMs.toFixed(0)} ms` : '—';
  $('metric-underruns').textContent = detail.underruns ?? '—'; $('metric-dropped').textContent = detail.droppedFrames ?? '—';
});

for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click', () => showPage(button.dataset.page));
for (const button of document.querySelectorAll('[data-open-page]')) button.addEventListener('click', () => showPage(button.dataset.openPage));
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => $(button.dataset.closeDialog).close());
window.addEventListener('popstate', () => showPage(location.hash.slice(1), true));
window.addEventListener('hashchange', () => showPage(location.hash.slice(1), true));
$('dismiss-notice').addEventListener('click', () => { $('notice').hidden = true; });
$('start-button').addEventListener('click', () => toggleReceiver().catch(report));
$('detect-button').addEventListener('click', detectReceiver); $('connection-detect').addEventListener('click', detectReceiver);
$('mode-select').addEventListener('change', event => tuneTo(state.frequency, event.target.value));
$('band-select').replaceChildren(...BANDS.map(band => { const option = element('option', '', band.title); option.value = band.id; return option; }));
$('band-select').addEventListener('change', event => { state.bandID = event.target.value; const selection = selectBand(state.bandID, state.frequency); tuneTo(selection.frequency, selection.mode); });
$('fine-toggle').addEventListener('change', event => { precision.fine = event.target.checked; renderPrecision(); });
for (const [id, direction] of [['tune-down', -1], ['tune-up', 1]]) $(id).addEventListener('click', () => {
  const profile = activeProfile(), next = adjacentFrequency(state.frequency, direction, precision.step(profile), profile);
  if (next !== null) tuneTo(next);
});
let sliderAnchor = state.frequency;
$('frequency-slider').addEventListener('pointerdown', () => { sliderAnchor = state.frequency; });
$('frequency-slider').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
    const profile = activeProfile(), next = adjacentFrequency(state.frequency, direction, precision.step(profile), profile);
    if (next !== null) tuneTo(next, state.mode, { defer: true });
  }
});
$('frequency-slider').addEventListener('input', event => {
  const profile = activeProfile(), range = [Number(event.target.min), Number(event.target.max)];
  const next = snappedFrequency(Number(event.target.value), precision.step(profile), sliderAnchor, range, profile);
  if (next !== null) tuneTo(next, state.mode, { defer: true });
});
$('exact-form').addEventListener('submit', event => {
  event.preventDefault(); const frequency = parseFrequency($('exact-frequency').value);
  if (frequency === null) { $('exact-frequency').setCustomValidity('Enter an exact frequency from 25 to 1750 MHz (up to six decimal places), or use Hz / kHz.'); $('exact-frequency').reportValidity(); return; }
  $('exact-frequency').setCustomValidity(''); tuneTo(frequency); $('exact-frequency').value = '';
});
$('exact-frequency').addEventListener('input', () => $('exact-frequency').setCustomValidity(''));
$('frequency-display').addEventListener('click', () => { showPage('explore'); $('exact-frequency').value = formatFrequency(state.frequency); $('exact-frequency').focus(); $('exact-frequency').select(); $('exact-form').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
for (const canvas of [spectrum, waterfall]) canvas.addEventListener('click', event => {
  if (!displayedSpectrum || !viewport || !state.running) return;
  const rect = canvas.getBoundingClientRect(), frame = displayedSpectrum;
  const raw = viewport.center + ((event.clientX - rect.left) / rect.width - .5) * viewport.span;
  const profile = activeProfile();
  const next = snappedFrequency(raw, precision.step(profile), state.frequency, [MIN_FREQUENCY, MAX_FREQUENCY], profile);
  if (next !== null) tuneTo(next);
});
$('spectrum-width').value = state.spectrumWidth;
$('spectrum-width').addEventListener('change', event => {
  state.spectrumWidth = Number(event.target.value); persist();
  if (displayedSpectrum) {
    viewport = frameViewport(displayedSpectrum, true); clearHistory();
    drawSpectrum(displayedSpectrum); drawWaterfall(); renderSpectrumAxis();
  }
});
$('squelch').addEventListener('input', event => { state.squelch = Number(event.target.value); transport.setSquelch(state.squelch); renderReceiver(); persist(); });
$('volume').addEventListener('input', event => { state.volume = Number(event.target.value) / 100; state.muted = false; applyVolume(); });
$('mute-button').addEventListener('click', () => { state.muted = !state.muted; applyVolume(); });
$('save-button').addEventListener('click', openFavorite); $('add-favorite').addEventListener('click', openFavorite);
$('favorite-form').addEventListener('submit', event => {
  event.preventDefault(); const name = $('favorite-name').value.trim();
  if (!name) { $('favorite-name').setCustomValidity('Give this frequency a name.'); $('favorite-name').reportValidity(); return; }
  if (!favoriteTarget) return;
  const existing = state.favorites.find(f => f.frequency === favoriteTarget.frequency && f.mode === favoriteTarget.mode);
  const favorite = { ...favoriteTarget, id: existing?.id || crypto.randomUUID(), name };
  state.favorites = existing ? state.favorites.map(f => f.id === existing.id ? favorite : f) : [...state.favorites, favorite];
  if (!saveFavorites(state.favorites)) notice('Saved for this session. Your browser has blocked permanent storage.', true);
  $('favorite-dialog').close(); favoriteTarget = null; renderFavorites(); renderFrequency();
});
$('favorite-name').addEventListener('input', () => $('favorite-name').setCustomValidity(''));
$('open-settings').addEventListener('click', () => {
  const gainDB = state.gain < 0 ? -1 : state.gain / 10;
  if (![...$('gain-setting').options].some(o => Number(o.value) === gainDB)) { const option = element('option', '', `${gainDB} dB`); option.value = gainDB; $('gain-setting').append(option); }
  $('gain-setting').value = gainDB; $('ppm-setting').value = state.ppm; $('device-setting').value = state.device; $('settings-dialog').showModal();
});
$('compact-settings').addEventListener('click', () => $('open-settings').click());
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); await cancelScan(false);
  const gain = Number($('gain-setting').value); state.gain = gain < 0 ? -1 : Math.round(gain * 10);
  state.ppm = Number($('ppm-setting').value); state.device = Number($('device-setting').value); persist();
  $('settings-dialog').close(); if (state.running) transport.tune(settings()).catch(report);
});
$('directory-categories').replaceChildren(...DIRECTORY_CATEGORIES.map(category => {
  const button = element('button', category.id === directoryCategory ? 'selected' : '', category.title); button.dataset.category = category.id;
  button.setAttribute('aria-pressed', String(category.id === directoryCategory));
  button.addEventListener('click', () => {
    directoryCategory = category.id;
    for (const other of $('directory-categories').children) { const selected = other === button; other.classList.toggle('selected', selected); other.setAttribute('aria-pressed', String(selected)); }
    updateDirectory();
  }); return button;
}));
$('location-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  $('location-label').textContent = 'Looking up your ZIP code…';
  try { const location = await directory.lookupZIP($('zip-code').value); state.location = location; persist(); renderLocation(); await updateDirectory(); }
  catch (error) { if (error.name !== 'AbortError') $('location-label').textContent = error.message; }
  finally { button.disabled = false; }
});
$('zip-code').addEventListener('input', () => { directory.cancelLookup(); $('location-label').textContent = 'Set location to apply this ZIP code.'; });
$('station-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(updateDirectory, 180); });
$('search-radius').addEventListener('change', updateDirectory);
$('load-more-stations').addEventListener('click', () => { stationLimit += 60; renderStations(); });
$('receiver-model').addEventListener('change', event => { state.model = event.target.value; persist(); renderEquipment(); });

const hasWebUSB = !!navigator.usb && isSecureContext;
$('identify-usb').disabled = !hasWebUSB;
if (!hasWebUSB) $('webusb-detail').textContent = 'This browser does not expose WebUSB here. Chrome or Edge on localhost can offer an optional USB permission picker. Radio reception still uses the local bridge.';
$('browser-status').textContent = globalThis.AudioWorkletNode ? 'AudioWorklet supported' : 'AudioWorklet unavailable';
$('identify-usb').addEventListener('click', async () => {
  try {
    // Identification only. Do not open or claim the interface owned by librtlsdr.
    const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x0bda, productId: 0x2838 }, { vendorId: 0x0bda, productId: 0x2832 }, { vendorId: 0x1d19, productId: 0x1101 }, { vendorId: 0x1d19, productId: 0x1102 }] });
    $('usb-result').textContent = `Identified ${device.productName || 'USB receiver'} (${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}). Select Detect receiver to check access through the local bridge.`;
  } catch (error) { $('usb-result').textContent = error.name === 'NotFoundError' ? 'No device selected. You can still detect your SDR through the local bridge.' : error.message; }
});
document.addEventListener('visibilitychange', updateSpectrumSubscription);
window.addEventListener('pagehide', () => { scanner.cancel(false); transport.close(); });
window.addEventListener('pageshow', event => { if (event.persisted) { state.running = false; state.busy = false; clearPlots(); connectBridge().catch(report); } });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); if (!$('favorite-dialog').open) openFavorite(); }
});
new ResizeObserver(() => { if (!document.hidden) resizePlots(); }).observe(document.querySelector('.spectrum-stage'));
if (hostedPreview) hosted.setupHostedPreview();
renderFavorites(); renderFrequency(); renderReceiver(); renderLocation(); renderEquipment(); applyVolume(); clearPlots();
showPage(location.hash.slice(1) || 'explore', true);
connectBridge().catch(() => { /* Persistent connection state and setup page show how to start the bridge. */ });
