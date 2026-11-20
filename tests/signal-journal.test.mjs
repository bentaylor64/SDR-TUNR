import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelScanner } from '../dist/scanner.js';
import { JOURNAL_KEY, JOURNAL_LIMIT, eligibleObservation, loadJournal, saveObservation, journalCSV } from '../dist/signal-journal.js';
const metadata = {id:'run-1',label:'Sawyer · Rail',recordedAt:'2026-11-20T03:00:00.000Z',gain:300,ppm:2,squelch:-60};
const hit = {frequency:160230000,mode:'FM',power:-47.34,name:'not a station ID'};
const observation = {...metadata,hits:[hit]};
function mockStorage() {
  const entries = new Map();
  return {getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value)};
}

test('only completed positively real scans with valid measured hits qualify', () => {
  for (const demo of [true, undefined, null, 'false', 0]) assert.equal(eligibleObservation(metadata, {results:[hit]}, demo), null);
  for (const completion of [{cancelled:true,results:[hit]}, {failed:true,results:[hit]}, {results:[]}, {results:[{...hit,power:NaN}]}]) {
    assert.equal(eligibleObservation(metadata, completion, false), null);
  }
  const saved = eligibleObservation(metadata, {results:[hit,hit]}, false);
  assert.deepEqual(saved.hits,[{frequency:160230000,mode:'FM',power:-47.3}]);
  assert.equal(saved.label,metadata.label);
});

test('explicit durable storage survives reload, deduplicates a run and caps retention', () => {
  const storage = mockStorage();
  assert.deepEqual(loadJournal(storage), []);
  assert.equal(saveObservation(observation, storage),'saved');
  assert.equal(saveObservation(observation, storage),'duplicate');
  assert.equal(loadJournal(storage).length,1);
  for (let i=2; i<=JOURNAL_LIMIT+2; i++) assert.equal(saveObservation({...observation,id:`run-${i}`},storage),'saved');
  const rows=loadJournal(storage);
  assert.equal(rows.length,JOURNAL_LIMIT);
  assert.equal(rows[0].id,'run-52');
  assert.equal(rows.at(-1).id,'run-3');
});

test('malformed and unavailable storage do not produce a false save', () => {
  const storage=mockStorage();
  storage.setItem(JOURNAL_KEY,'{invalid');
  assert.deepEqual(loadJournal(storage),[]);
  assert.equal(saveObservation(observation, storage),'failed');
  assert.equal(storage.getItem(JOURNAL_KEY),'{invalid');
  storage.setItem(JOURNAL_KEY,JSON.stringify([null,{},observation,observation]));
  assert.equal(loadJournal(storage).length,1);
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(saveObservation(observation, blocked),'failed');
  assert.equal(saveObservation({...observation,hits:[]}, storage),'invalid');
});

test('CSV preserves exact Hz and numeric dBFS; escapes quotes and potential formulas', () => {
  const csv=journalCSV([{...observation,gain:-1,label:'\u200B=HYPERLINK("https://example.invalid")'}]);
  assert.match(csv,/^recorded_at_utc,scan,frequency_hz,mode,peak_dbfs,/);
  assert.ok(csv.includes("\"'\u200B=HYPERLINK(\"\"https://example.invalid\"\")\""));
  assert.ok(csv.includes(',160230000,"FM",-47.3,,true,2,-60\r\n'));
  assert.equal(csv.split('\r\n').length,3);
});

test('scanner reports a failed partial run so its valid earlier hit cannot be journaled', async () => {
  class TestTransport extends EventTarget {
    volume=0.5;
    setVolume(value){this.volume=value;}
    async prepareAudio(){}
    async start(){}
    async tune(){}
  }
  const scanner=new ChannelScanner(new TestTransport());
  let calls=0;
  scanner.measure=async()=>{if (++calls===2) throw new Error('receiver disconnected'); return -47.3;};
  let completed;
  scanner.addEventListener('complete',event=>{completed=event.detail;});
  await scanner.start([{frequency:160230000,mode:'FM'},{frequency:160635000,mode:'FM'}],{frequency:162500000,mode:'FM'});
  assert.equal(completed.results.length,1);
  assert.equal(completed.failed,true);
  assert.equal(eligibleObservation(metadata,completed,false),null);
});
