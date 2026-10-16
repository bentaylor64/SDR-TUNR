// Published listening candidates, never evidence of reception or station identity.
import { channelPlan, formatFrequency, isFrequency } from './radio-model.js';

export const DIRECTORY_CATEGORIES = Object.freeze([
  ['recommended', 'Recommended'], ['weather', 'Weather'], ['airports', 'Airports'], ['ham', 'Ham radio'],
  ['gmrs', 'GMRS'], ['frs', 'FRS'], ['murs', 'MURS'], ['rail', 'Rail'], ['marine', 'Marine'],
].map(([id, title]) => Object.freeze({ id, title })));
export const DIRECTORY_NOTE = 'Published channels are listening candidates, not verified reception. Distances are from the ZIP center; terrain, antenna and activity affect reception.';

const sources = {
  weather: ['NOAA / National Weather Service', 'https://www.weather.gov/nwr/nwr_receivers'],
  gmrs: ['FCC channel plan', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-95/subpart-E/section-95.1763'],
  frs: ['FCC channel plan', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-95/subpart-B/section-95.563'],
  murs: ['FCC channel plan', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-95/subpart-J/section-95.2763'],
  rail: ['AAR / CISA NIFOG 2.01', 'https://aar.com/standards/fc_index.php/1000'],
  marine: ['US Coast Guard', 'https://www.navcen.uscg.gov/us-vhf-channel-information'],
  ham: ['ARRL band plan', 'https://www.arrl.org/band-plan'],
};
const national = new Map();
for (const category of Object.keys(sources)) {
  const [sourceName, sourceURL] = sources[category];
  const channels = category === 'ham'
    ? [{ frequency: 146520000, label: '2 meter calling', detail: 'National FM simplex calling channel · activity varies' },
      { frequency: 446000000, label: '70 cm calling', detail: 'National FM simplex calling channel · activity varies' }]
    : channelPlan(category);
  national.set(category, Object.freeze(channels.map(channel => Object.freeze({
    id: `national-${category}-${channel.frequency}`, name: category === 'weather' ? `NOAA Weather · ${formatFrequency(channel.frequency)}` : channel.label,
    frequency: channel.frequency, mode: 'FM', category,
    detail: category === 'weather' ? 'Weather broadcasts · try all seven for local reception' : channel.detail,
    sourceName, sourceURL, updatedAt: ['rail', 'marine', 'murs', 'frs'].includes(category) ? '2026-09-13' : '2026-09-12',
    isNationwide: true, distanceMiles: null,
  }))));
}
export function nationalStations(category = 'recommended') { return national.get(category === 'recommended' ? 'weather' : category) ?? []; }

export function validCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
export function validLocation(value) {
  return Boolean(value && typeof value.zip === 'string' && /^\d{5}$/.test(value.zip)
    && typeof value.city === 'string' && value.city.trim() && typeof value.state === 'string' && value.state.trim()
    && validCoordinate(value.latitude, value.longitude));
}
export function distanceMiles(a, b) {
  if (!validCoordinate(a?.latitude, a?.longitude) || !validCoordinate(b?.latitude, b?.longitude)) return Infinity;
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}
function safeSourceURL(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
export function validateStation(station) {
  if (!station || typeof station.id !== 'string' || !station.id || typeof station.name !== 'string' || !station.name.trim()
    || !isFrequency(station.frequency) || !['AM', 'FM'].includes(station.mode) || !['airports', 'ham', 'gmrs'].includes(station.category)
    || !validCoordinate(station.latitude, station.longitude) || typeof station.sourceName !== 'string' || !station.sourceName
    || !safeSourceURL(station.sourceURL)) return null;
  const clean = value => typeof value === 'string' ? value.trim() : '';
  return { ...station, name: station.name.trim(), detail: clean(station.detail), airportID: clean(station.airportID).toUpperCase(),
    iataCode: clean(station.iataCode).toUpperCase(), service: clean(station.service).toLowerCase(), locationName: clean(station.locationName),
    isNationwide: false };
}
const folded = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matchesStation(station, search = '') {
  const words = folded(search).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const searchable = folded([station.name, station.detail, station.locationName, station.airportID, station.iataCode, station.service,
    formatFrequency(station.frequency), String(station.frequency), DIRECTORY_CATEGORIES.find(value => value.id === station.category)?.title].join(' '));
  return words.every(word => searchable.includes(word));
}

// Conservative spherical bounding box: includes every tile that could contain a
// station inside the radius, including near the date line or a pole.
export function tileMayIntersect(tile, location, radiusMiles) {
  const angular = radiusMiles / 3958.7613;
  const deltaLatitude = angular * 180 / Math.PI;
  if (tile.north < location.latitude - deltaLatitude || tile.south > location.latitude + deltaLatitude) return false;
  if (Math.abs(location.latitude) + deltaLatitude >= 90) return true;
  const deltaLongitude = Math.asin(Math.min(1, Math.sin(angular) / Math.cos(location.latitude * Math.PI / 180))) * 180 / Math.PI;
  const west = location.longitude - deltaLongitude;
  const east = location.longitude + deltaLongitude;
  return [-360, 0, 360].some(offset => tile.east + offset >= west && tile.west + offset <= east);
}

function aborted() { return new DOMException('This lookup was superseded or cancelled.', 'AbortError'); }
function assertCurrent(signal) { if (signal?.aborted) throw signal.reason ?? aborted(); }
function linkSignal(external, controller) {
  if (!external) return () => {};
  const listener = () => controller.abort(external.reason ?? aborted());
  if (external.aborted) listener(); else external.addEventListener('abort', listener, { once: true });
  return () => external.removeEventListener('abort', listener);
}
function recommendedStations(nearby) {
  const airports = new Map();
  for (const station of nearby.filter(value => value.category === 'airports')) {
    const key = station.airportID || station.iataCode;
    if (!key) continue;
    if (!airports.has(key)) airports.set(key, []);
    airports.get(key).push(station);
  }
  const groups = [...airports.values()];
  const preferred = groups.find(group => group.some(station => station.service === 'tower'))
    ?? groups.find(group => group.some(station => station.iataCode)) ?? groups[0] ?? [];
  const priorities = ['tower', 'approach', 'departure', 'traffic', 'clearance', 'ground', 'weather'];
  const rank = value => { const index = priorities.indexOf(value.service); return index < 0 ? 7 : index; };
  const air = [...preferred].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 2);
  const repeaters = nearby.filter(value => ['ham', 'gmrs'].includes(value.category) && value.mode === 'FM').slice(0, 2);
  const weather = nationalStations('weather');
  return [weather[0], ...air, ...repeaters, ...weather.slice(1)];
}

export class RadioDirectory {
  #fetch;
  #baseURL;
  #manifest = null;
  #tileCache = new Map();
  #lookupController = null;
  #lookupRevision = 0;
  #findController = null;
  #findRevision = 0;
  catalogs = [];
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), baseURL = new URL('./data/', import.meta.url) } = {}) {
    this.#fetch = fetchImpl;
    this.#baseURL = baseURL;
  }
  cancelLookup() { this.#lookupRevision++; this.#lookupController?.abort(aborted()); this.#lookupController = null; }
  cancelFind() { this.#findRevision++; this.#findController?.abort(aborted()); this.#findController = null; }
  async lookupZIP(input, { signal } = {}) {
    this.cancelLookup();
    const revision = this.#lookupRevision;
    const zip = String(input ?? '').trim();
    if (!/^\d{5}$/.test(zip)) throw new Error('Enter a five-digit U.S. ZIP code.');
    const controller = new AbortController();
    this.#lookupController = controller;
    const unlink = linkSignal(signal, controller);
    const timeout = setTimeout(() => controller.abort(new Error('ZIP lookup timed out. Please try again.')), 15000);
    try {
      assertCurrent(controller.signal);
      const response = await this.#fetch(`https://api.zippopotam.us/us/${zip}`, { signal: controller.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (response.status === 404) throw new Error('That ZIP code was not found. Check the five digits and try again.');
      if (!response.ok) throw new Error('The ZIP service is unavailable right now. Please try again later.');
      const data = await response.json();
      assertCurrent(controller.signal);
      if (revision !== this.#lookupRevision) throw aborted();
      if (data?.['country abbreviation']?.toUpperCase() === 'US' && data?.['post code'] === zip && Array.isArray(data.places)) {
        for (const place of data.places) {
          // Reject blank coordinate strings (Number('') would otherwise be zero).
          if (typeof place.latitude !== 'string' || !place.latitude.trim() || typeof place.longitude !== 'string' || !place.longitude.trim()) continue;
          const location = { zip, city: typeof place['place name'] === 'string' ? place['place name'].trim() : '',
            state: place['state abbreviation'], latitude: Number(place.latitude), longitude: Number(place.longitude) };
          if (validLocation(location)) return { ...location, label: `${location.city}, ${location.state} · ${zip}` };
        }
      }
      throw new Error('The ZIP service returned an incomplete location. Please try again.');
    } catch (error) {
      assertCurrent(controller.signal);
      if (revision !== this.#lookupRevision) throw aborted();
      if (error instanceof TypeError) throw new Error('Could not look up this ZIP. Check your internet connection and try again.');
      throw error;
    } finally {
      clearTimeout(timeout); unlink();
      if (this.#lookupController === controller) this.#lookupController = null;
    }
  }
  async #loadManifest(signal) {
    if (this.#manifest) return this.#manifest;
    const response = await this.#fetch(new URL('catalogs.json', this.#baseURL), { signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error('The bundled channel directory could not be loaded. National plans remain available.');
    const manifest = await response.json();
    assertCurrent(signal);
    if (manifest?.version !== 1 || !Array.isArray(manifest.catalogs) || !Array.isArray(manifest.tiles)) throw new Error('The channel directory manifest is invalid.');
    this.#manifest = manifest;
    this.catalogs = manifest.catalogs;
    return manifest;
  }
  async #loadTile(tile, signal) {
    if (this.#tileCache.has(tile.path)) {
      const records = this.#tileCache.get(tile.path);
      this.#tileCache.delete(tile.path); this.#tileCache.set(tile.path, records);
      return records;
    }
    if (!/^(airports|repeaters)\/-?\d+_-?\d+\.json$/.test(tile.path)) throw new Error('The channel directory has an invalid tile path.');
    const response = await this.#fetch(new URL(tile.path, this.#baseURL), { signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Some nearby directory entries could not be loaded. Please retry.');
    const raw = await response.json();
    assertCurrent(signal);
    if (!Array.isArray(raw)) throw new Error('Some nearby directory entries are invalid.');
    const records = raw.map(validateStation).filter(Boolean);
    this.#tileCache.set(tile.path, records);
    while (this.#tileCache.size > 64) this.#tileCache.delete(this.#tileCache.keys().next().value);
    return records;
  }
  async find({ location = null, category = 'recommended', radiusMiles = 35, search = '', frequencyRange = null, signal } = {}) {
    this.cancelFind();
    const revision = this.#findRevision;
    const controller = new AbortController();
    this.#findController = controller;
    const unlink = linkSignal(signal, controller);
    try {
      assertCurrent(controller.signal);
      const radius = Number.isFinite(radiusMiles) ? Math.min(500, Math.max(1, radiusMiles)) : 35;
      const required = category === 'airports' ? ['airports'] : ['ham', 'gmrs'].includes(category) ? ['repeaters']
        : category === 'recommended' ? ['airports', 'repeaters'] : [];
      const nearby = [];
      if (validLocation(location) && required.length) {
        const manifest = await this.#loadManifest(controller.signal);
        const tiles = manifest.tiles.filter(tile => required.includes(tile.catalog) && tileMayIntersect(tile, location, radius));
        // Keep network and JSON work bounded even when a large radius crosses many tiles.
        for (let start = 0; start < tiles.length; start += 4) {
          const blocks = await Promise.all(tiles.slice(start, start + 4).map(tile => this.#loadTile(tile, controller.signal)));
          for (const block of blocks) for (const station of block) {
            const distance = distanceMiles(location, station);
            if (distance <= radius) nearby.push({ ...station, distanceMiles: distance });
          }
          assertCurrent(controller.signal);
        }
      }
      if (revision !== this.#findRevision) throw aborted();
      nearby.sort((a, b) => a.distanceMiles - b.distanceMiles || a.name.localeCompare(b.name) || a.frequency - b.frequency || a.id.localeCompare(b.id));
      const candidates = category === 'recommended' ? recommendedStations(nearby)
        : [...nearby.filter(value => value.category === category), ...nationalStations(category)];
      const seen = new Set();
      return candidates.filter(station => {
        if (seen.has(station.id) || !matchesStation(station, search)) return false;
        if (frequencyRange && (station.frequency < frequencyRange[0] || station.frequency > frequencyRange[1])) return false;
        seen.add(station.id); return true;
      });
    } finally {
      unlink();
      if (this.#findController === controller) this.#findController = null;
    }
  }
}
