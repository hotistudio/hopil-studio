// ═══════════════════════════════════════════════════════════
// 뽀모도로
// ═══════════════════════════════════════════════════════════
const POMO_WORK = 25 * 60;
const POMO_SHORT = 5 * 60;
const POMO_LONG = 15 * 60;

let pomoState = window.pomoState = {
  running: false,
  mode: 'work',
  remaining: POMO_WORK,
  total: POMO_WORK,
  session: 1,
  goal: 4,
  completedWork: 0,
  startChars: 0,
  timer: null,
  sessionTypingSec: 0,  // 현재 세션 타이핑 초
};

// ═══════════════════════════════════════════════════════════
// 한글 검색 - compositionend로 조합 완료 감지
// ═══════════════════════════════════════════════════════════
const _searchHandlers = {
  'glossary-search-input':  () => { window._glossarySearch = document.getElementById('glossary-search-input').value; renderGlossaryCards(); },
  'split-glossary-search':  () => { window._glossaryPanelQ = splitElement('split-glossary-search')?.value || ''; refreshSplitGlossaryCards(); },
  'item-search-input':      () => { window._itemSearch = document.getElementById('item-search-input').value; renderItemGrid(); },
  'split-item-search':      () => { window._splitItemQ = splitElement('split-item-search')?.value || ''; refreshSplitItems(); },
  'split-memo-search':      () => { window._spMemoQ = splitElement('split-memo-search')?.value || ''; refreshSplitMemo(); },
  'fr-find':                () => { frHighlight(false); },
};

document.addEventListener('compositionend', e => {
  const id = e.target?.id;
  if (_searchHandlers[id]) _searchHandlers[id]();
});

document.addEventListener('compositionupdate', e => {
  const id = e.target?.id;
  if (_searchHandlers[id]) setTimeout(() => _searchHandlers[id](), 0);
});

document.addEventListener('input', e => {
  const id = e.target?.id;
  if (_searchHandlers[id] && !e.isComposing) _searchHandlers[id]();
});

function pomoCollapse() {
  const body = document.getElementById('pomo-body');
  const btn = document.getElementById('pomo-collapse-btn');
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  btn.textContent = collapsed ? '▾' : '▴';
  btn.title = collapsed ? '접기' : '펼치기';
}

function togglePomodoro() {
  const w = document.getElementById('pomo-widget');
  if (w.style.display === 'none') {
    w.style.display = 'block';
    pomoRenderDots();
    pomoUpdateDisplay();
  } else {
    closePomodoro();
  }
}

function closePomodoro() {
  document.getElementById('pomo-widget').style.display = 'none';
  if (pomoState.running) pomoToggle(); // 닫아도 일시정지
}

function pomoToggle() {
  if (pomoState.running) {
    clearInterval(pomoState.timer);
    pomoState.running = false;
    document.getElementById('pomo-playpause').textContent = '▶';
  } else {
    // 집필 세션 시작 시 현재 글자 수 기록
    if (pomoState.mode === 'work' && pomoState.remaining === POMO_WORK) {
      const editor = document.getElementById('prose-editor') || document.getElementById('focus-editor');
      pomoState.startChars = editor ? editor.value.length : 0;
      resetSessionTyping();
    }
    pomoState.running = true;
    document.getElementById('pomo-playpause').textContent = 'II';
    pomoState.timer = setInterval(pomoTick, 1000);
  }
}

function pomoTick() {
  if (pomoState.remaining <= 0) {
    pomoComplete();
    return;
  }
  pomoState.remaining--;
  pomoUpdateDisplay();
}

function pomoPlaySound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'work'
      ? [{ f: 880, t: 0, d: 0.3 }, { f: 1100, t: 0.2, d: 0.3 }, { f: 1320, t: 0.4, d: 0.5 }]  // 집필 완료 - 경쾌하게 올라가는 3음
      : [{ f: 660, t: 0, d: 0.4 }, { f: 550, t: 0.3, d: 0.6 }];  // 휴식 끝 - 부드럽게 내려가는 2음
    notes.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, ctx.currentTime + t);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d);
    });
  } catch(e) {}
}

function pomoComplete() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  document.getElementById('pomo-playpause').textContent = '▶';

  // 진동
  navigator.vibrate?.([200, 100, 200]);

  // 소리
  pomoPlaySound(pomoState.mode);

  if (pomoState.mode === 'work') {
    // 쓴 글자 수 계산
    const editor = document.getElementById('prose-editor') || document.getElementById('focus-editor');
    const written = editor ? Math.max(0, editor.value.length - pomoState.startChars) : 0;
    pomoState.completedWork++;
    pomoShowToast(`🎉 집필 완료! +${written.toLocaleString()}자`);

    // 목표 달성 체크
    if (pomoState.completedWork >= pomoState.goal) {
      setTimeout(() => pomoShowToast('🏆 오늘 목표 달성!'), 2500);
    }

    // 긴 휴식 or 짧은 휴식
    const isLong = pomoState.completedWork % 4 === 0;
    pomoState.session++;
    pomoState.mode = isLong ? 'long' : 'short';
    pomoState.total = isLong ? POMO_LONG : POMO_SHORT;
    pomoState.remaining = pomoState.total;
  } else {
    pomoShowToast('☕ 휴식 끝! 다시 집필해봐요');
    pomoState.mode = 'work';
    pomoState.total = POMO_WORK;
    pomoState.remaining = POMO_WORK;
  }

  pomoRenderDots();
  pomoUpdateDisplay();
}

function pomoReset() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  pomoState.remaining = pomoState.total;
  document.getElementById('pomo-playpause').textContent = '▶';
  pomoHideToast();
  pomoUpdateDisplay();
}

function pomoSkip() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  pomoComplete();
}

function pomoSetGoal(delta) {
  pomoState.goal = Math.max(1, Math.min(12, pomoState.goal + delta));
  document.getElementById('pomo-goal-input').textContent = pomoState.goal;
  document.getElementById('pomo-goal-display').textContent = pomoState.goal;
  pomoRenderDots();
}

function pomoUpdateDisplay() {
  const m = String(Math.floor(pomoState.remaining / 60)).padStart(2, '0');
  const s = String(pomoState.remaining % 60).padStart(2, '0');
  document.getElementById('pomo-time').textContent = m + ':' + s;

  const pct = (pomoState.remaining / pomoState.total) * 100;
  document.getElementById('pomo-progress').style.width = pct + '%';
  document.getElementById('pomo-progress').style.background =
    pomoState.mode === 'work' ? 'var(--gold)' : 'var(--teal2)';

  const modeLabel = { work: '집필 중', short: '짧은 휴식', long: '긴 휴식' };
  document.getElementById('pomo-mode-label').textContent = modeLabel[pomoState.mode];
  document.getElementById('pomo-session-info').innerHTML =
    '세션 ' + pomoState.session + ' · 목표 <span id="pomo-goal-display">' + pomoState.goal + '</span>회';
}

function pomoRenderDots() {
  const container = document.getElementById('pomo-dots');
  if (!container) return;
  let html = '';
  for (let i = 0; i < pomoState.goal; i++) {
    const done = i < pomoState.completedWork;
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' +
      (done ? 'var(--gold)' : 'rgba(255,255,255,.2)') + '"></div>';
  }
  container.innerHTML = html;
}

function pomoShowToast(msg) {
  const t = document.getElementById('pomo-toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => pomoHideToast(), 3000);
}

function pomoHideToast() {
  const t = document.getElementById('pomo-toast');
  if (t) t.style.display = 'none';
}

// 드래그 이동
(function() {
  const widget = document.getElementById('pomo-widget');
  const header = document.getElementById('pomo-header');
  let dragging = false, ox = 0, oy = 0;

  function dragStart(cx, cy) {
    const rect = widget.getBoundingClientRect();
    // bottom/right 기준 → top/left 기준으로 전환
    widget.style.bottom = 'auto';
    widget.style.right = 'auto';
    widget.style.top = rect.top + 'px';
    widget.style.left = rect.left + 'px';
    ox = cx - rect.left;
    oy = cy - rect.top;
    dragging = true;
    header.style.cursor = 'grabbing';
  }

  function dragMove(cx, cy) {
    if (!dragging) return;
    let x = cx - ox;
    let y = cy - oy;
    // 화면 밖으로 못 나가게
    x = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, y));
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
  }

  function dragEnd() {
    dragging = false;
    header.style.cursor = 'grab';
  }

  header.addEventListener('mousedown', e => { if (e.target.tagName !== 'BUTTON') { e.preventDefault(); dragStart(e.clientX, e.clientY); } });
  document.addEventListener('mousemove', e => dragMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', dragEnd);

  header.addEventListener('touchstart', e => { if (e.target.tagName !== 'BUTTON') { dragStart(e.touches[0].clientX, e.touches[0].clientY); } }, {passive:true});
  document.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); dragMove(e.touches[0].clientX, e.touches[0].clientY); } }, {passive:false});
  document.addEventListener('touchend', dragEnd);
})();
