// 입력 중인 줄을 화면의 약 45% 높이에 유지한다.
const TYPEWRITER_SCROLL_KEY = 'wnstudio_typewriter_scroll';
let typewriterScrolling = false;
try { typewriterScrolling = localStorage.getItem(TYPEWRITER_SCROLL_KEY) === 'true'; } catch (_) {}

function updateTypewriterButtons() {
  document.querySelectorAll('.typewriter-toggle').forEach(button => {
    button.setAttribute('aria-pressed', String(typewriterScrolling));
    button.title = typewriterScrolling
      ? '타자기 스크롤 끄기'
      : '입력 중인 줄을 화면 가운데에 유지';
  });
}

function toggleTypewriterScrolling() {
  typewriterScrolling = !typewriterScrolling;
  try { localStorage.setItem(TYPEWRITER_SCROLL_KEY, String(typewriterScrolling)); } catch (_) {}
  updateTypewriterButtons();
  if (typewriterScrolling) {
    const editor = document.activeElement?.matches?.('#prose-editor, #focus-editor')
      ? document.activeElement
      : document.querySelector('#focus-overlay.active #focus-editor') || document.getElementById('prose-editor');
    if (editor) requestAnimationFrame(() => scrollTypewriterCaret(editor));
  }
}

function scrollTypewriterCaret(editor) {
  if (!typewriterScrolling || !editor?.isConnected || editor.clientHeight <= 0) return;
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  const borderWidth = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  Object.assign(mirror.style, {
    position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden',
    pointerEvents: 'none', boxSizing: 'border-box',
    width: `${editor.clientWidth + borderWidth}px`, height: 'auto',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: style.wordBreak,
    fontFamily: style.fontFamily, fontSize: style.fontSize,
    fontWeight: style.fontWeight, fontStyle: style.fontStyle,
    lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing, textIndent: style.textIndent,
    textAlign: style.textAlign, direction: style.direction,
    padding: style.padding, border: style.border, tabSize: style.tabSize
  });
  mirror.textContent = editor.value.slice(0, editor.selectionStart);
  const caret = document.createElement('span');
  caret.textContent = '\u200b';
  mirror.appendChild(caret);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 2;
  const caretY = caret.offsetTop + lineHeight / 2;
  mirror.remove();
  const target = Math.max(0, caretY - editor.clientHeight * 0.45);
  editor.scrollTop = Math.min(target, editor.scrollHeight - editor.clientHeight);
}

function queueTypewriterScroll(editor) {
  if (!typewriterScrolling || editor._typewriterFrame) return;
  editor._typewriterFrame = requestAnimationFrame(() => {
    editor._typewriterFrame = null;
    if (document.activeElement === editor) scrollTypewriterCaret(editor);
  });
}

document.addEventListener('input', event => {
  if (event.isComposing) return;
  if (event.target?.matches?.('#prose-editor, #focus-editor')) queueTypewriterScroll(event.target);
}, true);
document.addEventListener('compositionend', event => {
  if (event.target?.matches?.('#prose-editor, #focus-editor')) queueTypewriterScroll(event.target);
}, true);
document.addEventListener('keyup', event => {
  if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(event.key)
      && event.target?.matches?.('#prose-editor, #focus-editor')) {
    queueTypewriterScroll(event.target);
  }
}, true);
document.addEventListener('focusin', event => {
  if (event.target?.matches?.('#prose-editor, #focus-editor')) queueTypewriterScroll(event.target);
}, true);

updateTypewriterButtons();
