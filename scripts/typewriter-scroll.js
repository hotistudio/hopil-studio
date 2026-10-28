// 입력 중인 줄을 화면의 약 45% 높이에 유지한다.
const TYPEWRITER_SCROLL_KEY = 'hopil_studio_typewriter_scroll';
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

let caretMirror = null;
let caretMirrorPrefix = null;
let caretMirrorTail = null;
let caretMirrorMarker = null;
let caretMirrorCachedPrefix = null;
let caretMirrorCachedTail = null;
let caretMirrorStyleKey = null;

function getTextareaCaretTop(editor, position = editor.selectionStart) {
  const style = getComputedStyle(editor);
  if (!caretMirror) {
    caretMirror = document.createElement('div');
    caretMirrorPrefix = document.createElement('span');
    caretMirrorTail = document.createElement('span');
    caretMirrorMarker = document.createElement('span');
    caretMirrorMarker.textContent = '\u200b';
    caretMirror.appendChild(caretMirrorPrefix);
    caretMirror.appendChild(caretMirrorTail);
    caretMirror.appendChild(caretMirrorMarker);
    document.body.appendChild(caretMirror);
  }
  const borderWidth = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  const mirrorStyleKey = [editor.clientWidth, borderWidth, style.wordBreak,
    style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle,
    style.lineHeight, style.letterSpacing, style.wordSpacing, style.textIndent,
    style.textAlign, style.direction, style.padding, style.border, style.tabSize].join('|');
  if (mirrorStyleKey !== caretMirrorStyleKey) {
    Object.assign(caretMirror.style, {
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
    caretMirrorStyleKey = mirrorStyleKey;
  }
  const paragraphStart = editor.value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const prefix = editor.value.slice(0, paragraphStart);
  if (prefix !== caretMirrorCachedPrefix) {
    caretMirrorPrefix.textContent = prefix;
    caretMirrorCachedPrefix = prefix;
  }
  const tail = editor.value.slice(paragraphStart, position);
  if (tail !== caretMirrorCachedTail) {
    caretMirrorTail.textContent = tail;
    caretMirrorCachedTail = tail;
  }
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 2;
  return caretMirrorMarker.offsetTop + lineHeight / 2;
}

function scrollTypewriterCaret(editor) {
  if (!typewriterScrolling || !editor?.isConnected || editor.clientHeight <= 0) return;
  const caretY = getTextareaCaretTop(editor);
  const target = Math.max(0, caretY - editor.clientHeight * 0.45);
  editor.scrollTop = Math.min(target, Math.max(0, editor.scrollHeight - editor.clientHeight));
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
