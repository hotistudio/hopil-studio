(function AuxPatch() {
  'use strict';

  // ─── 2. 스냅샷 복원 UI ─────────────────────────────────────────
  // data safety 패치가 listSnapshots / restoreSnapshot 을 window 에 노출함.
  // 둘 다 존재할 때만 UI 작동.
  async function openSnapshotModal() {
    if (typeof window.listSnapshots !== 'function') {
      alert('스냅샷 기능이 활성화되지 않았어요.');
      return;
    }
    const snapshots = await window.listSnapshots();

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.5);
      z-index:10001; display:flex; align-items:center; justify-content:center;
      padding:20px;
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:var(--paper); border-radius:14px;
      max-width:560px; width:100%; max-height:80vh;
      display:flex; flex-direction:column;
      box-shadow:0 12px 40px rgba(0,0,0,.3);
      font-family:'Noto Sans KR',sans-serif;
    `;
    modal.innerHTML = `
      <div style="padding:18px 20px; border-bottom:1px solid var(--border);
        display:flex; justify-content:space-between; align-items:center; flex-shrink:0">
        <div>
          <div style="font-weight:700; font-size:16px; color:var(--ink)">자동 스냅샷</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px">
            15분마다 · 탭 닫을 때마다 저장 · 최근 20개 보관
          </div>
        </div>
        <button id="snap-close" style="background:none; border:none; font-size:22px;
          color:var(--muted); cursor:pointer; padding:0 4px; line-height:1">×</button>
      </div>
      <div id="snap-list" style="flex:1; overflow-y:auto; padding:10px 14px">
        ${snapshots.length === 0
          ? '<div style="text-align:center; padding:40px 0; color:var(--muted); font-size:13px">아직 저장된 스냅샷이 없어요.<br><span style="font-size:11px">앱 사용 중 15분 이상 지나면 자동으로 생성됩니다.</span></div>'
          : snapshots.map(s => `
            <div class="snap-row" data-ts="${s.ts}" style="
              padding:12px 14px; margin-bottom:6px;
              background:var(--cream); border:1px solid var(--border);
              border-radius:8px;
              display:flex; justify-content:space-between; align-items:center;
              gap:12px;">
              <div style="flex:1; min-width:0">
                <div style="font-weight:700; font-size:13px; color:var(--ink)">
                  ${s.when}
                </div>
                <div style="font-size:11px; color:var(--muted); margin-top:2px">
                  ${s.reason === 'interval' ? '정기 저장' :
                    s.reason === 'pagehide' ? '앱 종료 시' :
                    s.reason === 'initial' ? '앱 시작 시' :
                    s.reason === 'before-restore' ? '복원 직전 자동' : s.reason}
                  · 작품 ${s.projectCount}개
                </div>
              </div>
              <button class="btn btn-outline btn-sm snap-restore"
                data-ts="${s.ts}" style="flex-shrink:0; font-size:11px">복원</button>
            </div>
          `).join('')}
      </div>
      <div style="padding:12px 20px; border-top:1px solid var(--border);
        font-size:11px; color:var(--muted); line-height:1.6; flex-shrink:0">
        💡 복원 시 현재 데이터는 별도의 '복원 직전' 스냅샷으로 자동 저장돼요.<br>
        잘못 복원했을 때 이 창에서 다시 되돌릴 수 있어요.
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    modal.querySelector('#snap-close').addEventListener('click', () => backdrop.remove());

    modal.querySelectorAll('.snap-restore').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ts = parseInt(btn.dataset.ts);
        if (!ts) return;
        backdrop.remove();
        // restoreSnapshot 이 내부적으로 confirm + reload 하므로 그냥 호출
        await window.restoreSnapshot(ts);
      });
    });
  }

  // ─── 홈 화면에 버튼 추가 ───────────────────────────────────────
  // renderHome 이 매번 innerHTML 을 갈아끼우니, 렌더 후 후킹.
  const _origRenderHome = window.renderHome;
  if (typeof _origRenderHome === 'function') {
    window.renderHome = function () {
      const ret = _origRenderHome.apply(this, arguments);
      setTimeout(injectSnapshotButton, 0);
      return ret;
    };
  }

  function injectSnapshotButton() {
    const main = document.getElementById('main');
    if (!main) return;
    if (main.querySelector('#snap-open-btn')) return;

    // 홈 상단 어딘가에 눈에 띄지 않게 삽입 — 작은 텍스트 링크 스타일
    // 작품 목록 위 / 제목 근처에 붙임
    const titleEl = main.querySelector('h1, .font-display');
    if (!titleEl) return;

    const btn = document.createElement('button');
    btn.id = 'snap-open-btn';
    btn.style.cssText = `
      background:none; border:1px solid var(--border); color:var(--muted);
      padding:6px 12px; border-radius:7px; cursor:pointer;
      font-size:11px; font-family:'Noto Sans KR',sans-serif;
      margin-left:12px; vertical-align:middle;
      transition:all .15s;
    `;
    btn.innerHTML = '🕐 이전 버전 보기';
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = 'var(--gold)';
      btn.style.color = 'var(--gold)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--muted)';
    });
    btn.addEventListener('click', openSnapshotModal);

    // 제목 옆에 인라인으로
    titleEl.appendChild(btn);
  }
})();
