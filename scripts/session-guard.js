// 작품을 읽거나 자동저장을 시작하기 전에 브라우저의 배타 잠금을 얻는다.
// 잠금은 문서가 닫힐 때 브라우저가 해제한다. 숨겨진 창도 소유권을 유지한다.
(function () {
  'use strict';

  const screen = document.createElement('div');
  screen.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--paper,#fff);color:var(--ink,#222);display:grid;place-items:center;padding:24px';
  screen.innerHTML = '<div style="max-width:420px;line-height:1.8"><h2>호필 스튜디오</h2><p role="status"></p><button type="button" class="btn btn-primary">다시 시도</button></div>';
  document.body.appendChild(screen);
  const message = screen.querySelector('p');
  const retry = screen.querySelector('button');
  // 안내 뒤의 버튼과 단축키가 앱 초기화 전에 실행되지 않도록 한다.
  const content = [...document.body.children].filter(el => el !== screen && el.tagName !== 'SCRIPT');
  content.forEach(el => { el.inert = true; });

  async function loadApplication() {
    for (const entry of document.querySelectorAll('script[data-app-src]')) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = entry.dataset.appSrc;
        script.onload = resolve;
        script.onerror = () => reject(new Error('앱 파일을 불러오지 못했습니다.'));
        document.body.appendChild(script);
      });
    }
    content.forEach(el => { el.inert = false; });
    screen.remove();
  }

  async function start() {
    retry.disabled = true;
    message.textContent = '저장 공간을 확인하고 있습니다.';
    if (!navigator.locks) {
      message.textContent = '이 환경에서는 여러 창의 저장 충돌을 방지할 수 없습니다. 최신 브라우저에서 공개 페이지를 열어주세요.';
      retry.disabled = false;
      return;
    }
    try {
      await navigator.locks.request('hopil-studio-editor', { ifAvailable: true }, async lock => {
        if (!lock) {
          message.textContent = '다른 창에서 호필 스튜디오를 사용하고 있습니다. 그 창을 닫은 뒤 다시 시도하면 최신 원고를 불러옵니다.';
          retry.disabled = false;
          return;
        }
        try {
          await loadApplication();
        } catch (error) {
          message.textContent = '앱을 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.';
          retry.textContent = '새로고침';
          retry.onclick = () => location.reload();
          retry.disabled = false;
        }
        // 부분 초기화에 실패해도 이미 실행된 타이머가 있으므로 잠금을 유지한다.
        await new Promise(() => {});
      });
    } catch (error) {
      message.textContent = '저장 공간 잠금을 확인하지 못했습니다. 다시 시도해주세요.';
      retry.disabled = false;
    }
  }

  retry.onclick = start;
  window.addEventListener('pageshow', event => {
    if (event.persisted) location.reload();
  });
  void start();
})();
