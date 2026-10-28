(function PomodoroTier2() {
  'use strict';

  const STORAGE_CONFIG = 'hopil_studio_pomo_config';

  // ─── 기본 설정 + 프리셋 ─────────────────────────────────────────
  const DEFAULT_CFG = {
    workMin: 25,
    shortMin: 5,
    longMin: 15,
    longEvery: 4,      // 몇 회 작업마다 긴 휴식
    autoChain: false,  // 휴식 끝나면 자동으로 다음 세션 시작
  };

  const PRESETS = [
    { id: 'classic',   name: '클래식 25·5·15',   workMin: 25, shortMin: 5,  longMin: 15, longEvery: 4 },
    { id: 'extended',  name: '확장 50·10·20',    workMin: 50, shortMin: 10, longMin: 20, longEvery: 3 },
    { id: 'deepwork',  name: '딥 워크 90·15·30', workMin: 90, shortMin: 15, longMin: 30, longEvery: 2 },
    { id: 'sprint',    name: '스프린트 15·3·10', workMin: 15, shortMin: 3,  longMin: 10, longEvery: 4 },
  ];

  function loadCfg() {
    try {
      const raw = localStorage.getItem(STORAGE_CONFIG);
      if (!raw) return { ...DEFAULT_CFG };
      return { ...DEFAULT_CFG, ...JSON.parse(raw) };
    } catch(e) { return { ...DEFAULT_CFG }; }
  }

  function saveCfg(cfg) {
    try { localStorage.setItem(STORAGE_CONFIG, JSON.stringify(cfg)); } catch(e) {}
  }

  let cfg = loadCfg();

  // ─── 원본 상수값 (POMO_WORK 등)은 const 라 덮어쓸 수 없음 ────────
  // 대신 pomoToggle/pomoComplete 가 참조할 때마다 cfg 를 보도록
  // 그 함수들을 "재정의"한다. 다행히 이미 이전 패치들에서 덮어쓴 상태.
  // 여기서는 pomoState.total / remaining 을 재계산하는 헬퍼만 제공.
  function secFor(mode) {
    if (mode === 'work')  return cfg.workMin  * 60;
    if (mode === 'short') return cfg.shortMin * 60;
    if (mode === 'long')  return cfg.longMin  * 60;
    return cfg.workMin * 60;
  }

  // ─── pomoComplete 에서 긴 휴식 판정을 cfg.longEvery 로 ─────────
  // 원본은 `completedWork % 4 === 0`. 이걸 바꾸려면 완성된 뒤
  // 이미 mode 가 'short' 나 'long' 으로 결정된 상태를 보정해야 함.
  const _prevPomoComplete = window.pomoComplete;
  window.pomoComplete = function () {
    if (!window.pomoState) { return _prevPomoComplete.apply(this, arguments); }

    const wasWork = (pomoState.mode === 'work');
    _prevPomoComplete.apply(this, arguments);

    // 작업 세션 완료 직후 원본이 mode 를 short/long 으로 바꿔놨음.
    // cfg.longEvery 에 맞게 재계산.
    if (wasWork && pomoState.completedWork > 0) {
      const isLong = (pomoState.completedWork % cfg.longEvery === 0);
      const newMode = isLong ? 'long' : 'short';
      const newTotal = secFor(newMode);
      if (pomoState.mode !== newMode || pomoState.total !== newTotal) {
        pomoState.mode = newMode;
        pomoState.total = newTotal;
        pomoState.remaining = newTotal;
        if (typeof pomoUpdateDisplay === 'function') pomoUpdateDisplay();
      }
    }

    // 작업 세션 total 도 cfg 로 맞춤 (원본은 POMO_WORK 상수 사용)
    if (!wasWork) {
      // 휴식 끝남 → 다음 작업 세션 시간도 cfg.workMin
      pomoState.total = secFor('work');
      pomoState.remaining = pomoState.total;
      if (typeof pomoUpdateDisplay === 'function') pomoUpdateDisplay();
    }

    // 자동 연쇄: 휴식 끝난 뒤 자동으로 다음 작업 시작
    // (단, 작업 완료 직후에는 적용 X — 휴식은 무조건 눌러야 시작)
    if (!wasWork && cfg.autoChain) {
      setTimeout(() => {
        if (typeof pomoToggle === 'function' && !pomoState.running) pomoToggle();
      }, 800);
    }
  };

  // ─── 작업 시작 시 cfg 값 반영 ────────────────────────────────────
  // pomoToggle 이 시작 시 이전에 'remaining === POMO_WORK' 인지 체크해서
  // startChars 를 저장함. POMO_WORK 는 바뀌지 않으니 이 조건은 거의 항상 false.
  // 대신 우리가 직접 'pomoState.mode === work 이고 remaining === total' 체크.
  const _prevPomoToggle = window.pomoToggle;
  window.pomoToggle = function () {
    if (!window.pomoState) return _prevPomoToggle.apply(this, arguments);

    // 시작하려는 순간 mode 의 total 을 cfg 에 맞춰놓기
    if (!pomoState.running) {
      const wantedTotal = secFor(pomoState.mode);
      // remaining 이 이전 total 과 같다 = 처음 시작 = cfg 에 맞춰 재설정
      if (pomoState.remaining === pomoState.total) {
        pomoState.total = wantedTotal;
        pomoState.remaining = wantedTotal;
      } else if (pomoState.total !== wantedTotal) {
        // 중간 시작(일시정지에서 재개) — total 은 cfg 로 맞추되 remaining 은 유지
        pomoState.total = wantedTotal;
      }
    }
    _prevPomoToggle.apply(this, arguments);
  };

  // ─── pomoReset 시에도 cfg 반영 ──────────────────────────────────
  const _prevPomoReset = window.pomoReset;
  window.pomoReset = function () {
    if (window.pomoState) {
      pomoState.total = secFor(pomoState.mode);
      pomoState.remaining = pomoState.total;
    }
    _prevPomoReset.apply(this, arguments);
  };

  // ─── 스페이스바 재생/일시정지 ───────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

    // 위젯이 열려있지 않으면 무시
    const widget = document.getElementById('pomo-widget');
    if (!widget || widget.style.display === 'none') return;

    // 텍스트 입력 중이면 무시
    const t = document.activeElement;
    if (t) {
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
    }

    e.preventDefault();
    if (typeof pomoToggle === 'function') pomoToggle();
  });

  // ─── 설정 패널 UI ──────────────────────────────────────────────
  function injectSettingsButton() {
    const header = document.getElementById('pomo-header');
    if (!header) return;
    if (document.getElementById('pomo-settings-btn')) return;

    // 기존 접기 버튼 앞에 설정 버튼 삽입
    const collapseBtn = document.getElementById('pomo-collapse-btn');
    if (!collapseBtn) return;

    const btn = document.createElement('button');
    btn.id = 'pomo-settings-btn';
    btn.title = '설정';
    btn.innerHTML = '⚙';
    btn.style.cssText = `
      background:none; border:none; cursor:pointer;
      color:rgba(255,255,255,.6); font-size:15px;
      padding:2px 6px; margin-right:2px;
      line-height:1;
    `;
    btn.addEventListener('click', toggleSettings);
    collapseBtn.parentNode.insertBefore(btn, collapseBtn);
  }

  function toggleSettings() {
    let panel = document.getElementById('pomo-settings-panel');
    if (panel) {
      panel.remove();
      return;
    }

    const widget = document.getElementById('pomo-widget');
    const body = document.getElementById('pomo-body');
    if (!widget || !body) return;

    panel = document.createElement('div');
    panel.id = 'pomo-settings-panel';
    panel.style.cssText = `
      background:rgba(0,0,0,.3); padding:12px 14px;
      border-top:1px solid rgba(255,255,255,.1);
      font-size:11px; color:rgba(255,255,255,.8);
      font-family:'Noto Sans KR',sans-serif;
    `;
    panel.innerHTML = `
      <div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:8px;letter-spacing:.5px">프리셋</div>
      <div id="pomo-presets" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:12px">
        ${PRESETS.map(p => `
          <button data-preset="${p.id}" style="
            background:rgba(255,255,255,.08); color:#fff; border:1px solid rgba(255,255,255,.12);
            border-radius:6px; padding:6px 8px; cursor:pointer;
            font-size:10px; font-family:'Noto Sans KR',sans-serif;
            text-align:left; line-height:1.3;
          ">${p.name}</button>
        `).join('')}
      </div>

      <div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:8px;letter-spacing:.5px">직접 설정 (분)</div>
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin-bottom:12px">
        <span>🍅 집필</span>
        <input type="range" id="cfg-work"  min="5"  max="120" step="5"  value="${cfg.workMin}" style="width:100%">
        <span id="cfg-work-val"  style="min-width:32px;text-align:right;font-weight:700">${cfg.workMin}분</span>

        <span>☕ 짧은</span>
        <input type="range" id="cfg-short" min="1"  max="30"  step="1"  value="${cfg.shortMin}" style="width:100%">
        <span id="cfg-short-val" style="min-width:32px;text-align:right;font-weight:700">${cfg.shortMin}분</span>

        <span>🌙 긴</span>
        <input type="range" id="cfg-long"  min="5"  max="60"  step="5"  value="${cfg.longMin}" style="width:100%">
        <span id="cfg-long-val"  style="min-width:32px;text-align:right;font-weight:700">${cfg.longMin}분</span>

        <span style="white-space:nowrap">긴 휴식 주기</span>
        <input type="range" id="cfg-every" min="1"  max="8"   step="1"  value="${cfg.longEvery}" style="width:100%">
        <span id="cfg-every-val" style="min-width:32px;text-align:right;font-weight:700">${cfg.longEvery}회</span>
      </div>

      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;border-top:1px solid rgba(255,255,255,.08)">
        <input type="checkbox" id="cfg-autochain" ${cfg.autoChain ? 'checked' : ''}
          style="margin:0;accent-color:var(--gold);width:14px;height:14px">
        <span style="font-size:11px">휴식 끝나면 자동으로 다음 집필 시작</span>
      </label>

      <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:6px;text-align:center">
        스페이스바 = 재생/일시정지
      </div>
    `;

    body.appendChild(panel);

    // ─── 프리셋 버튼 ───
    panel.querySelectorAll('[data-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const preset = PRESETS.find(p => p.id === b.dataset.preset);
        if (!preset) return;
        cfg.workMin = preset.workMin;
        cfg.shortMin = preset.shortMin;
        cfg.longMin = preset.longMin;
        cfg.longEvery = preset.longEvery;
        saveCfg(cfg);
        applyCfgLive();
        toggleSettings();  // 닫기
        toggleSettings();  // 다시 열기 (값 갱신)
      });
    });

    // ─── 슬라이더 ───
    function bindSlider(inputId, valId, key, suffix) {
      const inp = panel.querySelector('#' + inputId);
      const val = panel.querySelector('#' + valId);
      inp.addEventListener('input', () => {
        val.textContent = inp.value + suffix;
      });
      inp.addEventListener('change', () => {
        cfg[key] = parseInt(inp.value);
        saveCfg(cfg);
        applyCfgLive();
      });
    }
    bindSlider('cfg-work',  'cfg-work-val',  'workMin',   '분');
    bindSlider('cfg-short', 'cfg-short-val', 'shortMin',  '분');
    bindSlider('cfg-long',  'cfg-long-val',  'longMin',   '분');
    bindSlider('cfg-every', 'cfg-every-val', 'longEvery', '회');

    // ─── 자동 연쇄 ───
    panel.querySelector('#cfg-autochain').addEventListener('change', (e) => {
      cfg.autoChain = e.target.checked;
      saveCfg(cfg);
    });
  }

  // 설정이 바뀌면 현재 실행 중이 아닌 타이머는 즉시 반영
  function applyCfgLive() {
    if (!window.pomoState) return;
    if (pomoState.running) return; // 실행 중엔 다음 세션부터 적용
    pomoState.total = secFor(pomoState.mode);
    pomoState.remaining = pomoState.total;
    if (typeof pomoUpdateDisplay === 'function') pomoUpdateDisplay();
  }

  // ─── togglePomodoro 시 설정 버튼 주입 ───────────────────────────
  const _origTogglePomodoro = window.togglePomodoro;
  window.togglePomodoro = function () {
    _origTogglePomodoro.apply(this, arguments);
    setTimeout(injectSettingsButton, 10);
  };

  // 초기에 이미 열려있는 상태라면 붙이기
  setTimeout(injectSettingsButton, 500);

  // ─── 최초 로드 시 현재 모드의 total/remaining 을 cfg 에 맞춰둠 ──
  setTimeout(() => {
    if (!window.pomoState) return;
    if (pomoState.running) return;
    pomoState.total = secFor(pomoState.mode);
    pomoState.remaining = pomoState.total;
    if (typeof pomoUpdateDisplay === 'function') pomoUpdateDisplay();
  }, 400);
})();
