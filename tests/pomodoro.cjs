const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function boot(saved = {}) {
  const values = new Map(Object.entries(saved));
  const timers = [];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style: id === 'pomo-widget' ? { display: 'none' } : {},
      textContent: '', value: '', innerHTML: '',
      addEventListener() {},
    });
    return elements.get(id);
  };
  const context = {
    document: { title: '호필 스튜디오', getElementById: element, addEventListener() {} },
    navigator: {},
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    Date, Math, JSON,
  };
  context.window = context;
  context.window.addEventListener = () => {};
  vm.createContext(context);
  for (const file of ['extension-01.js', 'extension-09.js', 'extension-10.js']) {
    vm.runInContext(fs.readFileSync(`scripts/${file}`, 'utf8'), context, { filename: file });
  }
  return { context, values, element, runTimer(delay) {
    const timer = timers.find(item => item.delay === delay);
    assert.ok(timer, `missing ${delay}ms timer`);
    timer.fn();
  } };
}

const custom = boot({ hopil_studio_pomo_config: JSON.stringify({ workMin: 50, shortMin: 10, longMin: 20, longEvery: 3 }) });
custom.runTimer(400);
custom.element('prose-editor').value = '열 글자입니다';
custom.context.pomoToggle();
assert.equal(custom.context.pomoState.total, 3000);
assert.equal(custom.context.pomoState.startChars, custom.element('prose-editor').value.length);

const skipped = boot();
skipped.runTimer(400);
skipped.context.pomoToggle();
skipped.context.pomoSkip();
assert.equal(skipped.context.pomoState.completedWork, 0);
assert.equal(skipped.context.pomoState.mode, 'short');
assert.equal(skipped.context.pomoState.endAt, null);
assert.equal(JSON.parse(skipped.values.get('hopil_studio_pomo_state')).mode, 'short');
assert.equal(JSON.parse(skipped.values.get('hopil_studio_pomo_state')).remaining, 300);
assert.equal(skipped.values.get('hopil_studio_pomo_daily'), undefined);

const paused = boot({
  hopil_studio_pomo_config: JSON.stringify({ workMin: 50 }),
  hopil_studio_pomo_state: JSON.stringify({ mode: 'work', running: false, remaining: 1234, total: 3000, session: 1, goal: 4 }),
});
paused.runTimer(300);
paused.runTimer(400);
assert.equal(paused.context.pomoState.remaining, 1234);
assert.equal(paused.context.pomoState.total, 3000);
console.log('Pomodoro skip, custom session baseline, and paused restore passed.');
