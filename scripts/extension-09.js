(function PomodoroTier1() {
  'use strict';

  const STORAGE_STATE = 'hopil_studio_pomo_state';
  const STORAGE_DAILY = 'hopil_studio_pomo_daily';

  // ─── 유틸 ───────────────────────────────────────────────────────
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function saveState() {
    try {
      const s = window.pomoState;
      if (!s) return;
      const saved = {
        running: s.running,
        mode: s.mode,
        endAt: s.endAt,          // 타이머 끝날 절대 시각 (ms)
        remaining: s.remaining,  // 일시정지 시 사용
        total: s.total,
        session: s.session,
        goal: s.goal,
        completedWork: s.completedWork,
        startChars: s.startChars,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_STATE, JSON.stringify(saved));
    } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_STATE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_STATE); } catch(e) {}
  }

  function loadDaily() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DAILY) || '{}');
    } catch(e) { return {}; }
  }

  function saveDaily(d) {
    try { localStorage.setItem(STORAGE_DAILY, JSON.stringify(d)); } catch(e) {}
  }

  function incDaily() {
    const d = loadDaily();
    const t = todayStr();
    d[t] = (d[t] || 0) + 1;
    saveDaily(d);
    return d[t];
  }

  function getTodayCount() {
    return loadDaily()[todayStr()] || 0;
  }

  // ─── Notification 권한 ──────────────────────────────────────────
  let _notifChecked = false;

  async function requestNotifPermission() {
    if (_notifChecked) return;
    _notifChecked = true;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch(e) {}
    }
  }

  function showNotif(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        silent: false,
        tag: 'hopil-pomo',      // 중복 알림 덮어쓰기
        requireInteraction: false,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => { try { n.close(); } catch(e) {} }, 8000);
    } catch(e) {}
  }

  // ─── pomoToggle 덮어쓰기 ────────────────────────────────────────
  // 시작 시 endAt = now + remaining*1000. 일시정지 시 remaining 저장.
  const _origPomoToggle = window.pomoToggle;
  window.pomoToggle = function () {
    if (!window.pomoState) return;

    if (pomoState.running) {
      // 일시정지 — 현재 남은 시간 계산해서 저장
      const now = Date.now();
      if (pomoState.endAt) {
        pomoState.remaining = Math.max(0, Math.ceil((pomoState.endAt - now) / 1000));
      }
      clearInterval(pomoState.timer);
      pomoState.running = false;
      pomoState.endAt = null;
      const btn = document.getElementById('pomo-playpause');
      if (btn) btn.textContent = '▶';
    } else {
      // 시작 — endAt 설정
      if (pomoState.mode === 'work' && pomoState.remaining === (typeof POMO_WORK !== 'undefined' ? POMO_WORK : 1500)) {
        const editor = document.getElementById('prose-editor') || document.getElementById('focus-editor');
        pomoState.startChars = editor ? editor.value.length : 0;
        if (typeof resetSessionTyping === 'function') resetSessionTyping();
      }
      pomoState.running = true;
      pomoState.endAt = Date.now() + pomoState.remaining * 1000;
      const btn = document.getElementById('pomo-playpause');
      if (btn) btn.textContent = 'II';
      pomoState.timer = setInterval(pomoTick, 1000);

      // 첫 시작에서 Notification 권한 요청
      requestNotifPermission();
    }
    saveState();
  };

  // ─── pomoTick 덮어쓰기 — Date.now 기반 ─────────────────────────
  const _origPomoTick = window.pomoTick;
  window.pomoTick = function () {
    if (!window.pomoState) return;
    if (!pomoState.running) return;

    const now = Date.now();
    const rem = Math.max(0, Math.ceil((pomoState.endAt - now) / 1000));
    pomoState.remaining = rem;

    if (rem <= 0) {
      pomoComplete();
      return;
    }
    if (typeof pomoUpdateDisplay === 'function') pomoUpdateDisplay();
    updateTabTitle();

    // 10초마다 persist (매초 쓰면 과도)
    if (rem % 10 === 0) saveState();
  };

  // ─── pomoComplete 덮어쓰기 ──────────────────────────────────────
  // 원본을 그대로 호출하되 그 전에 알림·기록·상태정리 후처리.
  const _origPomoComplete = window.pomoComplete;
  window.pomoComplete = function () {
    if (!window.pomoState) return;

    const wasWork = (pomoState.mode === 'work');

    // 원본 로직 실행 (토스트, 사운드, 모드 전환)
    _origPomoComplete.apply(this, arguments);

    // 완료 후 endAt 초기화
    pomoState.endAt = null;

    if (wasWork) {
      // 오늘의 완료 카운트 증가
      const todayCount = incDaily();

      // OS 알림
      const editor = document.getElementById('prose-editor') || document.getElementById('focus-editor');
      const msg = `오늘 ${todayCount}회째 · 휴식 시간입니다`;
      showNotif('🍅 집필 세션 완료', msg);
    } else {
      showNotif('☕ 휴식 끝', '다시 집필을 시작해보세요');
    }

    saveState();
    renderTodayCount();
  };

  // ─── pomoReset / pomoSkip 덮어쓰기 ─────────────────────────────
  const _origPomoReset = window.pomoReset;
  window.pomoReset = function () {
    _origPomoReset.apply(this, arguments);
    if (window.pomoState) pomoState.endAt = null;
    saveState();
  };

  const _origPomoSkip = window.pomoSkip;
  window.pomoSkip = function () {
    _origPomoSkip.apply(this, arguments);
    saveState();
  };

  // closePomodoro 에서 일시정지하는 원본 동작은 유지.
  // 다만 상태 저장 추가.
  const _origClosePomodoro = window.closePomodoro;
  window.closePomodoro = function () {
    _origClosePomodoro.apply(this, arguments);
    saveState();
  };

  // ─── 탭 제목에 시간 표시 ────────────────────────────────────────
  let _origTitle = null;
  function updateTabTitle() {
    if (!window.pomoState) return;
    if (_origTitle == null) _origTitle = document.title;
    if (!pomoState.running) {
      if (document.title !== _origTitle) document.title = _origTitle;
      return;
    }
    const m = String(Math.floor(pomoState.remaining / 60)).padStart(2, '0');
    const s = String(pomoState.remaining % 60).padStart(2, '0');
    const icon = pomoState.mode === 'work' ? '🍅' : '☕';
    document.title = `${icon} ${m}:${s} · ${_origTitle}`;
  }

  // ─── visibilitychange: 돌아왔을 때 즉시 재동기화 ────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!window.pomoState || !pomoState.running) return;
    // 그 사이 타이머가 지연됐을 수 있으니 바로 tick 재실행
    pomoTick();
  });

  // ─── 페이지 나갈 때 상태 저장 ───────────────────────────────────
  window.addEventListener('pagehide', saveState);
  window.addEventListener('beforeunload', saveState);

  // ─── 오늘의 뽀모 카운트 표시 (위젯에 작게 추가) ────────────────
  function renderTodayCount() {
    const widget = document.getElementById('pomo-widget');
    if (!widget) return;
    let el = document.getElementById('pomo-today-count');
    if (!el) {
      const info = document.getElementById('pomo-session-info');
      if (!info) return;
      el = document.createElement('div');
      el.id = 'pomo-today-count';
      el.style.cssText = 'font-size:10px;color:rgba(255,255,255,.45);margin-top:3px;text-align:center';
      info.parentNode.insertBefore(el, info.nextSibling);
    }
    const n = getTodayCount();
    el.textContent = n > 0 ? `오늘 완료 ${n}회 🎯` : '';
  }

  // ─── 앱 시작 시 이전 상태 복원 ──────────────────────────────────
  function restoreOnLoad() {
    if (!window.pomoState) return;
    const saved = loadState();
    if (!saved) return;

    // 핵심 필드 복원
    pomoState.mode          = saved.mode          || 'work';
    pomoState.total         = saved.total         || pomoState.total;
    pomoState.session       = saved.session       || 1;
    pomoState.goal          = saved.goal          || pomoState.goal;
    pomoState.completedWork = saved.completedWork || 0;
    pomoState.startChars    = saved.startChars    || 0;

    if (saved.running && saved.endAt) {
      const now = Date.now();
      const rem = Math.ceil((saved.endAt - now) / 1000);
      if (rem > 0) {
        // 아직 시간 남음 — 계속 실행
        pomoState.remaining = rem;
        pomoState.endAt = saved.endAt;
        pomoState.running = true;
        pomoState.timer = setInterval(pomoTick, 1000);
        const btn = document.getElementById('pomo-playpause');
        if (btn) btn.textContent = 'II';
      } else {
        // 떠나있는 동안 시간 끝남 — 완료 처리
        // 단, 너무 오래전(6시간 초과)이면 노이즈라 무시
        if (now - saved.endAt < 6 * 3600 * 1000) {
          pomoState.remaining = 0;
          pomoState.endAt = saved.endAt;
          pomoState.running = true; // complete 내부에서 false 됨
          setTimeout(() => {
            if (typeof pomoComplete === 'function') pomoComplete();
          }, 500);
        } else {
          // 세션 버림, 리셋
          pomoState.remaining = pomoState.total;
          pomoState.running = false;
          pomoState.endAt = null;
        }
      }
    } else {
      // 일시정지 상태 복원
      pomoState.remaining = saved.remaining || pomoState.total;
      pomoState.running = false;
      pomoState.endAt = null;
    }

    // UI 갱신 (위젯이 숨김 상태면 내부 데이터만 맞춰둠)
    if (typeof pomoUpdateDisplay === 'function') {
      const w = document.getElementById('pomo-widget');
      if (w && w.style.display !== 'none') pomoUpdateDisplay();
    }
    if (typeof pomoRenderDots === 'function') pomoRenderDots();
    updateTabTitle();
    renderTodayCount();
  }

  // togglePomodoro 호출 후에도 오늘 카운트 표시되도록 훅
  const _origTogglePomodoro = window.togglePomodoro;
  window.togglePomodoro = function () {
    _origTogglePomodoro.apply(this, arguments);
    renderTodayCount();
  };

  // 초기 복원은 원본 뽀모 초기화가 끝난 뒤
  setTimeout(restoreOnLoad, 300);

  // ─── 자정 넘어가면 오늘 카운트 UI 갱신 ─────────────────────────
  // 실행 중 자정 지나도 자연스럽게 카운트가 '0'으로 넘어가도록
  setInterval(renderTodayCount, 60 * 1000);
})();
