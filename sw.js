// ═══════════════════════════════════════════════════════════════
// 호필 스튜디오 Service Worker
// 오프라인 지원 + 리소스 캐싱
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'hopil-v0.6.13-20261028';
const CACHE_NAME = `hopil-studio-${CACHE_VERSION}`;

// 앱 셸 — 설치 시 미리 캐시할 리소스
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './styles/fonts.css',
  './styles/app.css?v=0.6.13',
  './scripts/errors.js',
  './scripts/app.js?v=0.6.13',
  './scripts/extension-01.js?v=0.6.12',
  './scripts/extension-02.js',
  './scripts/extension-03.js',
  './scripts/extension-04.js',
  './scripts/extension-05.js',
  './scripts/extension-06.js',
  './scripts/extension-07.js',
  './scripts/extension-08.js',
  './scripts/extension-09.js',
  './scripts/extension-10.js',
  './scripts/typewriter-scroll.js',
];

// ─── INSTALL: 앱 셸 캐시 ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 개별 요청 실패해도 설치가 중단되지 않도록 각각 처리
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] 캐시 실패:', url, err);
          })
        )
      );
    })
  );
});

// ─── ACTIVATE: 이전 버전 캐시 정리 ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('hopil-studio-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── SKIP_WAITING 메시지 처리 ────────────────────────────────────
// index.html 이 업데이트 감지 시 postMessage 로 호출
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── FETCH: 네트워크 우선, 실패 시 캐시 ──────────────────────────
// HTML · JS 같은 자주 업데이트되는 파일은 최신 우선.
// 오프라인이거나 네트워크 실패 시에만 캐시 사용.
// 구글 폰트 · CDN 리소스는 캐시 우선 (stale-while-revalidate).
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // POST 등 non-GET 은 그대로 통과
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 외부 CDN/폰트는 stale-while-revalidate
  const isExternalAsset =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net');

  if (isExternalAsset) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 같은 출처: 네트워크 우선, 실패 시 캐시
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 그 외는 기본 동작
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    // 성공 응답만 캐시에 저장
    if (fresh && fresh.status === 200 && fresh.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // 네비게이션 요청이면 index.html 폴백
    if (req.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}
