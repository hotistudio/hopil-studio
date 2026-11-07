const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('function getStorageUsage()');
const end = source.indexOf('// ═════════', start);
const records = new Map();
const card = { dataset: {}, innerHTML: '', querySelector: () => null };
let tick;
let storageEvent;
const storage = {
  get length() { return records.size; },
  key(index) { return [...records.keys()][index] ?? null; },
  getItem(key) { return records.get(key) ?? null; }
};
const context = vm.createContext({
  localStorage: storage,
  document: { hidden: false, getElementById: () => card },
  window: { addEventListener(event, callback) { assert.equal(event, 'storage'); storageEvent = callback; } },
  setInterval(callback, delay) { tick = callback; assert.equal(delay, 1000); }
});
vm.runInContext(source.slice(start, end), context);
tick();
assert.match(card.innerHTML, /예상 잔여 <b>5.00 MB/);
records.set('원고', '가나다😀');
assert.equal(context.getStorageUsage(), ('원고'.length + '가나다😀'.length) * 2);
tick();
assert.match(card.innerHTML, /14 B 사용/);
records.set('large', 'x'.repeat(2400000));
storageEvent();
assert.match(card.innerHTML, /예상 공간이 거의 찼습니다/);
records.set('large', 'x'.repeat(2700000));
tick();
assert.match(card.innerHTML, /aria-valuenow="100.0"/);
assert.match(card.innerHTML, /예상 잔여 <b>0 B/);
records.clear();
tick();
assert.match(card.innerHTML, /예상 잔여 <b>5.00 MB/);
storage.getItem = () => { throw new Error('Storage blocked'); };
records.set('blocked', 'data');
tick();
assert.match(card.innerHTML, /확인하지 못했습니다/);
assert.doesNotMatch(card.innerHTML, /role="meter"/);
console.log('Storage measurement, live updates, warning, overflow, deletion and unavailable storage passed.');
