(function ChapterStatsPatch() {
  'use strict';

  const DEFAULT_GOAL = 5500;
  const GENKO_CHARS_PER_SHEET = 200; // 원고지 1장 = 200자

  // ─── 유틸 ───────────────────────────────────────────────────────
  function getGoal() {
    const p = (typeof getProject === 'function') ? getProject() : null;
    return (p && p.chapterGoal) ? p.chapterGoal : DEFAULT_GOAL;
  }

  function setGoal(n) {
    const p = (typeof getProject === 'function') ? getProject() : null;
    if (!p) return;
    p.chapterGoal = n;
    if (typeof autoSave === 'function') autoSave();
  }

  function countStats(text) {
    const all = text.length;
    const noSpace = text.replace(/\s/g, '').length;
    const genko = Math.round(all / GENKO_CHARS_PER_SHEET * 10) / 10;
    return { all, noSpace, genko };
  }

  function goalColor(count, goal) {
    const ratio = count / goal;
    if (ratio < 0.5)  return 'var(--muted)';      // 아직 멀었음
    if (ratio < 0.85) return 'var(--gold2)';      // 진행 중
    if (ratio < 1.15) return 'var(--teal2)';      // 목표 달성
    return 'var(--rust)';                          // 오버
  }

  // ─── 글자수 디스플레이 업그레이드 ───────────────────────────────
  // 기존: <span id="wc-display">1,234자</span>
  // 후: 같은 엘리먼트가 색상 + hover 영역이 되고,
  //     옆에 ▾ 토글 버튼이 붙는다.
  function enhanceWcDisplay() {
    const wc = document.getElementById('wc-display');
    if (!wc || wc._enhanced) return;
    wc._enhanced = true;
    wc.style.cursor = 'pointer';
    wc.style.userSelect = 'none';
    wc.title = '클릭: 상세 통계';
    wc.addEventListener('click', () => toggleStatsPopover(wc));
    applyWcColor(wc);
  }

  function applyWcColor(wc) {
    const ta = document.getElementById('prose-editor');
    if (!ta) return;
    const { all } = countStats(ta.value);
    wc.style.color = goalColor(all, getGoal());
  }

  // ─── 팝오버 ─────────────────────────────────────────────────────
  let _popoverEl = null;

  function toggleStatsPopover(anchor) {
    if (_popoverEl) { closeStatsPopover(); return; }
    openStatsPopover(anchor);
  }

  function closeStatsPopover() {
    if (_popoverEl) { _popoverEl.remove(); _popoverEl = null; }
    document.removeEventListener('click', onOutsideClick, true);
  }

  function onOutsideClick(e) {
    if (!_popoverEl) return;
    if (_popoverEl.contains(e.target)) return;
    if (e.target.id === 'wc-display') return;
    closeStatsPopover();
  }

  function openStatsPopover(anchor) {
    const ta = document.getElementById('prose-editor');
    if (!ta) return;
    const stats = countStats(ta.value);
    const goal  = getGoal();
    const ratio = Math.min(100, Math.round(stats.all / goal * 100));
    const barColor = goalColor(stats.all, goal);

    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'stats-popover';
    pop.style.cssText = `
      position:fixed; top:${rect.bottom + 8}px; left:${rect.left}px;
      min-width:260px; z-index:9000;
      background:var(--paper); border:1px solid var(--border);
      border-radius:10px; padding:14px 16px;
      box-shadow:0 8px 24px var(--shadow);
      font-family:'Noto Sans KR',sans-serif; font-size:12px;
      color:var(--ink);
    `;
    pop.innerHTML = `
      <div style="font-weight:700; font-size:13px; margin-bottom:10px;
        color:var(--ink); display:flex; justify-content:space-between; align-items:center">
        <span>이 화 통계</span>
        <button id="sp-close" style="background:none; border:none; cursor:pointer;
          color:var(--muted); font-size:16px; padding:0 4px; line-height:1">×</button>
      </div>

      <div style="display:grid; grid-template-columns:1fr auto; gap:6px 12px;
        margin-bottom:12px; align-items:center">
        <span style="color:var(--muted)">공백 포함</span>
        <span style="font-weight:700; text-align:right">${stats.all.toLocaleString()}자</span>

        <span style="color:var(--muted)">공백 제외</span>
        <span style="font-weight:700; text-align:right">${stats.noSpace.toLocaleString()}자</span>

        <span style="color:var(--muted)">원고지 (200자)</span>
        <span style="font-weight:700; text-align:right">${stats.genko}장</span>
      </div>

      <div style="font-size:11px; color:var(--muted); margin-bottom:4px;
        display:flex; justify-content:space-between">
        <span>편당 목표 대비</span>
        <span style="color:${barColor}; font-weight:700">${ratio}%</span>
      </div>
      <div style="height:8px; background:var(--cream); border-radius:4px;
        overflow:hidden; margin-bottom:10px">
        <div style="width:${ratio}%; height:100%; background:${barColor};
          transition:width .25s"></div>
      </div>

      <div style="display:flex; align-items:center; gap:6px;
        padding-top:10px; border-top:1px solid var(--border)">
        <label style="font-size:11px; color:var(--muted); flex-shrink:0">목표</label>
        <input id="sp-goal" type="number" value="${goal}" min="500" step="100"
          style="flex:1; padding:4px 8px; font-size:12px;
            border:1px solid var(--border); border-radius:6px;
            background:var(--white); color:var(--ink)">
        <span style="font-size:11px; color:var(--muted)">자</span>
      </div>
      <div style="font-size:10px; color:var(--muted); margin-top:6px; line-height:1.5">
        표준 편당 글자수: 카카오/네이버 5,500자, 문피아 5,000자
      </div>
    `;
    document.body.appendChild(pop);
    _popoverEl = pop;

    // 닫기 버튼
    pop.querySelector('#sp-close').addEventListener('click', closeStatsPopover);

    // 목표 변경
    const goalInput = pop.querySelector('#sp-goal');
    goalInput.addEventListener('change', () => {
      const n = parseInt(goalInput.value);
      if (n && n >= 500) {
        setGoal(n);
        applyWcColor(document.getElementById('wc-display'));
        // 팝오버 다시 그리기
        closeStatsPopover();
        setTimeout(() => openStatsPopover(anchor), 50);
      }
    });

    // 바깥 클릭 시 닫기
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick, true);
    }, 10);

    // 화면 벗어나면 위치 조정
    const popRect = pop.getBoundingClientRect();
    if (popRect.right > window.innerWidth - 10) {
      pop.style.left = (window.innerWidth - popRect.width - 10) + 'px';
    }
    if (popRect.bottom > window.innerHeight - 10) {
      pop.style.top = (rect.top - popRect.height - 8) + 'px';
    }
  }

  // ─── 기존 업데이트 지점에 훅 ─────────────────────────────────────
  // wc-display 요소를 MutationObserver 로 감시.
  // 기존 코드가 textContent 를 덮어쓰면 색상 재적용 + enhancer 재실행.
  function installObserver() {
    const wc = document.getElementById('wc-display');
    if (!wc) return;
    enhanceWcDisplay();

    const obs = new MutationObserver(() => {
      enhanceWcDisplay();
      applyWcColor(wc);
    });
    obs.observe(wc, { childList: true, characterData: true, subtree: true });
  }

  // ─── renderChapters 가 호출되면 새 wc-display 가 생기므로 재설치 ─
  const _origRenderChapters = window.renderChapters;
  if (typeof _origRenderChapters === 'function') {
    window.renderChapters = function () {
      closeStatsPopover();
      const ret = _origRenderChapters.apply(this, arguments);
      setTimeout(installObserver, 50);
      return ret;
    };
  }

  // ─── 집중 모드 글자수도 비슷하게 ────────────────────────────────
  const _origUpdateFocusWc = window.updateFocusWordCount;
  if (typeof _origUpdateFocusWc === 'function') {
    window.updateFocusWordCount = function () {
      _origUpdateFocusWc.apply(this, arguments);
      const fe = document.getElementById('focus-editor');
      const wc = document.getElementById('focus-wordcount');
      if (!fe || !wc) return;
      const stats = countStats(fe.value);
      const goal = getGoal();
      const ratio = Math.min(100, Math.round(stats.all / goal * 100));
      wc.style.color = goalColor(stats.all, goal);
      wc.title = `공백포함 ${stats.all.toLocaleString()}자 · 공백제외 ${stats.noSpace.toLocaleString()}자 · 목표 대비 ${ratio}%`;
    };
  }

  // ─── 초기 설치 (페이지 로드 직후 이미 집필 탭이면) ───────────────
  setTimeout(installObserver, 200);
})();
