// Receive-only US plans and exact-Hz controls ported from SDR-TUNR 1.14.0.
// Native sources: FineTuning.swift, BandSurveyModels.swift, ServiceChannelPlans.swift.
export const MIN_FREQUENCY = 25_000_000;
export const MAX_FREQUENCY = 1_750_000_000;
export const MODES = Object.freeze(['FM', 'WFM', 'AM', 'USB', 'LSB', 'CW']);
export const BANDS = Object.freeze([
  ['fm', 'FM broadcast', 88_000_000, 108_000_000, 99_500_000, 'WFM'],
  ['air', 'Air band', 118_000_000, 137_000_000, 125_000_000, 'AM'],
  ['2m', '2 m ham', 144_000_000, 148_000_000, 146_520_000, 'FM'],
  ['70cm', '70 cm ham', 420_000_000, 450_000_000, 446_000_000, 'FM'],
  ['weather', 'Weather', 162_400_000, 162_550_000, 162_500_000, 'FM'],
  ['gmrs', 'GMRS', 462_537_500, 467_725_000, 462_675_000, 'FM'],
  ['rail', 'Rail', 160_202_500, 161_577_500, 160_215_000, 'FM'],
  ['marine', 'Marine', 156_037_500, 161_612_500, 156_800_000, 'FM'],
  ['murs', 'MURS', 151_807_500, 154_612_500, 151_820_000, 'FM'],
  ['frs', 'FRS', 462_537_500, 467_725_000, 462_562_500, 'FM'],
  ['10m', '10 m ham', 28_000_000, 29_700_000, 28_400_000, 'USB'],
  ['6m', '6 m ham', 50_000_000, 54_000_000, 50_090_000, 'CW'],
].map(([id, title, lowerFrequency, upperFrequency, defaultFrequency, defaultMode]) =>
  Object.freeze({ id, title, lowerFrequency, upperFrequency, defaultFrequency, defaultMode })));

export function getBand(band) { return BANDS.find(value => value.id === (band?.id ?? band)) ?? null; }
export function isFrequency(value) {
  return Number.isSafeInteger(value) && value >= MIN_FREQUENCY && value <= MAX_FREQUENCY;
}

// Interpret digits as decimal integers, never parseFloat(MHz) * 1e6. Reject
// fractions below 1 Hz, exponent syntax, non-finite values and silent rounding.
export function parseFrequency(input) {
  if (typeof input !== 'string') return null;
  const match = input.trim().match(/^(\d+)(?:[.,](\d+))?\s*(MHz|kHz|Hz)?$/i);
  if (!match || match[1].length > 10) return null;
  const digits = { mhz: 6, khz: 3, hz: 0 }[(match[3] ?? 'MHz').toLowerCase()];
  const fraction = match[2] ?? '';
  if (/[^0]/.test(fraction.slice(digits))) return null;
  const frequency = Number(match[1]) * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, '0'));
  return isFrequency(frequency) ? frequency : null;
}

export function formatFrequency(hz) {
  if (!Number.isSafeInteger(hz) || hz < 0) return '—';
  const fraction = String(hz % 1_000_000).padStart(6, '0').replace(/0+$/, '').padEnd(3, '0');
  return `${Math.floor(hz / 1_000_000)}.${fraction}`;
}

export function stepLabel(step) {
  if (step === 'channel') return 'Channel';
  return step < 1000 ? `${step} Hz` : `${step / 1000} kHz`;
}

const sharedHandheldChannels = service => Array.from({ length: 22 }, (_, index) => {
  const number = index + 1;
  const frequency = number <= 7 ? 462_562_500 + index * 25_000
    : number <= 14 ? 467_562_500 + (number - 8) * 25_000 : 462_550_000 + (number - 15) * 25_000;
  return { frequency, label: `${service} ${number}`, detail: number >= 15
    ? 'Shared GMRS / FRS channel; also a GMRS repeater output' : 'Shared GMRS / FRS handheld channel' };
}).sort((a, b) => a.frequency - b.frequency);

const marineChannels = [
  [156050000, 'Marine 1001 / 01A', 'Port operations in selected US areas'],
  [156175000, 'Marine 1063 / 63A', 'Port operations in selected US areas'],
  [156250000, 'Marine 1005 / 05A', 'Port operations and vessel traffic'],
  [156275000, 'Marine 1065 / 65A', 'Port operations'],
  [156300000, 'Marine 06', 'Intership safety'],
  [156325000, 'Marine 1066 / 66A', 'Port operations'],
  [156350000, 'Marine 1007 / 07A', 'Commercial vessels'],
  [156375000, 'Marine 67', 'Commercial intership conversations'],
  [156400000, 'Marine 08', 'Commercial intership conversations'],
  [156425000, 'Marine 68', 'Recreational boating'],
  [156450000, 'Marine 09', 'Boater calling'],
  [156475000, 'Marine 69', 'Recreational boating'],
  [156500000, 'Marine 10', 'Commercial vessels'],
  [156550000, 'Marine 11', 'Commercial vessels and vessel traffic'],
  [156575000, 'Marine 71', 'Recreational boating'],
  [156600000, 'Marine 12', 'Port operations and vessel traffic'],
  [156625000, 'Marine 72', 'Recreational intership conversations'],
  [156650000, 'Marine 13', 'Bridge-to-bridge navigation safety'],
  [156675000, 'Marine 73', 'Port operations'],
  [156700000, 'Marine 14', 'Port operations and vessel traffic'],
  [156725000, 'Marine 74', 'Port operations'],
  [156800000, 'Marine 16', 'Distress, safety and calling'],
  [156850000, 'Marine 17', 'State and local maritime control'],
  [156875000, 'Marine 77', 'Intership port operations'],
  [156900000, 'Marine 1018 / 18A', 'Commercial vessels'],
  [156925000, 'Marine 1078 / 78A', 'Recreational boating'],
  [156950000, 'Marine 1019 / 19A', 'Commercial vessels'],
  [156975000, 'Marine 1079 / 79A', 'Commercial; recreational on the Great Lakes'],
  [157000000, 'Marine 1020 / 20A', 'Port operations; also the ship side of duplex 20'],
  [157025000, 'Marine 1080 / 80A', 'Commercial; recreational on the Great Lakes'],
  [157050000, 'Marine 1021 / 21A', 'Coast Guard operations'],
  [157075000, 'Marine 1081 / 81A', 'Government environmental operations'],
  [157100000, 'Marine 1022 / 22A', 'Coast Guard liaison and safety broadcasts'],
  [157125000, 'Marine 1082 / 82A', 'Government operations'],
  [157150000, 'Marine 1023 / 23A', 'Coast Guard operations'],
  [157175000, 'Marine 1083 / 83A', 'Coast Guard operations'],
  [157375000, 'Marine 87', 'Marine operator'],
  [157425000, 'Marine 88', 'Commercial intership conversations'],
  [161600000, 'Marine 20 shore', 'Port operations; shore side of duplex 20'],
].map(([frequency, label, detail]) => ({ frequency, label, detail }));

const rangeChannels = (id, start, end, step) => Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => {
  const frequency = start + index * step;
  return { frequency, label: `${getBand(id).title} · ${formatFrequency(frequency)} MHz`, detail: 'US listening channel' };
});

const plans = new Map(Object.entries({
  fm: rangeChannels('fm', 88_100_000, 107_900_000, 200_000),
  air: rangeChannels('air', 118_000_000, 136_975_000, 25_000),
  weather: rangeChannels('weather', 162_400_000, 162_550_000, 25_000),
  gmrs: sharedHandheldChannels('GMRS'), frs: sharedHandheldChannels('FRS'),
  murs: [151_820_000, 151_880_000, 151_940_000, 154_570_000, 154_600_000].map((frequency, index) =>
    ({ frequency, label: `MURS ${index + 1}`, detail: 'Local handheld and business conversations' })),
  rail: Array.from({ length: 91 }, (_, index) => ({ frequency: 160_215_000 + index * 15_000,
    label: `Rail AAR ${String(index + 7).padStart(3, '0')}`,
    detail: index + 7 === 73 ? 'Railroad police mutual aid' : 'Railroad voice; local activity varies' })),
  marine: marineChannels,
}).map(([id, channels]) => [id, Object.freeze(channels.map(Object.freeze))]));
const noChannels = Object.freeze([]);
const services = ['weather', 'gmrs', 'frs', 'rail', 'marine', 'murs'];
export function channelPlan(band) { return plans.get(band?.id ?? band) ?? noChannels; }

// These are tuning targets only. The receiver must supply settled, measured
// power before a scanner can report a detection. Broad ham plans preserve the
// native multi-band scanner; they are not exhaustive regional repeater lists.
const hamScanPlans = {
  '2m': rangeChannels('2m', 145_100_000, 147_990_000, 10_000),
  '70cm': rangeChannels('70cm', 440_000_000, 449_975_000, 25_000),
};
export function scanChannels(bandOrID) {
  const band = getBand(bandOrID);
  if (!band) return [];
  return (hamScanPlans[band.id] ?? channelPlan(band)).map(channel => ({ ...channel, mode: band.defaultMode, bandID: band.id }));
}

export function resolveProfile(frequency, mode, preferredBandID) {
  const preferredID = preferredBandID?.id ?? preferredBandID;
  let closest = null;
  let closestDistance = Infinity;
  for (const id of [...services].sort((a, b) => Number(b === preferredID) - Number(a === preferredID))) {
    const distance = Math.min(...channelPlan(id).map(channel => Math.abs(channel.frequency - frequency)));
    if (distance <= 12_500 && distance < closestDistance) { closest = getBand(id); closestDistance = distance; }
  }
  const band = closest ?? BANDS.find(value => !services.includes(value.id) && frequency >= value.lowerFrequency && frequency < value.upperFrequency);
  const channels = channelPlan(band);
  const narrow = ['USB', 'LSB', 'CW'].includes(mode);
  const coarse = {
    fm: [10000, 50000, 100000, 200000], air: [1000, 5000, 25000], weather: [1000, 5000, 25000],
    gmrs: [1000, 6250, 12500, 25000], frs: [1000, 6250, 12500, 25000], rail: [1000, 7500, 15000],
    marine: [1000, 12500, 25000], murs: [1000, 5000, 12500], '10m': [1000, 5000, 10000, 20000],
    '6m': [1000, 5000, 10000, 20000], '2m': [1000, 5000, 6250, 10000, 12500, 15000, 20000, 25000],
    '70cm': [1000, 5000, 6250, 10000, 12500, 15000, 20000, 25000],
  }[band?.id] ?? [1000, 5000, 6250, 12500, 25000, 100000];
  const normalSteps = narrow ? [10, 100, 500, 1000, 5000] : [...(channels.length ? ['channel'] : []), ...coarse];
  const normalDefault = narrow ? 100 : channels.length ? 'channel' : mode === 'WFM' ? 100000 : 5000;
  return { id: `${band?.id ?? 'other'}-${mode}`, title: band?.title ?? 'Free tuning', channels, normalSteps,
    fineSteps: mode === 'CW' ? [1, 10, 50, 100] : mode === 'WFM' ? [100, 500, 1000, 5000] : [10, 50, 100, 500, 1000],
    normalDefault: normalSteps.includes(normalDefault) ? normalDefault : 5000,
    fineDefault: narrow ? 10 : mode === 'WFM' ? 1000 : 100 };
}

export function adjacentFrequency(frequency, direction, step, profile) {
  if (!isFrequency(frequency) || !Number.isFinite(direction) || !direction) return null;
  if (step === 'channel') {
    const channels = profile?.channels ?? [];
    return (direction > 0 ? channels.find(channel => channel.frequency > frequency)
      : channels.findLast(channel => channel.frequency < frequency))?.frequency ?? null;
  }
  if (!Number.isSafeInteger(step) || step <= 0 || step > MAX_FREQUENCY) return null;
  const next = frequency + (direction > 0 ? step : -step);
  return isFrequency(next) ? next : null;
}

// Numeric drag ticks stay anchored to the starting frequency, including any Hz offset.
export function snappedFrequency(frequency, step, anchor, range, profile) {
  if (!Number.isFinite(frequency) || !isFrequency(anchor) || !Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite)) return null;
  const lower = Math.max(MIN_FREQUENCY, range[0]);
  const upper = Math.min(MAX_FREQUENCY, range[1]);
  if (lower > upper) return null;
  if (step === 'channel') {
    let result = null;
    for (const channel of profile?.channels ?? []) {
      if (channel.frequency < lower || channel.frequency > upper) continue;
      if (result === null || Math.abs(channel.frequency - frequency) < Math.abs(result - frequency)) result = channel.frequency;
    }
    return result;
  }
  if (!Number.isSafeInteger(step) || step <= 0 || step > MAX_FREQUENCY) return null;
  const first = Math.ceil((lower - anchor) / step);
  const last = Math.floor((upper - anchor) / step);
  if (first > last) return null;
  const raw = (frequency - anchor) / step;
  const rounded = Math.sign(raw) * Math.floor(Math.abs(raw) + 0.5);
  return anchor + Math.min(last, Math.max(first, rounded)) * step;
}

export function selectBand(bandOrID, currentFrequency) {
  const band = getBand(bandOrID);
  if (!band) return null;
  const isService = ['gmrs', 'frs', 'rail', 'marine', 'murs'].includes(band.id);
  const keep = isFrequency(currentFrequency) && (isService
    ? channelPlan(band).some(channel => channel.frequency === currentFrequency)
    : currentFrequency >= band.lowerFrequency && currentFrequency <= band.upperFrequency);
  return { frequency: keep ? currentFrequency : band.defaultFrequency, mode: band.defaultMode };
}

export class FineTuningSelection {
  fine = false;
  #choices = new Map();
  options(profile) { return this.fine ? profile.fineSteps : profile.normalSteps; }
  step(profile) {
    const choice = this.#choices.get(`${profile.id}-${this.fine}`);
    return this.options(profile).includes(choice) ? choice : this.fine ? profile.fineDefault : profile.normalDefault;
  }
  select(step, profile) {
    if (this.options(profile).includes(step)) this.#choices.set(`${profile.id}-${this.fine}`, step);
  }
}

export const FAVORITES_KEY = 'sdr-tunr.web.favorites.v1';
export function validateFavorite(value) {
  if (!value || typeof value !== 'object' || !isFrequency(value.frequency) || !MODES.includes(value.mode)) return null;
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 128) return null;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 120) : '';
  const bandName = typeof value.bandName === 'string' ? value.bandName.trim().slice(0, 80) : '';
  return { id: value.id, name: name || `${formatFrequency(value.frequency)} MHz`, frequency: value.frequency, mode: value.mode, bandName };
}
export function normalizeFavorites(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values.slice(0, 1000)) {
    const favorite = validateFavorite(value);
    if (!favorite || seen.has(favorite.id)) continue;
    result.push(favorite); seen.add(favorite.id);
  }
  return result;
}
export function loadFavorites(storage) {
  try { return normalizeFavorites(JSON.parse((storage ?? globalThis.localStorage)?.getItem(FAVORITES_KEY) ?? '[]')); }
  catch { return []; }
}
export function saveFavorites(favorites, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(FAVORITES_KEY, JSON.stringify(normalizeFavorites(favorites)));
    return true;
  } catch { return false; }
}
