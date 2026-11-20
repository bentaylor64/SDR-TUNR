import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAWYER_PRESETS, sawyerChannels, sawyerScanChannels, addSawyerFavorites } from '../dist/sawyer-bandpack.js';
import { ChannelScanner } from '../dist/scanner.js';

const expected = { A: 26, B: 22, C: 19, D: 7, E: 3, F: 11, G: 12, H: 7, I: 4, J: 1, K: 15, L: 8, M: 2 };

test('all 82 receive targets retain their exact preset membership and modes', () => {
  const byFrequency = new Map();
  for (const [preset, count] of Object.entries(expected)) {
    assert.equal(sawyerChannels(preset).length, count);
    for (const c of sawyerChannels(preset)) {
      assert.ok(Number.isInteger(c.frequency));
      assert.ok(['FM', 'AM'].includes(c.mode));
      byFrequency.set(c.frequency, c);
    }
  }
  assert.equal(byFrequency.size, 82);
  assert.equal(byFrequency.get(118550000).mode, 'AM');
  assert.equal(byFrequency.get(462562500).mode, 'FM');
  assert.deepEqual(sawyerChannels('toString'), []);
});

test('NOAA, continuous airport broadcasts, guard, and ISS remain tune-only', () => {
  const manual = ['H', 'I', 'J', 'M'].flatMap(sawyerChannels);
  assert.equal(manual.length, 14);
  assert.ok(manual.every(c => c.manualOnly));
  const never = new Set(manual.map(c => c.frequency));
  for (const [id, preset] of Object.entries(SAWYER_PRESETS)) {
    const scan = sawyerScanChannels(id);
    assert.equal(scan.length, preset.automatic ? expected[id] : 0);
    assert.ok(scan.every(c => !never.has(c.frequency)));
  }
  assert.deepEqual(sawyerScanChannels('toString'), []);
});

test('preset save preserves existing favorite name and deduplicates by frequency and mode', () => {
  const existing = { id: 'existing', name: 'My local signal', frequency: 462550000, mode: 'FM' };
  let serial = 0;
  const makeID = () => String(++serial);
  let result = addSawyerFavorites([existing], 'A', makeID);
  assert.equal(result.added, 25);
  assert.strictEqual(result.favorites[0], existing);
  assert.equal(addSawyerFavorites(result.favorites, 'A', makeID).added, 0);
  assert.equal(addSawyerFavorites(result.favorites, 'B', makeID).added, 14);
});

test('existing scanner takes exact pack targets and restores prior frequency', async () => {
  class TestTransport extends EventTarget {
    volume = 0.5;
    calls = [];
    setVolume(volume) { this.volume = volume; }
    async prepareAudio() {}
    async start(settings) { this.calls.push(settings); }
    async tune(settings) { this.calls.push(settings); }
  }
  const transport = new TestTransport();
  const scanner = new ChannelScanner(transport);
  scanner.measure = async () => -40;
  const options = { frequency: 162500000, mode: 'FM' };
  const targets = sawyerScanChannels('F');
  const hits = await scanner.start(targets, options);
  assert.deepEqual(transport.calls.slice(0, -1).map(c => [c.frequency, c.mode]), targets.map(c => [c.frequency, c.mode]));
  assert.deepEqual(transport.calls.at(-1), options);
  assert.equal(hits.length, 11);
  assert.equal(transport.volume, 0.5);
});
