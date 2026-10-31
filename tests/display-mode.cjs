const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/08-features.js', 'utf8');
const start = source.indexOf('function initDarkMode()');
const end = source.indexOf('// localStorage 사용량 표시', start);
assert(start >= 0 && end > start);

function createContext(initial = {}, prefersDark = false) {
  const values = { ...initial };
  const attrs = {};
  const icon = { setAttribute(name, value) { this[name] = value; } };
  const button = {
    querySelector: () => icon,
    setAttribute(name, value) { this[name] = value; },
  };
  const context = vm.createContext({
    localStorage: {
      getItem: key => Object.hasOwn(values, key) ? values[key] : null,
      setItem: (key, value) => { values[key] = String(value); },
    },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    document: {
      documentElement: {
        setAttribute: (name, value) => { attrs[name] = value; },
        getAttribute: name => attrs[name] || null,
      },
      getElementById: id => id === 'btn-darkmode' ? button : null,
    },
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, values, attrs, button, icon };
}

const legacy = createContext({ hopil_studio_darkmode: 'true' });
legacy.context.initDarkMode();
assert.equal(legacy.attrs['data-theme'], 'dark');
assert.equal(legacy.values.hopil_studio_display_mode, 'dark');
assert.equal(legacy.icon.href, '#icon-sun');

const paper = createContext({ hopil_studio_display_mode: 'paper' }, true);
paper.context.initDarkMode();
assert.equal(paper.attrs['data-theme'], 'paper');
assert.equal(paper.attrs['data-color-theme'], 'green');
assert.equal(paper.button['aria-label'], '다크모드 전환');
paper.context.toggleDarkMode();
assert.equal(paper.attrs['data-theme'], 'dark');
paper.context.toggleDarkMode();
assert.equal(paper.attrs['data-theme'], 'light');
paper.context.applyDisplayMode('paper');
assert.equal(paper.values.hopil_studio_display_mode, 'paper');

const custom = createContext({ hopil_studio_color_theme: 'purple' });
custom.context.applyDisplayMode('paper');
assert.equal(custom.attrs['data-color-theme'], 'purple');
custom.context.applyDisplayMode('invalid');
assert.equal(custom.attrs['data-theme'], 'paper');

console.log('Display mode migration, paper palette, and dark toggle passed.');
