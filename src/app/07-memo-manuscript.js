// MEMO PAD
// ═══════════════════════════════════════════════════════════════
const MEMO_COLORS = [
  {bg:'#fffde7',border:'#ffe082',label:'노랑'},
  {bg:'#e8f5e9',border:'#a5d6a7',label:'초록'},
  {bg:'#e3f2fd',border:'#90caf9',label:'파랑'},
  {bg:'#fce4ec',border:'#f48fb1',label:'핑크'},
  {bg:'#f3e5f5',border:'#ce93d8',label:'보라'},
  {bg:'#fff3e0',border:'#ffcc80',label:'주황'},
  {bg:'#ffffff',border:'#ddd3be',label:'흰색'},
];

function getMemos() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  return p.memos;
}

function saveMemos() { autoSave(); }

function renderMemoFull() {
  // 메모 수 갱신
  const memos = getMemos();
  const title = document.querySelector('#main .font-display');
  if (title) title.textContent = `메모장 (${memos.length})`;
  // 목록 갱신
  renderMemoList();
  // memo-grid-wrap이 없으면 전체 렌더
  if (!document.getElementById('memo-grid-wrap')) renderMemo();
}

function renderMemoList() {
  const memos = getMemos();
  // id 보정
  const p = getProject();
  if (p?.memos) {
    let _fixed = false;
    p.memos.forEach(m => { if (!m.id) { m.id = uid(); _fixed = true; } });
    if (_fixed) saveMemos();
  }
  const q = (window._memoSearch || '').trim().toLowerCase();
  const clearBtn = document.getElementById('memo-search-clear');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
  const grid = document.getElementById('memo-grid-wrap');
  if (!grid) return;
  if (memos.length === 0) {
    grid.innerHTML = '<div class="card empty-state"><div class="emoji">📝</div><p>메모를 추가해보세요.<br>아이디어, 설정, 대사 등 뭐든 자유롭게!</p></div>';
    return;
  }
  const shown = memos.filter(m =>
    !q ||
    (m.title||'').toLowerCase().includes(q) ||
    (m.content||'').toLowerCase().includes(q)
  );
  if (shown.length === 0) {
    grid.innerHTML = '<div class="card empty-state"><div class="emoji">🔍</div><p>검색 결과가 없어요.</p></div>';
  } else {
    grid.innerHTML = '<div class="memo-grid">' + shown.map(m => renderMemoCard(m, q)).join('') + '</div>';
  }
}

function renderMemo() {
  const memos = getMemos();
  document.getElementById('main').innerHTML = `
    <div style="max-width:1000px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="font-display" style="font-size:22px">메모장 (${memos.length})</div>
        <button class="btn btn-gold" onclick="addMemo()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          메모 추가
        </button>
      </div>
      <div style="position:relative;margin-bottom:16px">
        <input id="memo-search-input"
          oninput="window._memoSearch=this.value;renderMemoList()"
          placeholder="메모 검색..."
          style="width:100%;padding:9px 36px 9px 14px;border:1.5px solid var(--border);
            border-radius:10px;font-size:13px;background:var(--paper);color:var(--ink);
            font-family:'Noto Sans KR',sans-serif;outline:none;transition:border-color .15s"
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
        <button id="memo-search-clear"
          onclick="window._memoSearch='';document.getElementById('memo-search-input').value='';renderMemoList()"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
            display:none;background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted)">×</button>
      </div>
      <div id="memo-grid-wrap"></div>
    </div>`;
  renderMemoList();
}

function renderMemoCard(m, q='') {
  const col = MEMO_COLORS.find(c=>c.bg===m.color) || MEMO_COLORS[0];
  const mIdEsc = esc(m.id||'');
  // 검색어 하이라이트 (textarea는 HTML 렌더 안 되므로 미리보기용)
  const highlightedContent = q && m.content
    ? esc(m.content).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),
        s=>`<mark style="background:#ffe066;color:#18120a;border-radius:2px">${s}</mark>`)
    : null;
  return `
    <div class="memo-card" style="background:${col.bg};border-color:${col.border}">
      <div class="memo-card-header" style="border-color:${col.border};background:${col.bg}">
        <input class="memo-card-title" value="${esc(m.title||'')}"
          oninput="updateMemo('${mIdEsc}','title',this.value)" placeholder="제목"
          style="color:#1a1208 !important;background:transparent !important">
        <div style="display:flex;align-items:center;gap:6px">
          <div class="memo-color-dot" style="background:${col.bg};border-color:${col.border}"
            onclick="showMemoColorPicker('${mIdEsc}',this)"></div>
          <button class="btn-icon" onclick="deleteMemo('${mIdEsc}')" style="color:#b5451b !important;width:28px;height:28px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b5451b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      ${q && highlightedContent
        ? `<div class="memo-card-body" style="color:#1a1208 !important;background:transparent !important;
            padding:10px 14px;font-size:13px;line-height:1.7;white-space:pre-wrap;min-height:80px">${highlightedContent}</div>`
        : `<textarea class="memo-card-body" rows="6"
            oninput="updateMemo('${mIdEsc}','content',this.value)"
            placeholder="자유롭게 메모하세요..."
            style="color:#1a1208 !important;background:transparent !important">${esc(m.content||'')}</textarea>`}
      <div style="padding:6px 14px 10px;font-size:10px;color:rgba(0,0,0,.4) !important">
        ${m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('ko-KR') : ''}
      </div>
    </div>`;
}

function addMemo() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  p.memos.unshift({
    id: uid(), title:'', content:'',
    color: MEMO_COLORS[0].bg,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveMemos(); renderMemoFull();
  // 첫 번째 메모 제목에 포커스
  setTimeout(() => document.querySelector('.memo-card-title')?.focus(), 100);
}

function updateMemo(id, key, val) {
  const p = getProject();
  const m = p?.memos?.find(x => x.id === id);
  if (!m) return;
  m[key] = val;
  m.updatedAt = new Date().toISOString();
  clearTimeout(window._memoSaveTimer);
  window._memoSaveTimer = setTimeout(saveMemos, 600);
}

function deleteMemo(id) {
  const p = getProject();
  const i = p?.memos?.findIndex(m => m.id === id) ?? -1;
  if (i < 0) return;
  confirmDialog('이 메모를 삭제합니다.', () => {
    p.memos.splice(i, 1);
    saveMemos(); renderMemoFull();
    toast('메모를 삭제했어요.');
  });
}

function showMemoColorPicker(id, dotEl) {
  const existing = document.getElementById('memo-color-picker');
  if (existing) { existing.remove(); return; }
  const picker = document.createElement('div');
  picker.id = 'memo-color-picker';
  const rect = dotEl.getBoundingClientRect();
  picker.style.cssText = `position:fixed;left:${rect.left-60}px;top:${rect.bottom+6}px;
    background:var(--white);border:1px solid var(--border);border-radius:10px;
    padding:10px;box-shadow:0 4px 20px var(--shadow);z-index:9000;
    display:flex;gap:8px;flex-wrap:wrap;width:180px`;
  const idEsc = esc(id||'');
  picker.innerHTML = MEMO_COLORS.map(c => `
    <div onclick="setMemoColor('${idEsc}','${c.bg}');document.getElementById('memo-color-picker')?.remove()"
      title="${c.label}"
      style="width:28px;height:28px;border-radius:50%;background:${c.bg};
        border:2px solid ${c.border};cursor:pointer;transition:transform .15s"
      onmouseover="this.style.transform='scale(1.2)'"
      onmouseout="this.style.transform=''">
    </div>`).join('');
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), {once:true}), 50);
}

function setMemoColor(id, color) {
  const p = getProject();
  const m = p?.memos?.find(x => x.id === id);
  if (!m) return;
  m.color = color;
  saveMemos(); renderMemoFull();
}


// ═══════════════════════════════════════════════════════════
// 특수기호 팔레트
// ═══════════════════════════════════════════════════════════
const SYMBOL_GROUPS = [
  {label:'따옴표', s:['"','"','‘','’','「','」','『','』','〈','〉','《','》','(',')']},
  {label:'점·선',  s:['…','·','—','–','~','～','•','―']},
  {label:'기호',   s:['○','●','□','■','△','▲','▽','▼','◇','◆','☆','★','×','✕','✓','※']},
  {label:'숫자원', s:['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩']},
  {label:'화살표', s:['→','←','↑','↓','↔','⇒','⇐','⇔']},
];

function buildSymbolPalette(){
  const pal=document.getElementById('symbol-palette');
  if(!pal||pal.dataset.built) return;
  pal.dataset.built='1';
  SYMBOL_GROUPS.forEach(grp=>{
    const lbl=document.createElement('div');
    lbl.style.cssText='width:100%;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-top:6px;margin-bottom:2px';
    lbl.textContent=grp.label;
    pal.appendChild(lbl);
    grp.s.forEach(sym=>{
      const btn=document.createElement('button');
      btn.className='sym-btn';
      btn.textContent=sym;
      btn.title=sym;
      btn.onclick=()=>insertSymbol(sym);
      pal.appendChild(btn);
    });
  });
}

function toggleSymbolPalette(){
  const pal=document.getElementById('symbol-palette');
  const tog=document.getElementById('sym-toggle-btn');
  if(!pal) return;
  buildSymbolPalette();
  const open=pal.style.display!=='none'&&pal.style.display!=='';
  pal.style.display=open?'none':'flex';
  if(tog){
    tog.style.background=open?'':'var(--gold-light)';
    tog.style.borderColor=open?'':'var(--gold)';
    tog.style.color=open?'':'var(--gold)';
  }
}

function insertSymbol(sym){
  const ta=document.getElementById('prose-editor');
  if(!ta) return;
  const s=ta.selectionStart, e=ta.selectionEnd;
  const selected=ta.value.slice(s,e);

  // 쌍 기호 감지: 짝수 글자이고 앞뒤가 대응되는 경우
  const isPair = sym.length===2;

  if(isPair){
    const open=sym[0], close=sym[1];
    // 선택된 텍스트가 있으면 감싸기
    const inner=selected||'';
    ta.value=ta.value.slice(0,s)+open+inner+close+ta.value.slice(e);
    if(inner){
      // 선택된 텍스트 유지
      ta.selectionStart=s+1;
      ta.selectionEnd=s+1+inner.length;
    } else {
      // 커서를 가운데로
      ta.selectionStart=ta.selectionEnd=s+1;
    }
  } else {
    ta.value=ta.value.slice(0,s)+sym+ta.value.slice(e);
    ta.selectionStart=ta.selectionEnd=s+sym.length;
  }
  ta.focus();
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}


// ═══════════════════════════════════════════════════════════
// 단축키 설정
// ═══════════════════════════════════════════════════════════
const ALL_SYMBOLS = [
  '"','"','‘','’','…','·','—','–','~',
  '「','」','『','』','〈','〉','《','》','(',')',
  '○','●','□','■','△','▲','☆','★','×','✓','※','·','•',
  '→','←','↑','↓','↔','⇒','①','②','③','④','⑤',
];

function showShortcutSettings() {
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  const symOpts = ALL_SYMBOLS.map(s =>
    `<option value="${s}">${s}</option>`
  ).join('');

  const rows = keys.map(k => {
    const cur = SHORTCUT_SYMBOLS[k] || '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:700;color:var(--muted);min-width:70px">
          Ctrl + <span style="background:var(--cream);border:1px solid var(--border);border-radius:5px;padding:2px 8px;color:var(--ink)">${k}</span>
        </div>
        <select id="sc-${k}" style="flex:1;padding:6px 10px;font-size:15px;font-family:'Noto Serif KR',serif">
          <option value="">없음</option>
          ${ALL_SYMBOLS.map(s => `<option value="${s}" ${s===cur?'selected':''}>${s} ${s===cur?'(현재)':''}</option>`).join('')}
        </select>
        <input id="sci-${k}" value="${cur}" maxlength="2"
          style="width:52px;text-align:center;font-size:18px;font-family:'Noto Serif KR',serif;padding:6px"
          placeholder="직접"
          oninput="document.getElementById('sc-${k}').value=''"
        >
      </div>`;
  }).join('');

  showModal(`
    <div class="modal-title">⚙ 단축키 설정</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">
      목록에서 선택하거나 오른쪽 칸에 직접 입력하세요. (최대 2자)
    </div>
    <div style="margin-bottom:20px">${rows}</div>
    <div style="display:flex;gap:10px;justify-content:space-between">
      <button class="btn btn-outline" onclick="resetShortcuts()">기본값으로</button>
      <div style="display:flex;gap:10px">
        <button class="btn btn-outline" onclick="closeModal()">취소</button>
        <button class="btn btn-gold" onclick="applyShortcuts()">저장</button>
      </div>
    </div>
  `, false);
}

function applyShortcuts() {
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  const newMap = {};
  keys.forEach(k => {
    const direct = document.getElementById('sci-' + k)?.value.trim();
    const sel    = document.getElementById('sc-' + k)?.value;
    newMap[k] = direct || sel || '';
  });
  SHORTCUT_SYMBOLS = newMap;
  saveShortcuts(newMap);
  closeModal();
  refreshShortcutBar();
  toast('단축키가 저장됐습니다 ✓');
}

function resetShortcuts() {
  if (!confirm('기본값으로 초기화하시겠습니까?')) return;
  SHORTCUT_SYMBOLS = { ...DEFAULT_SHORTCUTS };
  saveShortcuts(SHORTCUT_SYMBOLS);
  closeModal();
  refreshShortcutBar();
  toast('기본값으로 초기화됐습니다.');
}

function refreshShortcutBar() {
  const bar = document.getElementById('shortcut-bar');
  if (!bar) return;
  bar.innerHTML = '';

  // 라벨
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:10px;font-weight:700;color:var(--muted);margin-right:4px;letter-spacing:.5px;flex-shrink:0';
  lbl.textContent = '단축키';
  bar.appendChild(lbl);

  // 기호 버튼
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  keys.forEach(k => {
    const sym = SHORTCUT_SYMBOLS[k];
    if (!sym) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Ctrl+' + k;
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:2px;background:var(--white);border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:15px;color:var(--ink);cursor:pointer;font-family:"Noto Serif KR",serif;line-height:1';
    const small = document.createElement('span');
    small.style.cssText = 'font-size:9px;color:var(--muted);margin-right:2px;font-family:"Noto Sans KR",sans-serif';
    small.textContent = '^' + k;
    const symSpan = document.createElement('span');
    symSpan.textContent = sym;
    btn.appendChild(small);
    btn.appendChild(symSpan);
    btn.addEventListener('click', () => insertSymbol(sym));
    bar.appendChild(btn);
  });

  // 인디케이터
  const ind = document.createElement('span');
  ind.id = 'shortcut-indicator';
  ind.style.cssText = 'font-size:22px;font-weight:700;color:var(--gold);opacity:0;transition:opacity .3s;min-width:28px;text-align:center';
  bar.appendChild(ind);

  // 설정 버튼
  const cfg = document.createElement('button');
  cfg.type = 'button';
  cfg.textContent = '⚙ 단축키 설정';
  cfg.style.cssText = 'margin-left:auto;flex-shrink:0;background:transparent;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;font-family:"Noto Sans KR",sans-serif';
  cfg.addEventListener('click', showShortcutSettings);
  bar.appendChild(cfg);
}


// ═══════════════════════════════════════════════════════════
// 원고 설정 & 미리보기
// ═══════════════════════════════════════════════════════════
const MS_PRESETS = [
  {
    id: 'kakao', name: '카카오페이지', icon: '🟡',
    desc: '모바일 최적화 · 짧은 호흡',
    width: 360, font: 'Noto Serif KR', size: 16, line: 1.9,
    padH: 20, padV: 24, charsPerLine: 20, linesPerPage: 22,
  },
  {
    id: 'ridi', name: '리디', icon: '📗',
    desc: '전자책 리더 최적화',
    width: 420, font: 'Noto Serif KR', size: 17, line: 1.85,
    padH: 28, padV: 32, charsPerLine: 23, linesPerPage: 20,
  },
  {
    id: 'joara', name: '조아라', icon: '📘',
    desc: 'PC/모바일 범용',
    width: 680, font: 'Noto Sans KR', size: 15, line: 1.8,
    padH: 40, padV: 40, charsPerLine: 38, linesPerPage: 25,
  },
  {
    id: 'munpia', name: '문피아', icon: '📙',
    desc: 'PC 웹 최적화',
    width: 720, font: 'Noto Sans KR', size: 15, line: 1.8,
    padH: 48, padV: 40, charsPerLine: 40, linesPerPage: 25,
  },
  {
    id: 'naver', name: '네이버 시리즈', icon: '🟢',
    desc: '모바일 앱 최적화',
    width: 375, font: 'Noto Serif KR', size: 16, line: 1.9,
    padH: 18, padV: 24, charsPerLine: 20, linesPerPage: 22,
  },
  {
    id: 'custom', name: '직접 설정', icon: '⚙️',
    desc: '너비·글꼴·크기 직접 지정',
    width: 480, font: 'Noto Serif KR', size: 16, line: 1.85,
    padH: 24, padV: 28, charsPerLine: 26, linesPerPage: 22,
  },
];

function getMsConfig(p) {
  return p.msConfig || { presetId: 'kakao', ...MS_PRESETS[0] };
}

function renderManuscript() {
  const p = getProject();
  const cfg = getMsConfig(p);
  const preset = MS_PRESETS.find(pr => pr.id === cfg.presetId) || MS_PRESETS[0];
  const chapters = p.chapters || [];

  document.getElementById('main').innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:22px">원고 설정</div>

      <!-- 플랫폼 프리셋 -->
      <div class="card" style="margin-bottom:16px">
        <div class="sec-title">플랫폼 선택</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px" id="ms-preset-group">
          ${MS_PRESETS.map(pr => {
            const sel = cfg.presetId === pr.id;
            return `<button type="button" onclick="selectMsPreset('${pr.id}')"
              data-val="${pr.id}"
              style="padding:12px 10px;border:2px solid ${sel?'var(--gold)':'var(--border)'};
                border-radius:10px;cursor:pointer;text-align:center;
                background:${sel?'var(--gold-light)':'var(--white)'};transition:all .15s;
                font-family:'Noto Sans KR',sans-serif">
              <div style="font-size:22px;margin-bottom:4px">${pr.icon}</div>
              <div style="font-size:13px;font-weight:700;color:${sel?'var(--gold)':'var(--ink)'}">${pr.name}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${pr.desc}</div>
            </button>`;
          }).join('')}
        </div>
      </div>

      <!-- 세부 설정 -->
      <div class="card" style="margin-bottom:16px" id="ms-detail">
        <div class="sec-title">세부 설정
          ${cfg.presetId !== 'custom' ? '<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px">직접 설정 선택 시 수정 가능</span>' : ''}
        </div>
        <div class="form-grid">
          <div><label class="label">너비 (px)</label>
            <input type="number" id="ms-width" value="${cfg.width||480}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('width',+this.value)"></div>
          <div><label class="label">글꼴</label>
            <select id="ms-font" ${cfg.presetId!=='custom'?'disabled style="opacity:.6"':''}
              onchange="updateMsConfig('font',this.value)">
              ${['Noto Serif KR','Noto Sans KR','나눔명조','나눔고딕'].map(f=>
                `<option value="${f}" ${(cfg.font||'Noto Serif KR')===f?'selected':''}>${f}</option>`
              ).join('')}
            </select>
          </div>
          <div><label class="label">글자 크기 (px)</label>
            <input type="number" id="ms-size" value="${cfg.size||16}" min="12" max="24" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('size',+this.value)"></div>
          <div><label class="label">줄 간격</label>
            <input type="number" id="ms-line" value="${cfg.line||1.85}" min="1.4" max="2.5" step="0.05" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('line',+this.value)"></div>
          <div><label class="label">좌우 여백 (px)</label>
            <input type="number" id="ms-padH" value="${cfg.padH||24}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('padH',+this.value)"></div>
          <div><label class="label">상하 여백 (px)</label>
            <input type="number" id="ms-padV" value="${cfg.padV||28}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('padV',+this.value)"></div>
        </div>
      </div>

      <!-- 미리보기 -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div class="sec-title" style="margin:0">미리보기</div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="ms-ch-select" onchange="updateMsPreview()" style="width:140px;font-size:12px;padding:5px 8px">
              ${chapters.length===0
                ? '<option>화가 없습니다</option>'
                : chapters.map((c,i)=>`<option value="${i}">${esc(c.title)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="overflow-x:auto;padding:8px 0">
          <div id="ms-preview-wrap" style="margin:0 auto;transition:all .3s"></div>
        </div>
      </div>
    </div>`;

  updateMsPreview();
}

function selectMsPreset(id) {
  const p = getProject();
  const preset = MS_PRESETS.find(pr => pr.id === id) || MS_PRESETS[0];
  p.msConfig = { ...preset, presetId: id };
  autoSave();
  renderManuscript();
}

function updateMsConfig(key, val) {
  const p = getProject();
  if (!p.msConfig) p.msConfig = { presetId:'custom', ...MS_PRESETS[5] };
  p.msConfig[key] = val;
  autoSave();
  updateMsPreview();
}

function updateMsPreview() {
  const p = getProject();
  const cfg = getMsConfig(p);
  const chapters = p.chapters || [];
  const selEl = document.getElementById('ms-ch-select');
  const chIdx = selEl ? parseInt(selEl.value) || 0 : 0;
  const ch = chapters[chIdx];
  const wrap = document.getElementById('ms-preview-wrap');
  if (!wrap) return;

  const text = ch ? (ch.content || '(내용 없음)') : '(화를 먼저 추가하세요)';
  const title = ch ? ch.title : '';
  // 첫 500자만 미리보기
  const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
  const totalChars = text.length;
  const charsPerPage = (cfg.charsPerLine||24) * (cfg.linesPerPage||22);
  const totalPages = Math.ceil(totalChars / charsPerPage);

  wrap.style.width = (cfg.width || 480) + 'px';
  wrap.innerHTML = `
    <div class="ms-preview" style="width:${cfg.width||480}px;
      --ms-pad-h:${cfg.padH||24}px;--ms-pad-v:${cfg.padV||28}px;
      --ms-font:'${cfg.font||'Noto Serif KR'}';--ms-size:${cfg.size||16}px;
      --ms-line:${cfg.line||1.85};--ms-height:auto;">
      <div class="ms-header">
        <span>${esc(p.title||'제목 없음')}</span>
        <span>${esc(title)} · ${totalChars.toLocaleString()}자 · 약 ${totalPages}페이지</span>
      </div>
      <div class="ms-page">${esc(preview)}</div>
      ${text.length > 500 ? `<div style="text-align:center;padding:10px;font-size:12px;color:var(--muted);background:#fafafa;border-top:1px solid #eee">미리보기는 500자까지 표시됩니다</div>` : ''}
    </div>`;
}


// ═══════════════════════════════════════════════════════════
// 내보내기 기능
// ═══════════════════════════════════════════════════════════

// 클립보드 복사 (화 선택 or 전체)
function copyToClipboard(chId) {
  const p = getProject();
  let text = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    text = ch.title + '\n\n' + (ch.content||'');
  } else {
    text = (p.chapters||[]).map(c => c.title + '\n\n' + (c.content||'')).join('\n\n' + '─'.repeat(20) + '\n\n');
  }
  navigator.clipboard.writeText(text).then(() => {
    toast('클립보드에 복사됐어요! 📋');
  }).catch(() => {
    // 폴백: textarea 방식
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('클립보드에 복사됐어요! 📋');
  });
}

// TXT 저장
function exportTxt(chId) {
  const p = getProject();
  let text = '', filename = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    text = ch.title + '\n\n' + (ch.content||'');
    filename = (p.title||'작품') + '_' + ch.title + '.txt';
  } else {
    text = (p.chapters||[]).map(c => c.title + '\n\n' + (c.content||'')).join('\n\n' + '─'.repeat(30) + '\n\n');
    filename = (p.title||'작품') + '_전체.txt';
  }
  const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  toast('TXT 파일이 저장됐어요! 📄');
}

// DOCX 저장 (HTML → Word 변환 방식)
function exportDocx(chId) {
  const p = getProject();
  let chapters = [], filename = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    chapters = [ch];
    filename = (p.title||'작품') + '_' + ch.title + '.docx';
  } else {
    chapters = p.chapters || [];
    filename = (p.title||'작품') + '_전체.docx';
  }

  // Word XML 생성
  const paragraphs = chapters.map(ch => {
    const lines = (ch.content||'').split('\n');
    const titleXml = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escXml(ch.title)}</w:t></w:r></w:p>`;
    const contentXml = lines.map(line =>
      `<w:p><w:r><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`
    ).join('');
    return titleXml + contentXml;
  }).join('<w:p><w:r><w:t></w:t></w:r></w:p>');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escXml(p.title||'제목 없음')}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    ${paragraphs}
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // JSZip으로 패키징
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  script.onload = () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', wordRelsXml);
    zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        toast('DOCX 파일이 저장됐어요! 📝');
      });
  };
  script.onerror = () => {
    // JSZip 로드 실패 시 TXT로 폴백
    toast('DOCX 변환 실패 — TXT로 저장합니다');
    exportTxt(chId);
  };
  if (!window.JSZip) {
    document.head.appendChild(script);
  } else {
    script.onload();
  }
}

function escXml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// 내보내기 모달
function showExportModal() {
  const p = getProject();
  const chapters = p.chapters || [];
  if (chapters.length === 0) { toast('집필된 화가 없습니다.'); return; }

  showModal(`
    <div class="modal-title">📤 내보내기</div>
    <div style="margin-bottom:16px">
      <label class="label">화 선택</label>
      <select id="exp-ch" style="margin-bottom:4px">
        <option value="">전체 (${chapters.length}화)</option>
        ${chapters.map(c => `<option value="${c.id}">${esc(c.title)} (${(c.content||'').length.toLocaleString()}자)</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;gap:10px;margin-bottom:20px">
      <button class="btn btn-gold" onclick="copyToClipboard(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📋 클립보드 복사 (플랫폼 붙여넣기용)
      </button>
      <button class="btn btn-outline" onclick="exportTxt(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📄 TXT 파일로 저장
      </button>
      <button class="btn btn-outline" onclick="exportDocx(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📝 DOCX (Word) 파일로 저장
      </button>
      <button class="btn btn-outline" onclick="exportData()" style="justify-content:center;font-size:14px;padding:12px;border-color:var(--teal);color:var(--teal)">
        💾 JSON 백업 저장 (전체 데이터)
      </button>
    </div>
    <div style="font-size:11px;color:var(--muted);background:var(--cream);border-radius:8px;padding:10px 12px;line-height:1.7">
      💡 <b>클립보드 복사</b>: 카카오페이지·리디 등 웹 에디터에 바로 붙여넣기<br>
      💡 <b>TXT</b>: 메모장·기타 도구에서 열기<br>
      💡 <b>DOCX</b>: MS Word·한컴오피스에서 열기<br>
      💡 <b>JSON</b>: 앱 데이터 전체 백업 (캐릭터·플롯 포함)
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
    </div>
  `);
}


function showChExportMenu(chId) {
  const p = getProject();
  const ch = (p.chapters||[]).find(c => c.id === chId);
  if (!ch) return;
  showModal(`
    <div class="modal-title">📤 ${esc(ch.title)} 내보내기</div>
    <div style="display:grid;gap:10px;margin-bottom:20px">
      <button class="btn btn-gold" onclick="copyToClipboard('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📋 클립보드 복사
      </button>
      <button class="btn btn-outline" onclick="exportTxt('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📄 TXT 저장
      </button>
      <button class="btn btn-outline" onclick="exportDocx('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📝 DOCX 저장
      </button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════
// 커스텀 확인 모달 (태블릿 confirm 대체)
// ═══════════════════════════════════════════════════════════
function confirmDialog(msg, onOk) {
  document.querySelectorAll('.confirm-dialog-bg').forEach(el => el.remove());
  const bg = document.createElement('div');
  bg.className = 'confirm-dialog-bg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(24,18,10,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  bg.innerHTML = '<div style="background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:24px;width:300px;max-width:90vw;text-align:center"><div style="font-size:28px;margin-bottom:12px">🗑️</div><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">확인해 주세요</div><div class="cdg-message" style="font-size:13px;color:var(--muted);margin-bottom:20px"></div><div style="display:flex;gap:10px"><button class="cdg-cancel" style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:14px;font-weight:600;font-family:Noto Sans KR,sans-serif">취소</button><button class="cdg-ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--rust);color:#fff;cursor:pointer;font-size:14px;font-weight:700;font-family:Noto Sans KR,sans-serif">확인</button></div></div>';
  bg.querySelector('.cdg-message').textContent = msg;
  document.body.appendChild(bg);
  bg.querySelector('.cdg-cancel').addEventListener('click', () => bg.remove());
  bg.querySelector('.cdg-ok').addEventListener('click', () => { bg.remove(); onOk(); });
}


// ═══════════════════════════════════════════════════════════
// 분할 패널 (참고 패널)
// ═══════════════════════════════════════════════════════════
let splitTab = 'overview';
let splitOverviewEditing = false;

function splitElement(id) {
  const focusPanel = document.getElementById('focus-ref-panel');
  if (document.getElementById('focus-overlay')?.classList.contains('active') &&
      focusPanel?.style.display !== 'none') {
    return focusPanel.querySelector(`[id="${id}"]`);
  }
  return document.getElementById('split-panel')?.querySelector(`[id="${id}"]`) || null;
}

function toggleSplitPanel() {
  const panel = document.getElementById('split-panel');
  const btn   = document.getElementById('split-toggle-btn');
  if (!panel) return;
  const isMobile = window.innerWidth <= 768;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    if (!isMobile && window.innerWidth <= 1024) setChapterListCollapsed(true);
    if (!isMobile) initSplitPanelResize();
    if (btn) { btn.style.background='var(--gold-light)'; btn.style.borderColor='var(--gold)'; btn.style.color='var(--gold)'; btn.textContent='⊠ 참고'; }
    if (isMobile) {
      let bd = document.getElementById('split-panel-backdrop');
      if (!bd) {
        bd = document.createElement('div');
        bd.id = 'split-panel-backdrop';
        document.body.appendChild(bd);
      }
      bd.style.display = 'block';
      bd.onclick = () => toggleSplitPanel();

      // 스와이프로 닫기
      let _swipeStartX = null;
      let _swipeStartY = null;
      let _swipeDirection = null;
      panel._swipeStart = (e) => {
        if (e.target.closest('.split-panel-tabs, input, textarea, select')) return;
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swipeDirection = null;
      };
      panel._swipeMove = (e) => {
        if (_swipeStartX === null) return;
        const dx = e.touches[0].clientX - _swipeStartX;
        const dy = e.touches[0].clientY - _swipeStartY;
        if (!_swipeDirection && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
          _swipeDirection = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
        }
        if (_swipeDirection === 'horizontal' && dx > 0) panel.style.transform = `translateX(${dx}px)`;
      };
      panel._swipeEnd = (e) => {
        const dx = _swipeStartX === null ? 0 : (e.changedTouches[0]?.clientX ?? _swipeStartX) - _swipeStartX;
        const close = _swipeDirection === 'horizontal' && dx > 80;
        panel.style.transform = '';
        _swipeStartX = null;
        _swipeStartY = null;
        _swipeDirection = null;
        if (close) toggleSplitPanel();
      };
      panel.addEventListener('touchstart', panel._swipeStart, {passive:true});
      panel.addEventListener('touchmove',  panel._swipeMove,  {passive:true});
      panel.addEventListener('touchend',   panel._swipeEnd,   {passive:true});
      panel.addEventListener('touchcancel', panel._swipeEnd, {passive:true});
    }
    renderSplitContent();
    setTimeout(initAllDragScrolls, 50);
  } else {
    panel.classList.add('hidden');
    if (btn) { btn.style.background=''; btn.style.borderColor=''; btn.style.color=''; btn.textContent='⊞ 참고'; }
    const bd = document.getElementById('split-panel-backdrop');
    if (bd) bd.style.display = 'none';
    if (panel._swipeStart) panel.removeEventListener('touchstart', panel._swipeStart);
    if (panel._swipeMove) panel.removeEventListener('touchmove',  panel._swipeMove);
    if (panel._swipeEnd)  panel.removeEventListener('touchend',   panel._swipeEnd);
    if (panel._swipeEnd)  panel.removeEventListener('touchcancel', panel._swipeEnd);
    panel.style.transform = '';
  }
}

function switchSplitTab(tab) {
  splitTab = tab;
  document.querySelectorAll('.split-tab').forEach(b => {
    const match = b.getAttribute('onclick')?.includes("'" + tab + "'");
    b.classList.toggle('active', !!match);
  });
  renderSplitContent();
}

function renderSplitContent() {
  const el = document.getElementById('split-content');
  if (!el) return;
  const p = getProject();
  if (!p) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">작품을 먼저 열어주세요</div>'; return; }

  if (splitTab === 'overview') {
    if (splitOverviewEditing) {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:13px">작품 개요 편집</strong>
          <button class="btn btn-outline btn-sm" onclick="splitOverviewEditing=false;refreshSplitPanel()">완료</button>
        </div>
        <label class="label">작품 제목</label>
        <input value="${esc(p.title||'')}" oninput="updateProject('title',this.value)" style="width:100%;margin-bottom:10px">
        <label class="label">장르</label>
        <select onchange="updateProject('genre',this.value)" style="width:100%;margin-bottom:10px">${selOpts(GENRES,p.genre)}</select>
        <label class="label">연재 상태</label>
        <select onchange="updateProject('status',this.value)" style="width:100%;margin-bottom:10px">${selOpts(STATUSES,p.status)}</select>
        <label class="label">줄거리</label>
        <textarea rows="6" oninput="updateProject('synopsis',this.value)" style="width:100%;margin-bottom:10px">${esc(p.synopsis||'')}</textarea>
        <label class="label">작가 메모</label>
        <textarea rows="4" oninput="updateProject('memo',this.value)" style="width:100%">${esc(p.memo||'')}</textarea>`;
      return;
    }
    el.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:4px">작품 제목</div>
        <div style="font-size:16px;font-weight:700;color:var(--ink)">${esc(p.title||'제목 없음')}</div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:2px">장르</div>
          <div style="font-size:13px">${esc(p.genre||'-')}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:2px">상태</div>
          <div style="font-size:13px">${esc(p.status||'-')}</div>
        </div>
      </div>
      ${p.synopsis ? `
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">줄거리</div>
          <div style="font-size:13px;line-height:1.9;color:var(--ink);white-space:pre-wrap;padding:12px;background:var(--cream);border-radius:8px;border-left:3px solid var(--gold)">${esc(p.synopsis)}</div>
        </div>` : ''}
      ${p.memo ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">작가 메모</div>
          <div style="font-size:13px;line-height:1.8;color:var(--muted);white-space:pre-wrap">${esc(p.memo)}</div>
        </div>` : ''}
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-outline btn-sm" onclick="splitOverviewEditing=true;refreshSplitPanel()" style="font-size:11px">✏️ 이 패널에서 편집</button>
      </div>
    `;

  } else if (splitTab === 'characters') {
    const chars = p.characters || [];
    if (!chars.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">👤</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">등록된 캐릭터가 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showCharModal()">＋ 캐릭터 추가</button>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showCharModal()">＋ 추가</button>
      </div>
      ${chars.map((c,i) => {
        const bg = c.color || (c.group ? getGroupColor(c.group) : 'var(--white)');
        const isDark = document.documentElement.dataset.theme === 'dark';
        const hasCustomBg = !!(c.color || c.group);
        // 다크모드에서 밝은 배경 카드는 어두운 텍스트, 배경 없으면 var(--ink)
        const cardText = hasCustomBg ? '#18120a' : 'var(--ink)';
        const collapsed = splitCharCollapsed['c'+i] !== false ? true : false; // 기본 접힘
        return `
        <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;background:${bg};color:${cardText}">
          <div style="padding:8px 12px;background:rgba(0,0,0,.04);display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer"
            onclick="toggleSplitChar(${i})">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
                <span style="font-weight:700;font-size:14px;color:${cardText}">${esc(c.name)}</span>
                ${c.role?`<span style="font-size:10px;background:var(--gold-light);color:var(--gold);padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.role)}</span>`:''}
                ${c.gender?`<span style="font-size:10px;background:rgba(0,0,0,.08);color:${cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.gender)}</span>`:''}
                ${c.age?`<span style="font-size:10px;background:rgba(0,0,0,.08);color:${cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.age)}세</span>`:''}
                ${c.alive&&c.alive!=='생존'?`<span style="font-size:10px;background:${c.alive==='사망'?'var(--rust-light)':'rgba(0,0,0,.08)'};color:${c.alive==='사망'?'var(--rust)':cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.alive)}</span>`:''}
              </div>
              ${c.group?`<div style="font-size:10px;color:${cardText};opacity:.7">${esc(c.group)}</div>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;margin-left:6px">
              <button onclick="event.stopPropagation();showCharModal(${i})"
                style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--teal)">✏️</button>
              <span style="font-size:11px;color:var(--muted);transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg)">▾</span>
            </div>
          </div>
          ${collapsed ? '' : `
          <div style="padding:10px 12px;font-size:12px;line-height:1.8;border-top:1px solid rgba(0,0,0,.06)">
            ${c.honorific?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${c.honorific.split(',').map(h=>h.trim()).filter(Boolean).map(h=>`<span style="font-size:10px;background:var(--teal-light);color:var(--teal);padding:1px 7px;border-radius:20px;font-weight:600">${esc(h)}</span>`).join('')}</div>`:''}
            ${c.appearance?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">외모 </span>${esc(c.appearance)}</div>`:''}
            ${c.personality?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">성격 </span>${esc(c.personality)}</div>`:''}
            ${c.background?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">배경 </span>${esc(c.background)}</div>`:''}
            ${c.speech?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">특징/능력 </span>${esc(c.speech)}</div>`:''}
            ${c.goal?`<div><span style="color:var(--rust);font-weight:600">목표 </span>${esc(c.goal)}</div>`:''}
          </div>`}
        </div>`;
      }).join('')}`;

  } else if (splitTab === 'plot') {
    const arcs = p.arcs || [];
    if (!arcs.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">📐</div>
        <div style="color:var(--muted);font-size:13px">등록된 아크가 없어요</div>
      </div>`;
      return;
    }
    if (!window._spArcCol) window._spArcCol = {};
    el.innerHTML = arcs.map((a,ai) => {
      const col = window._spArcCol[ai] !== false ? true : false; // 기본 접힘
      return `
      <div style="margin-bottom:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;background:var(--gold-light);cursor:pointer;user-select:none"
          onclick="window._spArcCol[${ai}]=window._spArcCol[${ai}]===undefined?false:!window._spArcCol[${ai}];refreshSplitPanel()">
          <span style="font-weight:700;font-size:13px;color:var(--gold)">${esc(a.title)}</span>
          <span style="color:var(--gold);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${col?'-90':'0'}deg)">▼</span>
        </div>
        ${col ? '' : `<div style="padding:8px 10px">
          ${(a.scenes||[]).length === 0
            ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">장면 없음</div>`
            : (a.scenes||[]).map((s,si) => `
              <div style="padding:8px 10px;border-left:2px solid var(--border);margin-bottom:6px;background:var(--white);border-radius:0 8px 8px 0">
                <div style="font-size:12px;font-weight:600;margin-bottom:4px"><span style="color:var(--muted)">#${si+1}</span> ${esc(s.title)}</div>
                ${s.summary ? `<div style="font-size:11px;color:var(--muted);line-height:1.6;white-space:pre-wrap">${esc(s.summary)}</div>` : ''}
              </div>`).join('')}
        </div>`}
      </div>`;
    }).join('');

  } else if (splitTab === 'world') {
    const worlds = p.worldSettings || [];
    if (!worlds.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">🌍</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">세계관 설정이 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showWorldModal()">＋ 설정 추가</button>
      </div>`;
      return;
    }
    const groups = {};
    worlds.forEach((w,i) => {
      const cat = w.category || '기타';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({...w, _i:i});
    });
    // 장르 카테고리 순서대로 정렬
    const orderedCats = [...getWorldCats(p.genre), ...Object.keys(groups).filter(c => !getWorldCats(p.genre).includes(c))];
    const sortedGroups = orderedCats.filter(c => groups[c]).map(c => [c, groups[c]]);
    if (!window._spWorldCol) window._spWorldCol = {};
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showWorldModal()">＋ 추가</button>
      </div>
      ${sortedGroups.map(([cat, items]) => `
        <div style="margin-bottom:16px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-bottom:6px">${esc(cat)}</div>
          ${items.map(w => {
            const col = window._spWorldCol[w._i] !== false ? true : false; // 기본 접힘
            return `
            <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--white)">
              <div style="padding:8px 12px;background:var(--cream);display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none"
                onclick="window._spWorldCol[${w._i}]=window._spWorldCol[${w._i}]===undefined?false:!window._spWorldCol[${w._i}];refreshSplitPanel()">
                <span style="font-weight:700;font-size:13px">${esc(w.title)}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="color:var(--muted);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${col?'-90':'0'}deg)">▼</span>
                  <button onclick="event.stopPropagation();showWorldModal(${w._i})" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--teal)">✏️</button>
                </div>
              </div>
              ${col ? '' : `<div style="padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.7;white-space:pre-wrap">${esc(w.content||'')}</div>`}
            </div>`;
          }).join('')}
        </div>`).join('')}`;

  } else if (splitTab === 'relations') {
    const chars = p.characters || [];
    const rels = p.relations || [];
    if (chars.length < 2) {
      el.innerHTML = `<div style="text-align:center;padding:20px;font-size:13px;color:var(--muted)">
        관계를 만들려면 인물이 두 명 이상 필요해요.<br>
        <button class="btn btn-gold btn-sm" style="margin-top:10px" onclick="showCharModal()">＋ 인물 추가</button>
      </div>`;
      return;
    }
    const charOpts = chars.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    el.innerHTML = `
      <div style="display:grid;gap:7px;margin-bottom:16px;padding:10px;background:var(--cream);border-radius:8px">
        <strong style="font-size:12px">관계 추가</strong>
        <select id="split-rel-from" aria-label="인물 A"><option value="">인물 A 선택</option>${charOpts}</select>
        <input id="split-rel-type" aria-label="관계 유형" placeholder="관계 유형 (예: 동료, 라이벌)">
        <select id="split-rel-to" aria-label="인물 B"><option value="">인물 B 선택</option>${charOpts}</select>
        <button class="btn btn-gold btn-sm" onclick="addSplitRelation()">＋ 관계 추가</button>
      </div>
      <strong style="font-size:12px">관계 목록 (${rels.length})</strong>
      ${rels.length ? rels.map((r,i) => `
        <div style="display:flex;align-items:center;gap:5px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="font-weight:600">${esc(r.from)}</span>
          <span style="color:var(--teal)">${esc(r.type)}</span>
          <span style="font-weight:600">${esc(r.to)}</span>
          <button onclick="deleteSplitRelation(${i})" aria-label="${esc(r.from)}와 ${esc(r.to)}의 관계 삭제"
            style="margin-left:auto;background:none;border:none;color:var(--rust);cursor:pointer;font-size:16px">×</button>
        </div>`).join('') : '<div style="font-size:12px;color:var(--muted);padding:10px 0">등록된 관계가 없어요</div>'}
    `;

  } else if (splitTab === 'family') {
    const families = p.families || [];
    if (!families.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">🏰</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">등록된 가문 및 집단이 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showFamilyModal()">＋ 추가</button>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showFamilyModal()">＋ 추가</button>
      </div>
      ${families.map((f, fi) => {
        const collapsed = splitFamilyCollapsed['f'+fi];
        return `
        <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;border-left:3px solid ${f.color||'var(--gold)'}">
          <div style="padding:8px 12px;background:var(--cream);display:flex;justify-content:space-between;align-items:center;cursor:pointer"
            onclick="toggleSplitFamily(${fi})">
            <div>
              <span style="font-weight:700;font-size:13px">${esc(f.name)}</span>
              <span style="font-size:10px;background:var(--teal-light);color:var(--teal);padding:1px 6px;border-radius:10px;margin-left:4px">${({'family':'가문','guild':'길드','knight':'기사단','crime_f':'범죄조직','religion':'종교','academic':'학술','politics':'정치','corp':'기업','school':'학교','crime_m':'범죄조직','media':'미디어','military':'군사','politics_m':'정치','korean':'한국풍','chinese':'중국풍','japanese':'일본풍','other':'기타'}[f.groupType||'family']||'가문')}</span>
              ${f.rank?`<span style="font-size:10px;color:var(--muted);margin-left:4px">${esc(f.rank)}</span>`:''}
              <span style="font-size:10px;color:var(--muted);margin-left:6px">${Object.values(f.groups||{}).reduce((a,g)=>a+(g||[]).length,0)}명</span>
            </div>
            <span style="font-size:11px;color:var(--muted);transform:rotate(${collapsed?'-90':'0'}deg);display:inline-block;transition:transform .2s">▾</span>
          </div>
          ${collapsed ? '' : `
          <div style="padding:8px 12px">
            ${f.description?`<div style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.6">${esc(f.description)}</div>`:''}
            ${(()=>{
              const groups = f.groups || {};
              const allMembers = Object.entries(groups).flatMap(([tab, members]) =>
                (members||[]).map(m => ({...m, _tab: tab}))
              );
              if (!allMembers.length) return '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">구성원 없음</div>';
              return Object.entries(groups).filter(([,members])=>(members||[]).length>0).map(([tab, members])=>`
                <div style="margin-bottom:6px">
                  <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:4px">${esc(tab)}</div>
                  ${members.map(m=>`
                    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
                      <span style="font-weight:600">${esc(m.name)}</span>
                      ${m.relation?`<span style="color:var(--muted)">${esc(m.relation)}</span>`:''}
                      ${m.note?`<span style="color:var(--teal);font-size:11px">${esc(m.note)}</span>`:''}
                    </div>`).join('')}
                </div>`).join('');
            })()}
          </div>`}
        </div>`;
      }).join('')}`;

  } else if (splitTab === 'items') {
    const items = p.items || [];
    if (!window._splitItemCollapsed) window._splitItemCollapsed = {};
    if (!window._splitItemQ) window._splitItemQ = '';
    const sq = window._splitItemQ.trim().toLowerCase();
    const filtered = sq ? items.filter(it => it.name.toLowerCase().includes(sq) || (it.desc||'').toLowerCase().includes(sq)) : items;
    const usedCats = ITEM_CATS.filter(c => filtered.some(it => it.cat === c));
    const catGroups = usedCats.map(c => ({ cat: c, list: filtered.filter(it => it.cat === c) }));
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<span style="font-size:12px;font-weight:700;color:var(--muted)">아이템 (' + items.length + ')</span>'
      + '<button onclick="showItemModal();refreshSplitPanel()" class="btn btn-gold btn-sm">＋ 추가</button>'
      + '</div>'
      + '<div style="position:relative;margin-bottom:10px">'
      + '<input id="split-item-search" placeholder="아이템 검색..." value="' + esc(window._splitItemQ) + '" '
      + 'style="width:100%;padding:6px 28px 6px 10px;font-size:12px;border:1.5px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);font-family:\'Noto Sans KR\',sans-serif;outline:none">'
      + '<button id="split-item-clear" onclick="window._splitItemQ=\'\';splitElement(\'split-item-search\').value=\'\';refreshSplitItems()" '
      + 'style="display:' + (sq?'block':'none') + ';position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>'
      + '</div>'
      + '<div id="split-items-inner"></div>';
    refreshSplitItems();

  } else if (splitTab === 'memo') {
    if (!window._spMemoQ) window._spMemoQ = '';
    const mq = window._spMemoQ.trim().toLowerCase();
    const allMemos = getChapterMemos();
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:var(--muted)">메모 (${allMemos.length})</span>
        <button onclick="addChapterMemo()" class="btn btn-gold btn-sm">＋ 추가</button>
      </div>
      <div style="position:relative;margin-bottom:10px">
        <input id="split-memo-search" placeholder="메모 검색..." value="${esc(window._spMemoQ)}"
          style="width:100%;padding:6px 28px 6px 10px;font-size:12px;border:1.5px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',sans-serif;outline:none">
        <button id="split-memo-clear" onclick="window._spMemoQ='';splitElement('split-memo-search').value='';refreshSplitMemo()"
          style="display:${mq?'block':'none'};position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>
      </div>
      <div id="split-memo-inner"></div>`;
    refreshSplitMemo();
  } else if (splitTab === 'glossary') {
    el.innerHTML = renderSplitGlossary();
  }
}

function addSplitRelation() {
  const from = splitElement('split-rel-from')?.value || '';
  const to = splitElement('split-rel-to')?.value || '';
  const type = splitElement('split-rel-type')?.value.trim() || '';
  if (!from || !to || !type) { toast('인물과 관계 유형을 모두 입력해주세요.'); return; }
  if (from === to) { toast('같은 인물은 선택할 수 없습니다.'); return; }
  const p = getProject();
  if (!p) return;
  if (!p.relations) p.relations = [];
  p.relations.push({ from, to, type });
  autoSave();
  refreshSplitPanel();
}

function deleteSplitRelation(index) {
  confirmDialog('이 관계를 삭제할까요?', () => {
    const p = getProject();
    if (!p?.relations?.[index]) return;
    p.relations.splice(index, 1);
    autoSave();
    refreshSplitPanel();
  });
}


function renderSplitGlossary() {
  const p = getProject();
  const list = p.glossary || [];
  if (!window._glossaryPanelQ) window._glossaryPanelQ = '';
  if (!window._glossaryPanelCat) window._glossaryPanelCat = '전체';
  if (!window._glossaryPanelOpen) window._glossaryPanelOpen = {};
  if (!window._glossaryPanelEdit) window._glossaryPanelEdit = {};
  const q = window._glossaryPanelQ.trim().toLowerCase();
  const cat = window._glossaryPanelCat;

  const filtered = list.filter(g =>
    (cat === '전체' || g.cat === cat) &&
    (!q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
  );

  const catBtns = ['전체', ...GLOSSARY_CATS].map(c =>
    '<button onclick="window._glossaryPanelCat=\'' + c + '\';refreshSplitGlossary()" '
    + 'style="padding:2px 8px;border-radius:12px;border:1px solid '
    + (cat===c ? 'var(--gold)' : 'var(--border)') + ';background:'
    + (cat===c ? 'var(--gold)' : 'transparent') + ';color:'
    + (cat===c ? '#fff' : 'var(--muted)') + ';font-size:11px;cursor:pointer;white-space:nowrap">' + c + '</button>'
  ).join('');

  const cards = filtered.length === 0
    ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">'
      + (list.length === 0 ? '용어가 없어요' : '검색 결과 없음') + '</div>'
    : filtered.map(g => {
        const idx = list.indexOf(g);
        const open = !!window._glossaryPanelOpen[idx];
        const edit = !!window._glossaryPanelEdit[idx];

        // 접힌 상태
        if (!open) {
          return '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--cream)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=true;window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossary()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▾</span>'
            + '</div>'
            + '</div>';
        }

        // 펼쳐진 읽기 모드
        if (!edit) {
          return '<div style="border:1.5px solid var(--gold);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--gold-light)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=false;refreshSplitGlossary()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▴</span>'
            + '</div>'
            + '<div style="padding:10px 12px;background:var(--paper)">'
            + (g.desc ? '<div style="font-size:12px;color:var(--ink);line-height:1.7;white-space:pre-wrap;margin-bottom:6px">' + esc(g.desc) + '</div>' : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">설명 없음</div>')
            + (g.related ? '<div style="font-size:11px;color:var(--teal)">🔗 ' + esc(g.related) + '</div>' : '')
            + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
            + '<button onclick="event.stopPropagation();window._glossaryPanelEdit[' + idx + ']=true;refreshSplitGlossary()" '
            + 'class="btn btn-outline btn-sm" style="font-size:11px">✏️ 수정</button>'
            + '<button onclick="event.stopPropagation();deleteSplitGlossary(' + idx + ')" '
            + 'class="btn btn-sm" style="font-size:11px;color:var(--rust);border:1px solid rgba(181,69,27,.25);background:none">🗑️ 삭제</button>'
            + '</div>'
            + '</div>'
            + '</div>';
        }

        // 편집 모드
        return '<div style="border:1.5px solid var(--teal);border-radius:8px;margin-bottom:6px;overflow:hidden">'
          + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--teal-light)">'
          + '<span style="flex:1;font-size:12px;font-weight:700;color:var(--teal)">✏️ 수정 중</span>'
          + '<button onclick="window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossary()" '
          + 'style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0">×</button>'
          + '</div>'
          + '<div style="padding:10px;background:var(--paper);display:flex;flex-direction:column;gap:6px">'
          + '<div style="display:flex;gap:6px">'
          + '<input id="sg-term-' + idx + '" value="' + esc(g.term) + '" placeholder="용어명" '
          + 'style="flex:1;font-size:12px;padding:5px 8px;font-weight:700">'
          + '<select id="sg-cat-' + idx + '" style="font-size:11px;padding:5px 6px;width:80px">'
          + GLOSSARY_CATS.map(c => '<option value="' + c + '"' + (g.cat===c?' selected':'') + '>' + c + '</option>').join('')
          + '</select>'
          + '</div>'
          + '<input id="sg-alias-' + idx + '" value="' + esc(g.alias||'') + '" placeholder="별칭 (선택)" '
          + 'style="font-size:11px;padding:5px 8px;color:var(--muted)">'
          + '<textarea id="sg-desc-' + idx + '" rows="3" placeholder="설명" '
          + 'style="font-size:12px;padding:6px 8px;line-height:1.6;resize:vertical">' + esc(g.desc||'') + '</textarea>'
          + '<input id="sg-related-' + idx + '" value="' + esc(g.related||'') + '" placeholder="관련 용어" '
          + 'style="font-size:11px;padding:5px 8px;color:var(--teal)">'
          + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">'
          + '<button onclick="saveSplitGlossary(' + idx + ')" class="btn btn-gold btn-sm" style="font-size:11px">저장</button>'
          + '</div>'
          + '</div>'
          + '</div>';
      }).join('');

  return '<div style="padding:4px 0" id="split-glossary-wrap">'
    + '<div style="display:flex;gap:6px;margin-bottom:8px">'
    + '<div style="position:relative;flex:1">'
    + '<input id="split-glossary-search" placeholder="용어 검색..." value="' + esc(window._glossaryPanelQ) + '" '
    + 'style="width:100%;padding:6px 28px 6px 10px;font-size:12px">'
    + '<button id="split-glossary-clear" onclick="window._glossaryPanelQ=\'\';splitElement(\'split-glossary-search\').value=\'\';refreshSplitGlossaryCards()" '
    + 'style="display:' + (window._glossaryPanelQ ? 'block' : 'none') + ';position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>'
    + '</div>'
    + '<button class="btn btn-gold btn-sm" onclick="showGlossaryModal()">＋</button>'
    + '</div>'
    + '<div id="split-glossary-cats" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">' + catBtns + '</div>'
    + '<div id="split-glossary-cards">' + cards + '</div>'
    + '</div>';
}

function refreshSplitGlossaryCards() {
  // 카드만 업데이트 (input 포커스 유지)
  const p = getProject();
  const list = p.glossary || [];
  const q = (window._glossaryPanelQ || '').trim().toLowerCase();
  const cat = window._glossaryPanelCat || '전체';

  const filtered = list.filter(g =>
    (cat === '전체' || g.cat === cat) &&
    (!q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
  );

  const cards = filtered.length === 0
    ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">'
      + (list.length === 0 ? '용어가 없어요' : '검색 결과 없음') + '</div>'
    : filtered.map(g => {
        const idx = list.indexOf(g);
        const open = !!window._glossaryPanelOpen[idx];
        const edit = !!window._glossaryPanelEdit[idx];
        if (!open) {
          return '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--cream)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=true;window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossaryCards()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▾</span>'
            + '</div></div>';
        }
        if (!edit) {
          return '<div style="border:1.5px solid var(--gold);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--gold-light)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=false;refreshSplitGlossaryCards()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▴</span>'
            + '</div>'
            + '<div style="padding:10px 12px;background:var(--paper)">'
            + (g.desc ? '<div style="font-size:12px;color:var(--ink);line-height:1.7;white-space:pre-wrap;margin-bottom:6px">' + esc(g.desc) + '</div>' : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">설명 없음</div>')
            + (g.related ? '<div style="font-size:11px;color:var(--teal)">🔗 ' + esc(g.related) + '</div>' : '')
            + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
            + '<button onclick="event.stopPropagation();window._glossaryPanelEdit[' + idx + ']=true;refreshSplitGlossaryCards()" class="btn btn-outline btn-sm" style="font-size:11px">✏️ 수정</button>'
            + '<button onclick="event.stopPropagation();deleteSplitGlossary(' + idx + ')" class="btn btn-sm" style="font-size:11px;color:var(--rust);border:1px solid rgba(181,69,27,.25);background:none">🗑️ 삭제</button>'
            + '</div></div></div>';
        }
        return '<div style="border:1.5px solid var(--teal);border-radius:8px;margin-bottom:6px;overflow:hidden">'
          + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--teal-light)">'
          + '<span style="flex:1;font-size:12px;font-weight:700;color:var(--teal)">✏️ 수정 중</span>'
          + '<button onclick="window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossaryCards()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0">×</button>'
          + '</div>'
          + '<div style="padding:10px;background:var(--paper);display:flex;flex-direction:column;gap:6px">'
          + '<div style="display:flex;gap:6px">'
          + '<input id="sg-term-' + idx + '" value="' + esc(g.term) + '" placeholder="용어명" style="flex:1;font-size:12px;padding:5px 8px;font-weight:700">'
          + '<select id="sg-cat-' + idx + '" style="font-size:11px;padding:5px 6px;width:80px">'
          + GLOSSARY_CATS.map(c => '<option value="' + c + '"' + (g.cat===c?' selected':'') + '>' + c + '</option>').join('')
          + '</select></div>'
          + '<input id="sg-alias-' + idx + '" value="' + esc(g.alias||'') + '" placeholder="별칭 (선택)" style="font-size:11px;padding:5px 8px;color:var(--muted)">'
          + '<textarea id="sg-desc-' + idx + '" rows="3" placeholder="설명" style="font-size:12px;padding:6px 8px;line-height:1.6;resize:vertical">' + esc(g.desc||'') + '</textarea>'
          + '<input id="sg-related-' + idx + '" value="' + esc(g.related||'') + '" placeholder="관련 용어" style="font-size:11px;padding:5px 8px;color:var(--teal)">'
          + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">'
          + '<button onclick="saveSplitGlossary(' + idx + ')" class="btn btn-gold btn-sm" style="font-size:11px">저장</button>'
          + '</div></div></div>';
      }).join('');

  const cardsEl = splitElement('split-glossary-cards');
  if (cardsEl) cardsEl.innerHTML = cards;

  // × 버튼 표시/숨김
  const clr = splitElement('split-glossary-clear');
  if (clr) clr.style.display = q ? 'block' : 'none';

  // 카테고리 버튼 업데이트
  const catsEl = splitElement('split-glossary-cats');
  if (catsEl) {
    const catBtns = ['전체', ...GLOSSARY_CATS].map(c =>
      '<button onclick="window._glossaryPanelCat=\'' + c + '\';refreshSplitGlossaryCards()" '
      + 'style="padding:2px 8px;border-radius:12px;border:1px solid '
      + (cat===c ? 'var(--gold)' : 'var(--border)') + ';background:'
      + (cat===c ? 'var(--gold)' : 'transparent') + ';color:'
      + (cat===c ? '#fff' : 'var(--muted)') + ';font-size:11px;cursor:pointer;white-space:nowrap">' + c + '</button>'
    ).join('');
    catsEl.innerHTML = catBtns;
  }
}

function refreshSplitGlossary() {
  // split-glossary-wrap이 있으면 카드만 업데이트, 없으면 전체 재렌더
  if (splitElement('split-glossary-cards')) {
    refreshSplitGlossaryCards();
  } else {
    if (document.getElementById('focus-overlay')?.classList.contains('active')) {
      if (_focusRefTab === 'glossary') focusRefTab('glossary');
    } else {
      const el = document.getElementById('split-content');
      if (el && splitTab === 'glossary') el.innerHTML = renderSplitGlossary();
    }
  }
}

function saveSplitGlossary(idx) {
  const p = getProject();
  if (!p || !p.glossary || !p.glossary[idx]) return;
  const term = splitElement('sg-term-' + idx)?.value.trim();
  if (!term) { toast('용어명을 입력해주세요.'); return; }
  p.glossary[idx] = {
    ...p.glossary[idx],
    term,
    cat: splitElement('sg-cat-' + idx)?.value || p.glossary[idx].cat,
    alias: splitElement('sg-alias-' + idx)?.value.trim() || '',
    desc: splitElement('sg-desc-' + idx)?.value.trim() || '',
    related: splitElement('sg-related-' + idx)?.value.trim() || '',
  };
  window._glossaryPanelEdit[idx] = false;
  autoSave(); updateBadges(); refreshSplitGlossary();
  if (state.activeTab === 'glossary') renderGlossary();
  toast('수정했어요.');
}

function updateSplitGlossary(idx, key, val) {
  const p = getProject();
  if (!p || !p.glossary || !p.glossary[idx]) return;
  p.glossary[idx][key] = val;
  clearTimeout(window._glossarySaveTimer);
  window._glossarySaveTimer = setTimeout(() => { autoSave(); updateBadges(); }, 600);
}

function deleteSplitGlossary(idx) {
  confirmDialog('이 용어를 삭제합니다.', () => {
    getProject().glossary.splice(idx, 1);
    delete window._glossaryPanelOpen[idx];
    autoSave(); updateBadges(); refreshSplitGlossary();
    toast('삭제했어요.');
  });
}

// 참고 패널에서 작품 기본 정보 수정
function updateSplitField(key, val) {
  const p = getProject();
  if (!p) return;
  p[key] = val;
  autoSave();
}

// 참고 패널에서 메모 수정
function updateSplitMemo(idx, val) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos[idx].text = val;
  autoSave();
}

function updateSplitMemoTitle(idx, val) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos[idx].title = val;
  autoSave();
}

function deleteSplitMemo(idx) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos.splice(idx, 1);
  autoSave();
  renderSplitContent();
}


let chapterListCollapsed = false;

function applyChapterListCollapsed() {
  const list = document.getElementById('chapter-list');
  const btn  = document.getElementById('chapter-collapse-btn');
  if (!list || !btn) return;
  list.classList.toggle('collapsed', chapterListCollapsed);
  btn.textContent = chapterListCollapsed ? '▶' : '◀';
  btn.setAttribute('aria-label', chapterListCollapsed ? '회차 목록 펼치기' : '회차 목록 접기');
}

function setChapterListCollapsed(collapsed) {
  chapterListCollapsed = collapsed;
  applyChapterListCollapsed();
  const panel = document.getElementById('split-panel');
  if (panel && !panel.classList.contains('hidden')) setSplitPanelWidth(panel.getBoundingClientRect().width);
}

function toggleChapterList() {
  setChapterListCollapsed(!chapterListCollapsed);
}


// ═══════════════════════════════════════════════════════════
// 집필기 전용 메모 (사이드바 메모장과 분리)
// ═══════════════════════════════════════════════════════════
function getChapterMemos() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  return p.memos;
}

function addChapterMemo() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  p.memos.unshift({ id: uid(), title: '', content: '', color: '#fff8e1', updatedAt: new Date().toISOString() });
  autoSave();
  refreshSplitPanel();
}

function deleteChapterMemo(idx) {
  getChapterMemos().splice(idx, 1);
  autoSave();
  refreshSplitPanel();
}

function updateChapterMemoText(idx, val) {
  const m = getChapterMemos()[idx];
  if (m) { m.content = val; m.updatedAt = new Date().toISOString(); autoSave(); }
}

function updateChapterMemoTitle(idx, val) {
  const m = getChapterMemos()[idx];
  if (m) { m.title = val; m.updatedAt = new Date().toISOString(); autoSave(); }
}


// ═══════════════════════════════════════════════════════════
// 집중 모드 (Focus Mode)
// ═══════════════════════════════════════════════════════════
let focusChapterId = null;

function toggleFocusChapterMemo() {
  const body  = document.getElementById('focus-ch-memo-body');
  const arrow = document.getElementById('focus-ch-memo-arrow');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  if (isHidden) document.getElementById('focus-ch-memo-input')?.focus();
}

function toggleFocusRef() {
  const panel = document.getElementById('focus-ref-panel');
  const btn = document.getElementById('focus-ref-btn');
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'flex' : 'none';
  panel.style.flexDirection = 'column';
  if (btn) {
    btn.style.background = isHidden ? 'var(--gold-light)' : '';
    btn.style.borderColor = isHidden ? 'var(--gold)' : '';
    btn.style.color = isHidden ? 'var(--gold)' : '';
  }
  if (isHidden) focusRefTab('overview');
}

let _focusRefTab = 'overview';
function focusRefTab(tab) {
  _focusRefTab = tab;
  const tabLabelMap = {
    overview:'개요', world:'세계관', plot:'플롯',
    characters:'인물', relations:'관계도', family:'가문', glossary:'용어', items:'아이템', memo:'메모'
  };
  const label = tabLabelMap[tab];
  document.querySelectorAll('#focus-ref-panel .split-tab').forEach(b => {
    b.classList.toggle('active', !!label && b.textContent.trim().includes(label));
  });

  const el = document.getElementById('focus-ref-content');
  if (!el) return;

  const prevTab = splitTab;
  splitTab = tab;

  // split-content가 있으면 임시로 id 변경, 없으면 그냥 진행
  const prevEl = document.getElementById('split-content');
  if (prevEl) prevEl.id = '__split_bak__';
  el.id = 'split-content';

  try {
    renderSplitContent();
  } catch(err) {
    console.warn('focusRefTab render error:', err);
  } finally {
    el.id = 'focus-ref-content';
    if (prevEl) prevEl.id = 'split-content';
    splitTab = prevTab;
  }
}

function enterFocusMode() {
  const ta = document.getElementById('prose-editor');
  if (!ta) { toast('집필기에서만 사용할 수 있어요.'); return; }

  // 현재 화 ID 가져오기
  focusChapterId = activeChapterId;
  const p = getProject();
  const ch = (p?.chapters||[]).find(c => c.id === focusChapterId);
  if (!ch) return;

  // 집중 모드 화별 메모 초기화
  const fTitle = document.getElementById('focus-ch-memo-title');
  const fInput = document.getElementById('focus-ch-memo-input');
  const fBody  = document.getElementById('focus-ch-memo-body');
  const fArrow = document.getElementById('focus-ch-memo-arrow');
  if (fTitle) fTitle.textContent = ch.title;
  if (fInput) {
    fInput.value = ch.memo || '';
    fInput.oninput = () => {
      const p2 = getProject();
      const ch2 = (p2?.chapters||[]).find(c => c.id === focusChapterId);
      if (ch2) { ch2.memo = fInput.value; autoSave(); }
    };
  }
  if (fBody)  fBody.style.display  = ch.memo ? 'block' : 'none';
  if (fArrow) fArrow.style.transform = ch.memo ? 'rotate(0deg)' : 'rotate(-90deg)';

  // 집중 모드 에디터에 내용 복사
  const focusEditor = document.getElementById('focus-editor');
  focusEditor.value = ch.content || '';

  // 글자 수 업데이트
  updateFocusWordCount();

  // 폰트 크기 표시 동기화
  const sizeDisplay = document.getElementById('focus-font-size');
  if (sizeDisplay) sizeDisplay.textContent = editorFontSize + 'px';
  focusEditor.style.fontSize = editorFontSize + 'px';

  // 집중 모드 단축키 바 초기화
  const focusShortcutBar = document.getElementById('focus-shortcut-bar');
  if (focusShortcutBar) {
    focusShortcutBar.innerHTML = '';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px;color:var(--muted);font-weight:600;flex-shrink:0';
    label.textContent = '단축키';
    focusShortcutBar.appendChild(label);
    Object.entries(SHORTCUT_SYMBOLS).forEach(([k, sym]) => {
      if (!sym) return;
      const btn = document.createElement('button');
      btn.className = 'sym-btn';
      btn.style.cssText = 'font-size:13px;min-width:32px;height:32px;padding:0 6px';
      btn.title = `^${k}`;
      btn.textContent = sym;
      btn.onclick = () => {
        const fe = document.getElementById('focus-editor');
        if (!fe) return;
        const s = fe.selectionStart, e = fe.selectionEnd;
        const selected = fe.value.slice(s, e);
        const isPair = sym.length === 2;
        if (isPair) {
          const inner = selected || '';
          fe.value = fe.value.slice(0,s) + sym[0] + inner + sym[1] + fe.value.slice(e);
          fe.selectionStart = fe.selectionEnd = inner ? s+1 : s+1;
          if (inner) { fe.selectionStart = s+1; fe.selectionEnd = s+1+inner.length; }
        } else {
          fe.value = fe.value.slice(0,s) + sym + fe.value.slice(e);
          fe.selectionStart = fe.selectionEnd = s + sym.length;
        }
        fe.focus();
        fe.dispatchEvent(new Event('input', {bubbles:true}));
      };
      focusShortcutBar.appendChild(btn);
    });
  }

  // 오버레이 열기
  const overlay = document.getElementById('focus-overlay');
  overlay.classList.add('active');
  focusEditor.focus();

  // 전체화면 요청
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  // 입력 이벤트
  focusEditor.oninput = event => {
    updateFocusWordCount();
    // 원본에도 즉시 반영
    const p2 = getProject();
    const ch2 = (p2?.chapters||[]).find(c => c.id === focusChapterId);
    if (ch2) {
      const diff = writtenCharDelta(ch2.content || '', focusEditor.value, event);
      ch2.content = focusEditor.value;
      if (diff > 0) { recordDailyWriting(diff); onTypingKey(); }
      autoSave();
    }
  };
}

function exitFocusMode() {
  const overlay = document.getElementById('focus-overlay');
  overlay.classList.remove('active');

  // 전체화면 해제
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // 집필기 에디터도 동기화
  const mainEditor = document.getElementById('prose-editor');
  const focusEditor = document.getElementById('focus-editor');
  if (mainEditor && focusEditor) {
    mainEditor.value = focusEditor.value;
    // 글자 수 업데이트
    const wc = document.getElementById('wc-display');
    if (wc) wc.textContent = focusEditor.value.length.toLocaleString() + '자';
  }

  focusChapterId = null;
}

function updateFocusWordCount() {
  const fe = document.getElementById('focus-editor');
  const wc = document.getElementById('focus-wordcount');
  if (fe && wc) wc.textContent = (fe.value.length).toLocaleString() + '자';
}

// ESC로 나가기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('focus-overlay');
    if (overlay && overlay.classList.contains('active')) {
      exitFocusMode();
      return;
    }
  }
});



// 폰트 크기 변경 시 집중 모드도 동기화
const _origChangeFontSize = changeFontSize;
function changeFontSize(delta) {
  _origChangeFontSize(delta);
  const fe = document.getElementById('focus-editor');
  const fd = document.getElementById('focus-font-size');
  if (fe) fe.style.fontSize = editorFontSize + 'px';
  if (fd) fd.textContent = editorFontSize + 'px';
}


function cleanEmptyProjects() {
  const before = state.projects.length;
  state.projects = state.projects.filter(p =>
    (p.title && p.title.trim() && p.title !== '제목 없음') ||
    (p.chapters && p.chapters.some(c => c.content && c.content.trim())) ||
    (p.characters && p.characters.length > 0)
  );
  const removed = before - state.projects.length;
  if (removed > 0) {
    saveToStorage();
    renderHome();
    toast('🧹 빈 작품 ' + removed + '개를 정리했어요!');
  } else {
    toast('정리할 빈 작품이 없어요.');
  }
}


// 소속 그룹 접힘 상태
let charGroupCollapsed = {};

function toggleCharGroup(groupName, prefix) {
  const key = (prefix || 'grp_') + groupName;
  charGroupCollapsed[key] = !charGroupCollapsed[key];
  renderCharacters();
}

function moveCharCard(idx, dir) {
  const p = getProject();
  const chars = p.characters;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= chars.length) return;
  [chars[idx], chars[newIdx]] = [chars[newIdx], chars[idx]];
  autoSave();
  renderCharacters();
}

let _cDrag = null;

function initCharDrag() {
  document.querySelectorAll('.char-drag-handle').forEach(handle => {
    handle.addEventListener('mousedown', charMouseStart);
    handle.addEventListener('touchstart', charTouchStart, { passive: false });
  });
}

function charTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  charDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', charTouchMove, { passive: false });
  document.addEventListener('touchend', charTouchEnd, { once: true });
}

function charMouseStart(e) {
  charDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', charMouseMove);
  document.addEventListener('mouseup', charMouseEnd, { once: true });
}

function charDragInit(handle, x, y) {
  const charIdx = +handle.dataset.charIdx;
  const card = handle.closest('.char-card');
  const rect = card.getBoundingClientRect();

  // 고스트
  const name = card.querySelector('.font-serif')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:40px;z-index:9999;pointer-events:none;
    box-shadow:0 6px 24px rgba(0,0,0,.18);border-radius:10px;
    background:var(--gold-light);border:2px solid var(--gold);
    display:flex;align-items:center;padding:0 16px;gap:10px;opacity:.92;transition:none`;
  ghost.innerHTML = `<span style="font-size:18px;color:var(--gold)">⠿</span>
    <span style="font-weight:700;font-size:14px;color:var(--ink)">${name}</span>`;
  document.body.appendChild(ghost);

  card.style.opacity = '0.3';

  _cDrag = {
    charIdx,
    card,
    ghost,
    offsetX: x - rect.left,
    offsetY: y - rect.top,
    dropTarget: null,   // { beforeCardEl } or { roleEl }
  };
}

function charTouchMove(e) {
  e.preventDefault();
  if (!_cDrag) return;
  charDragMove(e.touches[0].clientX, e.touches[0].clientY);
}
function charMouseMove(e) {
  if (!_cDrag) return;
  charDragMove(e.clientX, e.clientY);
}

function charDragMove(cx, cy) {
  const { ghost, offsetX, offsetY, card } = _cDrag;

  // 고스트 자유 이동
  ghost.style.left = (cx - offsetX) + 'px';
  ghost.style.top  = (cy - offsetY) + 'px';

  // 이전 인디케이터 제거
  document.querySelectorAll('.char-drop-line').forEach(el => el.remove());
  document.querySelectorAll('.char-card').forEach(c => c.style.boxShadow = '');
  document.querySelectorAll('.char-group-folder').forEach(f => f.style.outline = '');

  // 전체 char-card 중 커서 위치 기준 삽입 위치 결정
  const allCards = [...document.querySelectorAll('.char-card')];
  let bestCard = null, bestBefore = true;

  for (const c of allCards) {
    if (c === card) continue;
    const r = c.getBoundingClientRect();
    if (cy >= r.top - 16 && cy <= r.bottom + 16) {
      bestCard = c;
      bestBefore = cy < r.top + r.height / 2;
      break;
    }
  }

  if (bestCard) {
    // 삽입선 표시
    const line = document.createElement('div');
    line.className = 'char-drop-line';
    line.style.cssText = 'position:fixed;left:0;right:0;height:3px;background:var(--gold);z-index:9998;pointer-events:none;border-radius:2px';
    const r = bestCard.getBoundingClientRect();
    line.style.top = (bestBefore ? r.top - 2 : r.bottom - 1) + 'px';
    line.style.left = r.left + 'px';
    line.style.width = r.width + 'px';
    document.body.appendChild(line);
    _cDrag.dropTarget = { cardEl: bestCard, before: bestBefore };
  } else {
    // 카드 사이가 아닌 경우 — 폴더 헤더 위에 있는지 확인
    const folders = [...document.querySelectorAll('.char-group-folder')];
    for (const folder of folders) {
      const r = folder.getBoundingClientRect();
      if (cy >= r.top && cy <= r.bottom) {
        folder.style.outline = '2px solid var(--gold)';
        _cDrag.dropTarget = { folderEl: folder };
        break;
      }
    }
    if (!_cDrag.dropTarget || !_cDrag.dropTarget.folderEl) {
      _cDrag.dropTarget = null;
    }
  }
}

function charTouchEnd() {
  document.removeEventListener('touchmove', charTouchMove);
  charDragCommit();
}
function charMouseEnd() {
  document.removeEventListener('mousemove', charMouseMove);
  charDragCommit();
}

function charDragCommit() {
  if (!_cDrag) return;
  const { charIdx, card, ghost, dropTarget } = _cDrag;
  _cDrag = null;

  // 정리
  ghost.remove();
  document.querySelectorAll('.char-drop-line').forEach(el => el.remove());
  document.querySelectorAll('.char-card').forEach(c => c.style.boxShadow = '');
  document.querySelectorAll('.char-group-folder').forEach(f => f.style.outline = '');
  if (card) card.style.opacity = '';

  if (!dropTarget) return;

  const p = getProject();
  const chars = p.characters;
  const item = chars[charIdx];

  if (dropTarget.cardEl) {
    // 다른 카드 앞/뒤에 삽입
    const targetCharIdx = +dropTarget.cardEl.dataset.charIdx;
    const targetRole = dropTarget.cardEl.dataset.charRole || item.role;

    // 역할 변경 (카테고리 간 이동)
    item.role = targetRole;

    // 배열에서 꺼내서 삽입
    chars.splice(charIdx, 1);
    // splice 후 인덱스 보정
    const adjustedTarget = targetCharIdx > charIdx ? targetCharIdx - 1 : targetCharIdx;
    const insertAt = dropTarget.before ? adjustedTarget : adjustedTarget + 1;
    chars.splice(Math.max(0, Math.min(insertAt, chars.length)), 0, item);

  } else if (dropTarget.folderEl) {
    // 폴더 헤더에 드롭 → 해당 역할의 마지막에 추가
    const newRole = dropTarget.folderEl.dataset.role;
    if (newRole && newRole !== item.role) {
      item.role = newRole;
    }
    // 같은 역할끼리 마지막으로 이동
    chars.splice(charIdx, 1);
    // 해당 역할의 마지막 위치 찾기
    let lastIdx = chars.length;
    for (let i = chars.length - 1; i >= 0; i--) {
      if ((chars[i].role || '기타') === item.role) { lastIdx = i + 1; break; }
    }
    chars.splice(lastIdx, 0, item);
  }

  autoSave();
  renderCharacters();
}


// 참고 패널 캐릭터 카드 접기 상태
let splitCharCollapsed = {};

function toggleSplitChar(idx) {
  // 값이 없으면 기본이 접힘(true)이므로, undefined → false(펼침)로 토글
  const cur = splitCharCollapsed['c'+idx];
  splitCharCollapsed['c'+idx] = cur === undefined ? false : !cur;
  refreshSplitPanel();
}

function refreshSplitPanel() {
  if (document.getElementById('focus-overlay')?.classList.contains('active')) {
    focusRefTab(_focusRefTab);
  } else {
    // 검색 input이 있는 탭은 내부 콘텐츠만 업데이트 (포커스 유지)
    if (splitTab === 'items' && splitElement('split-item-search')) {
      refreshSplitItems(); return;
    }
    if (splitTab === 'memo' && splitElement('split-memo-search')) {
      refreshSplitMemo(); return;
    }
    renderSplitContent();
  }
}

function refreshSplitItems() {
  const p = getProject();
  if (!p) return;
  const items = p.items || [];
  if (!window._splitItemCollapsed) window._splitItemCollapsed = {};
  const sq = (window._splitItemQ || '').trim().toLowerCase();
  const filtered = sq ? items.filter(it => it.name.toLowerCase().includes(sq) || (it.desc||'').toLowerCase().includes(sq)) : items;
  const usedCats = ITEM_CATS.filter(c => filtered.some(it => it.cat === c));
  const catGroups = usedCats.map(c => ({ cat: c, list: filtered.filter(it => it.cat === c) }));

  const inner = splitElement('split-items-inner');
  if (!inner) { refreshSplitPanel(); return; }

  // × 버튼 표시/숨김
  const clr = splitElement('split-item-clear');
  if (clr) clr.style.display = sq ? 'block' : 'none';

  inner.innerHTML = filtered.length === 0
    ? '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:13px">' + (items.length === 0 ? '아이템이 없어요' : '검색 결과 없음') + '</div>'
    : catGroups.map(({cat, list}) => {
        const col = window._splitItemCollapsed[cat] !== false ? true : false;
        let html = '<div style="margin-bottom:8px">'
          + '<div onclick="window._splitItemCollapsed[\''+cat+'\']=(window._splitItemCollapsed[\''+cat+'\']=== undefined?false:!window._splitItemCollapsed[\''+cat+'\']);refreshSplitItems()"'
          + ' style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--cream);border-radius:7px;cursor:pointer;user-select:none;border:1px solid var(--border)">'
          + '<span style="font-size:11px;font-weight:700;color:var(--muted)">' + esc(cat) + ' <span style="opacity:.6">(' + list.length + ')</span></span>'
          + '<span style="font-size:10px;color:var(--muted);display:inline-block;transform:rotate(' + (col?'-90':'0') + 'deg)">▾</span></div>';
        if (!col) {
          html += list.map(it => {
            const rarity = ITEM_RARITIES.find(r=>r.label===it.rarity)||ITEM_RARITIES[0];
            const itIdEsc = esc(it.id||'');
            return '<div style="border:1px solid var(--border);border-radius:8px;margin-top:4px;overflow:hidden;border-left:3px solid ' + rarity.color + '">'
              + '<div style="padding:7px 10px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">'
              + '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;flex-wrap:wrap">'
              + '<span style="font-weight:700;font-size:13px">' + esc(it.name) + '</span>'
              + '<span style="font-size:10px;color:' + rarity.color + ';font-weight:700">' + (it.rarity||'일반') + '</span></div>'
              + (it.desc ? '<div style="font-size:12px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(it.desc) + '</div>' : '')
              + (it.chars ? '<div style="font-size:11px;color:var(--teal);margin-top:2px">👤 ' + esc(it.chars) + '</div>' : '')
              + '</div><button onclick="showItemModal(\'' + itIdEsc + '\');" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted);padding:2px 4px;line-height:1">✏️</button>'
              + '</div></div></div>';
          }).join('');
        }
        return html + '</div>';
      }).join('');
}

function refreshSplitMemo() {
  const inner = splitElement('split-memo-inner');
  if (!inner) { refreshSplitPanel(); return; }
  const allMemos = getChapterMemos();
  if (!window._spMemoCol) window._spMemoCol = {};
  const mq = (window._spMemoQ || '').trim().toLowerCase();
  const memos = mq ? allMemos.filter(m => (m.title||'').toLowerCase().includes(mq) || (m.content||'').toLowerCase().includes(mq)) : allMemos;

  const clr = splitElement('split-memo-clear');
  if (clr) clr.style.display = mq ? 'block' : 'none';

  inner.innerHTML = memos.length === 0
    ? `<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:13px">${allMemos.length === 0 ? '＋ 추가 버튼으로 메모를 만들어보세요' : '검색 결과 없음'}</div>`
    : memos.map(m => {
        const realIdx = allMemos.indexOf(m);
        const col = window._spMemoCol[realIdx] !== false ? true : false;
        const bg = m.color || '#fff8e1';
        return `<div style="border:1px solid rgba(0,0,0,.1);border-radius:10px;margin-bottom:8px;overflow:hidden;background:${bg} !important">
          <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;user-select:none;background:${bg}"
            onclick="window._spMemoCol[${realIdx}]=window._spMemoCol[${realIdx}]===undefined?false:!window._spMemoCol[${realIdx}];refreshSplitMemo()">
            <span style="flex:1;font-weight:700;font-size:13px;color:#1a1208;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${m.title ? esc(m.title) : '<span style="opacity:.4">제목 없음</span>'}
            </span>
            <span style="font-size:10px;color:rgba(0,0,0,.3);display:inline-block;transform:rotate(${col?'-90':'0'}deg);flex-shrink:0">▾</span>
            <button onclick="event.stopPropagation();deleteChapterMemo(${realIdx})" style="background:none;border:none;cursor:pointer;font-size:13px;color:#b5451b;flex-shrink:0">✕</button>
          </div>
          ${col ? '' : `<div style="border-top:1px solid rgba(0,0,0,.06);background:${bg}">
            <input value="${esc(m.title||'')}" oninput="updateChapterMemoTitle(${realIdx},this.value)" placeholder="제목 (선택)"
              style="width:100%;padding:6px 10px;border:none;outline:none;background:transparent;font-weight:700;font-size:12px;color:#1a1208;border-bottom:1px solid rgba(0,0,0,.06)">
            <textarea oninput="updateChapterMemoText(${realIdx},this.value)" rows="4" placeholder="메모를 입력하세요..."
              style="width:100%;padding:8px 10px;font-size:12px;line-height:1.8;background:transparent;border:none;outline:none;resize:vertical;font-family:'Noto Serif KR',serif;color:#1a1208">${esc(m.content||'')}</textarea>
          </div>`}
        </div>`;
      }).join('');
}


let splitFamilyCollapsed = {};
function toggleSplitFamily(idx) {
  const cur = splitFamilyCollapsed['f'+idx];
  splitFamilyCollapsed['f'+idx] = cur === undefined ? false : !cur;
  refreshSplitPanel();
}


function updateFmSubs(typeId, curSub) {
  const FM_TYPES = [
    {id:'family', subs:['직계','방계','사용인','동맹 가문','외척']},
    {id:'guild', subs:['마법사 길드','전사 길드','도적 길드','상인 길드','탐험가 길드','제작자 길드','연금술사 길드']},
    {id:'knight', subs:['근위대','원정대','용병단','반란군','저항군','혁명군','정규군','성기사단']},
    {id:'crime_f', subs:['마피아','도적단','암살단','밀수단','지하조직','비밀결사','사기단']},
    {id:'religion', subs:['교단','신전','이단','수도회','예언자 집단','사교단','성직자회']},
    {id:'academic', subs:['마법학회','연구소','학파','현자 집단','탐구회','마도연구원']},
    {id:'politics', subs:['왕당파','귀족파벌','혁명파','의회파','황실','원로원','추밀원']},
    {id:'corp', subs:['대기업','중소기업','스타트업','NGO','정부기관','공기업','재단','로펌']},
    {id:'school', subs:['초중고등학교','대학교','대학원','연구소','싱크탱크','학원','연구팀']},
    {id:'crime_m', subs:['갱단','카르텔','마약조직','해커 집단','테러 조직','조폭','사이비 종교','사기 집단']},
    {id:'media', subs:['방송국','언론사','연예기획사','스포츠팀','광고회사','출판사','영화사']},
    {id:'military', subs:['군대','특수부대','경찰서','정보기관','용병 회사','민간군사기업','자경단']},
    {id:'politics_m', subs:['정당','시민단체','압력단체','로비단체','지하운동','혁명조직','의회파벌']},
    {id:'korean', subs:['왕실/내명부','의금부/포도청','삼사(사헌부·사간원·홍문관)','훈련도감/어영청','금군/별기군','화랑도','의병단','보부상/객주','향약계/두레','동학교단','불사(절)','무속 집단','권번(기생조합)','의녀 집단','역관 집단','서얼 집단']},
    {id:'chinese', subs:['정파 문파','사파 문파','마교','검문','도문','권파','황실/조정','내각/어사대','금위군','환관 집단','표국','상회','비밀결사','도방','불문','도관','강호','녹림/흑도']},
    {id:'japanese', subs:['막부/쇼군','다이묘 가문','사무라이 집단','닌자 조직','로닌 집단','상인 길드(자)','신사/불교 집단','무사도 집단','이세력/반막부','마을 자경단','기녀(게이샤) 집단','학자 집단(난학)']},
    {id:'other', subs:['동호회','동아리','모험가 파티','용사 일행','온라인 커뮤니티','비공개 모임','기타 집단']},
  ];
  const sel = document.getElementById('fm-sub');
  if (!sel) return;
  const subs = (FM_TYPES.find(t=>t.id===typeId)||FM_TYPES[0]).subs;
  sel.innerHTML = subs.map(s=>`<option value="${s}" ${curSub===s?'selected':''}>${s}</option>`).join('');
}


let familyCollapsed = {};
function toggleFamilyCard(fi) {
  familyCollapsed['f'+fi] = !familyCollapsed['f'+fi];
  renderFamily();
}


let familyMemberCollapsed = {};
function toggleFamilyMembers(fi) {
  familyMemberCollapsed['f'+fi] = !familyMemberCollapsed['f'+fi];
  renderFamily();
}


// 구성원 순서 변경 (터치 드래그)
let _mDrag = null; // {fi, mi, el, ghost, startY, listEl}

function initMemberDrag() {
  document.querySelectorAll('.member-handle').forEach(handle => {
    handle.addEventListener('touchstart', memberTouchStart, {passive: false});
    handle.addEventListener('mousedown', memberMouseStart);
  });
}

function memberTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  memberDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', memberTouchMove, {passive: false});
  document.addEventListener('touchend', memberTouchEnd, {once: true});
}

function memberMouseStart(e) {
  memberDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', memberMouseMove);
  document.addEventListener('mouseup', memberMouseEnd, {once: true});
}

function memberDragInit(handle, x, y) {
  const fi = +handle.dataset.fi;
  const mi = +handle.dataset.mi;
  const row = handle.closest('.member-row');
  const listEl = row.parentElement;
  const rect = row.getBoundingClientRect();

  // 고스트 - 이름만 보이는 심플한 형태
  const memberName = row.querySelector('span[style*="font-weight:600"]')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;z-index:9999;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.2);border-radius:8px;
    background:var(--gold-light);border:1.5px solid var(--gold);
    display:flex;align-items:center;padding:0 12px;gap:8px;transition:none`;
  ghost.innerHTML = `<span style="font-size:18px;color:var(--muted)">⠿</span>
    <span style="font-weight:600;font-size:13px;color:var(--ink)">${memberName}</span>`;
  document.body.appendChild(ghost);

  row.style.opacity = '0.3';

  _mDrag = { fi, mi, el: row, ghost, startY: y, offsetY: y - rect.top, listEl };
}

function memberTouchMove(e) {
  e.preventDefault();
  if (!_mDrag) return;
  memberDragMove(e.touches[0].clientY);
}
function memberMouseMove(e) {
  if (!_mDrag) return;
  memberDragMove(e.clientY);
}

function memberDragMove(clientY) {
  const { ghost, listEl, offsetY } = _mDrag;
  const listRect = listEl.getBoundingClientRect();

  // 고스트 위치 업데이트 (세로만, 리스트 범위 내 클램핑)
  const newTop = Math.max(listRect.top, Math.min(clientY - offsetY, listRect.bottom - ghost.offsetHeight));
  ghost.style.top = newTop + 'px';

  // 드롭 위치 계산
  const rows = [...listEl.querySelectorAll('.member-row')];
  rows.forEach(r => r.style.borderTop = '');
  const midY = clientY;
  let targetIdx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rRect = r.getBoundingClientRect();
    if (midY < rRect.top + rRect.height / 2) {
      targetIdx = i;
      if (r !== _mDrag.el) r.style.borderTop = '2px solid var(--gold)';
      break;
    }
  }
  _mDrag.targetIdx = targetIdx;
}

function memberTouchEnd() {
  document.removeEventListener('touchmove', memberTouchMove);
  memberDragCommit();
}
function memberMouseEnd() {
  document.removeEventListener('mousemove', memberMouseMove);
  memberDragCommit();
}

function memberDragCommit() {
  if (!_mDrag) return;
  const { fi, mi, el, ghost, listEl, targetIdx } = _mDrag;
  _mDrag = null;

  ghost.remove();
  el.style.opacity = '';
  listEl.querySelectorAll('.member-row').forEach(r => r.style.borderTop = '');

  if (targetIdx !== undefined && targetIdx !== mi && targetIdx !== mi + 1) {
    const p = getProject();
    const f = p.families[fi];
    const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
    const members = (f.groups && f.groups[tab]) || [];
    const item = members.splice(mi, 1)[0];
    const insertAt = targetIdx > mi ? targetIdx - 1 : targetIdx;
    members.splice(insertAt, 0, item);
    autoSave();
  }
  renderFamily();
  // 드래그 이벤트 재등록
  setTimeout(initMemberDrag, 50);
}


// ═══════════════════════════════════════════════════════════════
// 장면(씬) 드래그 앤 드롭 (아크 간 이동 포함)
// ═══════════════════════════════════════════════════════════════
let _sDrag = null;

function initSceneDrag() {
  document.querySelectorAll('.scene-handle').forEach(handle => {
    handle.addEventListener('touchstart', sceneTouchStart, {passive: false});
    handle.addEventListener('mousedown', sceneMouseStart);
  });
}

function sceneTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  sceneDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', sceneTouchMove, {passive: false});
  document.addEventListener('touchend', sceneTouchEnd, {once: true});
}
function sceneMouseStart(e) {
  sceneDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', sceneMouseMove);
  document.addEventListener('mouseup', sceneMouseEnd, {once: true});
}

function sceneDragInit(handle, clientX, clientY) {
  const ai = +handle.dataset.ai;
  const si = +handle.dataset.si;
  const row = handle.closest('.scene-row');
  const rect = row.getBoundingClientRect();

  const title = row.querySelector('.scene-card-title')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;z-index:9999;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.2);border-radius:8px;
    background:var(--gold-light);border:1.5px solid var(--gold);
    display:flex;align-items:center;padding:0 12px;gap:8px`;
  ghost.innerHTML = `<span style="font-size:16px;color:var(--muted)">⠿</span>
    <span style="font-weight:600;font-size:12px;color:var(--ink)">${title}</span>`;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';
  _sDrag = { ai, si, el: row, ghost, offsetX: clientX - rect.left, offsetY: clientY - rect.top };
}

function sceneTouchMove(e) { e.preventDefault(); if (_sDrag) sceneDragMove(e.touches[0].clientX, e.touches[0].clientY); }
function sceneMouseMove(e) { if (_sDrag) sceneDragMove(e.clientX, e.clientY); }

function sceneDragMove(clientX, clientY) {
  const { ghost, offsetX, offsetY } = _sDrag;
  ghost.style.left = (clientX - offsetX) + 'px';
  ghost.style.top  = (clientY - offsetY) + 'px';

  // 모든 하이라이트 초기화
  document.querySelectorAll('.scene-row').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.arc-col').forEach(c => c.style.outline = '');

  // 현재 커서가 어느 arc-col 위에 있는지
  const cols = [...document.querySelectorAll('.arc-col')];
  let targetAi = null;
  let targetSi = null;

  for (const col of cols) {
    const colRect = col.getBoundingClientRect();
    if (clientX >= colRect.left && clientX <= colRect.right &&
        clientY >= colRect.top  && clientY <= colRect.bottom) {
      targetAi = +col.dataset.ai;
      col.style.outline = '2px solid var(--gold)';
      col.style.borderRadius = '10px';

      // 해당 컬럼 내 scene-row 위치로 삽입 위치 계산
      const rows = [...col.querySelectorAll('.scene-row')];
      targetSi = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const rRect = rows[i].getBoundingClientRect();
        if (clientY < rRect.top + rRect.height / 2) {
          targetSi = i;
          if (rows[i] !== _sDrag.el) rows[i].style.borderTop = '2px solid var(--gold)';
          break;
        }
      }
      break;
    }
  }
  _sDrag.targetAi = targetAi;
  _sDrag.targetSi = targetSi;
}

function sceneTouchEnd() { document.removeEventListener('touchmove', sceneTouchMove); sceneDragCommit(); }
function sceneMouseEnd() { document.removeEventListener('mousemove', sceneMouseMove); sceneDragCommit(); }

function sceneDragCommit() {
  if (!_sDrag) return;
  const { ai, si, el, ghost, targetAi, targetSi } = _sDrag;
  _sDrag = null;
  ghost.remove();
  el.style.opacity = '';
  document.querySelectorAll('.scene-row').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.arc-col').forEach(c => { c.style.outline = ''; c.style.borderRadius = ''; });

  if (targetAi !== null && targetSi !== null) {
    const p = getProject();
    const fromScenes = p.arcs[ai].scenes;
    const toScenes   = p.arcs[targetAi].scenes;
    const item = fromScenes.splice(si, 1)[0];

    if (ai === targetAi) {
      const insertAt = targetSi > si ? targetSi - 1 : targetSi;
      fromScenes.splice(insertAt, 0, item);
    } else {
      toScenes.splice(targetSi, 0, item);
    }
    autoSave();
  }
  renderPlot();
  setTimeout(initSceneDrag, 50);
}

// 가문 유형별 기본 탭 목록
function getFamilyTabNames(f) {
  const type = f.groupType || 'family';
  const tabMap = {
    family: ['직계','방계','사용인','동맹 가문'],
    guild: ['핵심 멤버','일반 멤버','수습'],
    knight: ['기사','병사','지원'],
    crime_f: ['간부','조원','협력자'],
    religion: ['성직자','신도','수련자'],
    academic: ['연구원','학생','자문'],
    politics: ['핵심 세력','지지자','협력자'],
    corp: ['임원','직원','파트너'],
    school: ['교직원','재학생','동문'],
    crime_m: ['간부','조원','협력자'],
    media: ['핵심 인물','구성원','관계자'],
    military: ['지휘관','병사','지원'],
    politics_m: ['핵심 당원','일반 당원','지지자'],
    korean: ['직계','방계','사용인','동맹'],
    chinese: ['장로','제자','협력자'],
    japanese: ['핵심','일반','수련생'],
    other: ['핵심','일반','기타'],
  };
  return tabMap[type] || ['핵심','일반','기타'];
}

function renderFamilyTabs(f, fi) {
  const p = getProject();
  const tabs = getFamilyTabNames(f);
  const groups = f.groups || {};
  const activeTab = familyActiveTab['f'+fi] || tabs[0];
  const members = groups[activeTab] || [];
  const totalCount = tabs.reduce((acc, t) => acc + (groups[t]||[]).length, 0);

  const tabBtns = tabs.map(t => {
    const cnt = (groups[t]||[]).length;
    const active = t === activeTab;
    return `<button onclick="setFamilyTab(${fi},'${t}')"
      style="padding:5px 12px;border:none;border-radius:20px;cursor:pointer;font-size:11px;
        font-family:'Noto Sans KR',sans-serif;font-weight:600;transition:all .15s;
        background:${active?'var(--gold)':'var(--cream)'};
        color:${active?'#fff':'var(--muted)'}">
      ${t}${cnt>0?` <span style="opacity:.8">(${cnt})</span>`:''}
    </button>`;
  }).join('');

  const memberRows = members.map((m, mi) => {
    const linked = !!(m.charId && (p.characters || []).some(x => x.id === m.charId));
    const linkBadge = linked
      ? `<span title="등장인물 수정으로 이동" style="font-size:10px;color:var(--gold);font-weight:700;padding:1px 5px;border-radius:6px;background:var(--gold-light);border:1px solid var(--gold);cursor:pointer" onclick="event.stopPropagation();openCharFromMember('${esc(m.charId)}')">🔗 인물 수정</span>`
      : '';
    return `
    <div class="member-row" data-fi="${fi}" data-mi="${mi}"
      style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:var(--cream);border-radius:8px;transition:opacity .15s${linked?';border:1px solid var(--gold-light)':''}">
      <span class="member-handle" data-fi="${fi}" data-mi="${mi}"
        style="color:var(--muted);font-size:18px;flex-shrink:0;cursor:grab;padding:4px;touch-action:none;user-select:none;margin-top:1px">⠿</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:13px">${esc(m.name)}</span>
          ${m.relation?`<span style="font-size:11px;color:var(--muted)">${esc(m.relation)}</span>`:''}
          ${linkBadge}
        </div>
        ${m.note?`<div style="font-size:11px;color:var(--muted);margin-top:2px;line-height:1.5;word-break:break-all">${esc(m.note)}</div>`:''}
      </div>
      <div style="display:flex;flex-shrink:0;gap:0">
        <button onclick="showEditMemberModal(${fi},${mi})" style="background:none;border:none;cursor:pointer;color:var(--teal);font-size:13px;width:28px;height:28px">✏️</button>
        <button onclick="deleteFamilyMember(${fi},${mi})" style="background:none;border:none;cursor:pointer;color:var(--rust);font-size:14px;width:28px;height:28px">×</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${tabBtns}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;min-height:10px" id="member-list-${fi}">
      ${members.length===0
        ? `<div style="text-align:center;padding:12px;font-size:12px;color:var(--muted)">구성원 없음</div>`
        : memberRows}
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;justify-content:center"
      onclick="showAddMemberModal(${fi})">＋ ${activeTab} 구성원 추가</button>`;
}

let familyActiveTab = {};
function setFamilyTab(fi, tab) {
  familyActiveTab['f'+fi] = tab;
  renderFamily();
}

/** 가문 멤버에서 연결된 등장인물 편집 화면으로 이동 */
function openCharFromMember(charId) {
  if (!charId) return;
  const p = getProject();
  const idx = (p.characters || []).findIndex(c => c.id === charId);
  if (idx === -1) {
    toast('연결된 인물을 찾을 수 없어요.');
    return;
  }
  // 기존 모달 닫고 인물 편집 모달 열기
  if (typeof closeModal === 'function') closeModal();
  showCharModal(idx, 'basic');
}

/** 멤버 수정 모달에서 등장인물과 새로 연결 */
function linkMemberToChar(fi, mi) {
  const sel = document.getElementById('mb-link-sel');
  const charId = sel?.value;
  if (!charId) { toast('인물을 선택해주세요.'); return; }
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const m = f.groups?.[tab]?.[mi];
  if (!m) return;
  const c = (p.characters || []).find(x => x.id === charId);
  if (!c) return;
  // 다른 가문에 속해 있었다면 그쪽에서 charId 멤버 제거
  if (c.familyId && c.familyId !== f.id) {
    const old = (p.families || []).find(x => x.id === c.familyId);
    if (old && old.groups) {
      Object.keys(old.groups).forEach(t => {
        const list = old.groups[t];
        if (Array.isArray(list)) old.groups[t] = list.filter(mm => !(mm && mm.charId === c.id));
      });
    }
  }
  m.charId = c.id;
  // 인물 정보로 폼 갱신 (이름/나이 등 등장인물 우선)
  m.name   = c.name   || m.name;
  m.age    = c.age    || m.age;
  m.gender = c.gender || m.gender;
  m.alive  = c.alive  || m.alive;
  c.familyId = f.id;
  autoSave();
  closeModal();
  renderFamily();
  toast('등장인물과 연결했어요.');
}

/** 멤버 수정 모달에서 등장인물 연결 해제 */
function unlinkMemberFromChar(fi, mi) {
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const m = f.groups?.[tab]?.[mi];
  if (!m) return;
  const oldCharId = m.charId;
  m.charId = '';
  // 인물의 familyId 가 이 가문이었다면 비움
  if (oldCharId) {
    const c = (p.characters || []).find(x => x.id === oldCharId);
    if (c && c.familyId === f.id) c.familyId = '';
  }
  autoSave();
  closeModal();
  renderFamily();
  toast('연결을 해제했어요.');
}


function moveFamilyCard(fi, dir) {
  const p = getProject();
  const families = p.families;
  // 부모 없는 카드만 이동
  const roots = families.map((f,i)=>({f,i})).filter(({f})=>!f.parentName);
  const rootIdx = roots.findIndex(({i})=>i===fi);
  if (rootIdx === -1) return;
  const newRootIdx = rootIdx + dir;
  if (newRootIdx < 0 || newRootIdx >= roots.length) return;
  // swap
  const a = roots[rootIdx].i;
  const b = roots[newRootIdx].i;
  [families[a], families[b]] = [families[b], families[a]];
  autoSave(); renderFamily();
}

// ═══════════════════════════════════════════════════════════════
