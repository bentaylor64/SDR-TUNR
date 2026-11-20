// Explicit, local snapshots of measurement results, not decoded station IDs.
export const JOURNAL_KEY = 'sdr-tunr.web.signal-journal.v1';
export const JOURNAL_LIMIT = 50;
const MODES = new Set(['FM', 'WFM', 'AM', 'USB', 'LSB', 'CW']);

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) : '';
}

export function normalizeObservation(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id, 100);
  const label = cleanText(value.label, 100);
  const date = typeof value.recordedAt === 'string' ? new Date(value.recordedAt) : null;
  if (!id || !label || !date || !Number.isFinite(date.valueOf()) || value.recordedAt !== date.toISOString() || !Array.isArray(value.hits)) return null;
  const hits = [];
  const seen = new Set();
  for (const hit of value.hits.slice(0, 12)) {
    if (!hit || !Number.isInteger(hit.frequency) || hit.frequency < 25000000 || hit.frequency > 1750000000 || !MODES.has(hit.mode) ||
        !Number.isFinite(hit.power) || hit.power < -160 || hit.power > 20) continue;
    const key = `${hit.frequency}:${hit.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({frequency: hit.frequency, mode: hit.mode, power: Math.round(hit.power * 10) / 10});
  }
  if (!hits.length) return null;
  const { gain, ppm, squelch } = value;
  return {
    id, recordedAt: value.recordedAt, label, hits,
    gain: Number.isInteger(gain) && gain >= -1 && gain <= 500 ? gain : null,
    ppm: Number.isInteger(ppm) && Math.abs(ppm) <= 200 ? ppm : null,
    squelch: Number.isInteger(squelch) && squelch >= -120 && squelch <= 0 ? squelch : null,
  };
}

export function eligibleObservation(scan, completion, bridgeDemo) {
  if (!scan || !completion || completion.cancelled || completion.failed || bridgeDemo !== false) return null;
  return normalizeObservation({...scan, hits: completion.results});
}

function readJournal(storage) {
  const decoded = JSON.parse(storage?.getItem(JOURNAL_KEY) ?? '[]');
  if (!Array.isArray(decoded)) return [];
  const result = [], seen = new Set();
  for (const value of decoded.slice(0, JOURNAL_LIMIT)) {
    const observation = normalizeObservation(value);
    if (observation && !seen.has(observation.id)) {
      result.push(observation);
      seen.add(observation.id);
    }
  }
  return result;
}

export function loadJournal(storage) {
  try { return readJournal(storage ?? globalThis.localStorage); }
  catch { return []; }
}

export function saveObservation(observation, storage) {
  const validated = normalizeObservation(observation);
  if (!validated) return 'invalid';
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return 'failed';
    const existing = readJournal(target);
    if (existing.some(row => row.id === validated.id)) return 'duplicate';
    target.setItem(JOURNAL_KEY, JSON.stringify([validated, ...existing].slice(0, JOURNAL_LIMIT)));
    return 'saved';
  } catch {
    return 'failed';
  }
}

// Quote every text cell, double the quotes inside, and prefix potential formulas.
// Numeric cells are created only from validated numbers, so negative dBFS remains numeric.
function csvText(value) {
  const prefix = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) ? "'" : '';
  return '"' + (prefix + value).replaceAll('"', '""') + '"';
}

export function journalCSV(observations) {
  const rows = ['recorded_at_utc,scan,frequency_hz,mode,peak_dbfs,gain_tenths_db,gain_auto,ppm,squelch_dbfs'];
  for (const value of observations.slice(0, JOURNAL_LIMIT)) {
    const entry = normalizeObservation(value);
    if (!entry) continue;
    for (const hit of entry.hits) {
      rows.push([
        csvText(entry.recordedAt), csvText(entry.label), hit.frequency, csvText(hit.mode),
        hit.power.toFixed(1), entry.gain === -1 ? '' : entry.gain ?? '', entry.gain === null ? '' : entry.gain === -1,
        entry.ppm ?? '', entry.squelch ?? '',
      ].join(','));
    }
  }
  return rows.join('\r\n') + '\r\n';
}
