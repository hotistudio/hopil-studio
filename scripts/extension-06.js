(function PlatformExportPatch() {
  'use strict';

  // 플랫폼별 문단 구분자
  const PLATFORM_RULES = {
    kakao:  { paragraphSep: '\n\n\n', name: '카카오페이지', note: '문단 사이 빈 줄 2개' },
    naver:  { paragraphSep: '\n\n',   name: '네이버 시리즈', note: '문단 사이 빈 줄 1개' },
    munpia: { paragraphSep: '\n\n',   name: '문피아',       note: '문단 사이 빈 줄 1개' },
    joara:  { paragraphSep: '\n\n',   name: '조아라',       note: '문단 사이 빈 줄 1개' },
    ridi:   { paragraphSep: '\n',     name: '리디',         note: '원본 유지' },
    custom: { paragraphSep: '\n\n',   name: '직접 설정',    note: '기본(문단 사이 빈 줄 1개)' },
  };

  // 본문을 플랫폼 규칙에 맞게 변환
  function convertText(raw, rule) {
    // 1) 모든 줄바꿈 정규화
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 2) 연속된 빈 줄을 "하나의 문단 경계"로 취급 → 단일 \n\n 로 축약
    const paragraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length);
    // 3) 플랫폼 구분자로 다시 결합
    return paragraphs.join(rule.paragraphSep);
  }

  // 클립보드 복사
  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* 권한 문제 → 폴백 */ }
    }
    // 폴백: textarea + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  // txt 다운로드
  function downloadTxt(text, filename) {
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }); // BOM 포함
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 내보낼 텍스트 구성
  function buildExportText(project, scope, currentIdx, rule) {
    const chapters = project.chapters || [];
    if (chapters.length === 0) return '';

    let targets = [];
    if (scope === 'current') {
      if (currentIdx != null && chapters[currentIdx]) targets = [chapters[currentIdx]];
      else targets = chapters.slice(0, 1);
    } else if (scope === 'all') {
      targets = chapters;
    }

    const parts = targets.map(ch => {
      const title = ch.title || '제목 없음';
      const body = convertText(manuscriptExportText(ch.content), rule);
      if (scope === 'all') {
        // 화 사이에 제목 헤더 삽입
        return `[${title}]\n\n${body}`;
      }
      return body;
    });

    // 화 사이는 넉넉한 공백
    const chapterSep = scope === 'all' ? '\n\n\n' : '\n\n';
    return parts.join(chapterSep);
  }

  // ─── UI 삽입 ───────────────────────────────────────────────────
  // renderManuscript 가 호출된 다음 카드 하나 append.
  const _origRenderManuscript = window.renderManuscript;
  if (typeof _origRenderManuscript === 'function') {
    window.renderManuscript = function () {
      const ret = _origRenderManuscript.apply(this, arguments);
      setTimeout(injectExportCard, 0);
      return ret;
    };
  }

  function injectExportCard() {
    const main = document.getElementById('main');
    if (!main) return;
    // 이미 있으면 재삽입 안 함
    if (main.querySelector('#ms-export-card')) return;

    const wrap = main.querySelector('[style*="max-width:900px"]');
    if (!wrap) return;

    const p = (typeof getProject === 'function') ? getProject() : null;
    if (!p) return;
    const chapters = p.chapters || [];

    const card = document.createElement('div');
    card.id = 'ms-export-card';
    card.className = 'card';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <div class="sec-title">플랫폼별 내보내기</div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:12px; line-height:1.6">
        플랫폼에 맞는 줄바꿈 규칙을 적용해 본문을 내보냅니다.
        ${chapters.length === 0 ? '<br><span style="color:var(--rust)">⚠️ 아직 화가 없어요.</span>' : ''}
      </div>

      <div class="form-grid" style="margin-bottom:14px">
        <div>
          <label class="label">플랫폼</label>
          <select id="ex-platform" style="width:100%">
            ${Object.entries(PLATFORM_RULES).map(([k, v]) =>
              `<option value="${k}">${v.name}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="label">범위</label>
          <select id="ex-scope" style="width:100%">
            <option value="current">현재 선택 화만</option>
            <option value="all">전체 화 (합본)</option>
          </select>
        </div>
        <div style="grid-column:span 2">
          <label class="label">화 선택 (현재 화 모드일 때)</label>
          <select id="ex-chapter" style="width:100%" ${chapters.length === 0 ? 'disabled' : ''}>
            ${chapters.length === 0
              ? '<option>화 없음</option>'
              : chapters.map((c, i) => `<option value="${i}">${(i+1).toString().padStart(2,'0')}. ${c.title || '제목 없음'} (${(c.content||'').length.toLocaleString()}자)</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="ex-preview-wrap" style="margin-bottom:14px">
        <label class="label" style="display:flex; justify-content:space-between; align-items:center">
          <span>미리보기</span>
          <span id="ex-stat" style="font-size:11px; color:var(--muted); font-weight:400"></span>
        </label>
        <textarea id="ex-preview" readonly rows="10"
          style="width:100%; font-family:'Noto Serif KR',serif; font-size:13px;
            line-height:1.7; padding:10px; background:var(--cream);
            border:1px solid var(--border); border-radius:8px;
            color:var(--ink); resize:vertical"></textarea>
        <div style="font-size:10px; color:var(--muted); margin-top:4px" id="ex-rule-note"></div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn-gold" id="ex-copy" ${chapters.length === 0 ? 'disabled' : ''}
          style="flex:1; min-width:140px">
          📋 클립보드 복사
        </button>
        <button class="btn btn-outline" id="ex-download" ${chapters.length === 0 ? 'disabled' : ''}
          style="flex:1; min-width:140px">
          📄 .txt 다운로드
        </button>
      </div>
    `;

    wrap.appendChild(card);

    // ─── 이벤트 바인딩 ──────────────────────────────────────────
    const selPlatform = card.querySelector('#ex-platform');
    const selScope    = card.querySelector('#ex-scope');
    const selChapter  = card.querySelector('#ex-chapter');
    const preview     = card.querySelector('#ex-preview');
    const stat        = card.querySelector('#ex-stat');
    const ruleNote    = card.querySelector('#ex-rule-note');
    const btnCopy     = card.querySelector('#ex-copy');
    const btnDownload = card.querySelector('#ex-download');

    // 현재 작품에 저장된 플랫폼 프리셋 기본 선택
    const cfg = (typeof getMsConfig === 'function') ? getMsConfig(p) : null;
    if (cfg && cfg.presetId && PLATFORM_RULES[cfg.presetId]) {
      selPlatform.value = cfg.presetId;
    }

    function refreshPreview() {
      const platform = selPlatform.value;
      const rule = PLATFORM_RULES[platform];
      const scope = selScope.value;
      const idx = parseInt(selChapter.value) || 0;

      selChapter.disabled = (scope !== 'current' || chapters.length === 0);

      const text = buildExportText(p, scope, idx, rule);
      preview.value = text.length > 2000
        ? text.slice(0, 2000) + '\n\n... (총 ' + text.length.toLocaleString() + '자, 이하 생략)'
        : text;
      stat.textContent = text.length === 0
        ? ''
        : `${text.length.toLocaleString()}자 / 문단 ${text.split(rule.paragraphSep).length}개`;
      ruleNote.textContent = `규칙: ${rule.note}`;
    }

    selPlatform.addEventListener('change', refreshPreview);
    selScope.addEventListener('change', refreshPreview);
    selChapter.addEventListener('change', refreshPreview);

    btnCopy.addEventListener('click', async () => {
      const rule = PLATFORM_RULES[selPlatform.value];
      const scope = selScope.value;
      const idx = parseInt(selChapter.value) || 0;
      const text = buildExportText(p, scope, idx, rule);
      if (!text) {
        if (typeof toast === 'function') toast('내보낼 내용이 없어요.');
        return;
      }
      const ok = await copyToClipboard(text);
      if (typeof toast === 'function') {
        toast(ok ? `클립보드에 복사됨 (${text.length.toLocaleString()}자) 📋` : '복사 실패 — 권한을 확인해주세요');
      }
    });

    btnDownload.addEventListener('click', () => {
      const rule = PLATFORM_RULES[selPlatform.value];
      const scope = selScope.value;
      const idx = parseInt(selChapter.value) || 0;
      const text = buildExportText(p, scope, idx, rule);
      if (!text) {
        if (typeof toast === 'function') toast('내보낼 내용이 없어요.');
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      let filename;
      if (scope === 'current') {
        const ch = chapters[idx];
        filename = `${(p.title||'작품')}_${(ch?.title||'화')}_${rule.name}_${date}.txt`;
      } else {
        filename = `${(p.title||'작품')}_전체_${rule.name}_${date}.txt`;
      }
      downloadTxt(text, filename);
      if (typeof toast === 'function') toast(`${rule.name} 형식으로 내보냄 📄`);
    });

    refreshPreview();
  }
})();
