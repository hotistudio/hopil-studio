const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/typewriter-scroll.js', 'utf8');
const saved = new Map();
const buttons = Array.from({ length: 2 }, () => ({
  attributes: {},
  setAttribute(key, value) { this.attributes[key] = value; }
}));
const editor = {
  isConnected: true, clientWidth: 300, clientHeight: 400,
  scrollHeight: 1000, scrollTop: 0,
  value: '가'.repeat(200), selectionStart: 100,
  matches: selector => selector.includes('#prose-editor')
};
const document = {
  activeElement: editor,
  body: { appendChild() {} },
  querySelectorAll: () => buttons,
  querySelector: () => null,
  getElementById: () => editor,
  addEventListener() {},
  createElement(tag) {
    if (tag === 'span') return { offsetTop: 300, textContent: '' };
    return { style: {}, appendChild() {}, remove() {}, textContent: '' };
  }
};
const style = {
  borderLeftWidth: '0px', borderRightWidth: '0px',
  fontFamily: 'serif', fontSize: '16px', fontWeight: '400',
  fontStyle: 'normal', lineHeight: '20px', letterSpacing: '0px',
  wordSpacing: '0px', textIndent: '0px', textAlign: 'left',
  direction: 'ltr', padding: '0px', border: '0px', tabSize: '8',
  wordBreak: 'normal'
};
const context = vm.createContext({
  document, getComputedStyle: () => style,
  localStorage: {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value)
  },
  requestAnimationFrame: callback => { callback(); return 1; }
});
vm.runInContext(source, context);
assert(buttons.every(button => button.attributes['aria-pressed'] === 'false'));
vm.runInContext('toggleTypewriterScrolling()', context);
assert.equal(saved.get('hopil_studio_typewriter_scroll'), 'true');
assert(buttons.every(button => button.attributes['aria-pressed'] === 'true'));
assert.equal(editor.scrollTop, 130);
vm.runInContext('toggleTypewriterScrolling()', context);
assert(buttons.every(button => button.attributes['aria-pressed'] === 'false'));
console.log('Typewriter toggle, persistence, and caret positioning passed.');
