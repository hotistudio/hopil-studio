(function MobileHeaderFix() {
  'use strict';

  // ─── CSS 주입 ───────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* 모바일 헤더 버튼 크기와 저장 상태 표시 */
    @media (max-width: 520px) {
      #btn-save-project {
        min-width: 36px;
        min-height: 36px;
        padding: 0 !important;
        background: var(--gold) !important;
        box-shadow: 0 2px 6px var(--shadow);
        position: relative;
      }
      #btn-save-project:active {
        transform: scale(0.95);
      }
      /* 저장 인디케이터 텍스트는 모바일에선 숨김 — 점으로 대체 */
      #save-indicator {
        display: none !important;
      }
      #btn-theme, #btn-darkmode {
        min-width: 36px;
        min-height: 36px;
        padding: 0 !important;
      }
      /* 파일 상태 🔗 아이콘도 작게 */
      #file-status {
        margin-right: 2px !important;
      }
      #file-status span {
        font-size: 10px !important;
      }
    }

    /* 저장됨 점 애니메이션 (모바일 저장 버튼 우상단) */
    #save-dot {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #2ecc71;
      box-shadow: 0 0 0 2px var(--gold);
      pointer-events: none;
      opacity: 0;
      transition: opacity .3s;
    }
    #save-dot.on {
      opacity: 1;
    }
    #save-dot.saving {
      background: #f39c12;
      animation: saveDotPulse 0.6s ease-in-out infinite;
    }
    @keyframes saveDotPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.3); }
    }
  `;
  document.head.appendChild(style);

  // ─── 저장 버튼에 점 추가 ────────────────────────────────────────
  function injectSaveDot() {
    const btn = document.getElementById('btn-save-project');
    if (!btn) return;
    if (btn.querySelector('#save-dot')) return;
    const dot = document.createElement('span');
    dot.id = 'save-dot';
    btn.appendChild(dot);
  }

  // 최초 시도 + 혹시 DOM이 아직 없으면 재시도
  setTimeout(injectSaveDot, 100);
  setTimeout(injectSaveDot, 500);

  // ─── 저장 상태에 따라 점 토글 ──────────────────────────────────
  // autoSave 가 호출되면 잠깐 saving(주황) → 잠시 후 on(초록)
  let _dotTimer = null;
  const _origAutoSave = window.autoSave;
  window.autoSave = function () {
    const dot = document.getElementById('save-dot');
    if (dot) {
      dot.classList.remove('on');
      dot.classList.add('saving');
    }
    _origAutoSave.apply(this, arguments);
    clearTimeout(_dotTimer);
    _dotTimer = setTimeout(() => {
      const d = document.getElementById('save-dot');
      if (d) {
        d.classList.remove('saving');
        d.classList.add('on');
      }
    }, 400);
  };

  // ─── 저장 버튼에 길게 누르기 힌트 (모바일) ─────────────────────
  // 저장 성공 시 토스트로 "저장됨 · N초 전" 확인 가능.
  // 버튼에 aria-label 보강해 스크린리더도 지원.
  setTimeout(() => {
    const btn = document.getElementById('btn-save-project');
    if (btn) {
      btn.setAttribute('aria-label', '현재 작품을 파일에 저장');
    }
  }, 200);
})();
