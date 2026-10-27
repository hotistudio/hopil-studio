// WORLD
// ═══════════════════════════════════════════════════════════════
function renderWorld() {
  const p = getProject();
  const items = p.worldSettings || [];
  // worldTimeline id 보정
  if (p.worldTimeline) {
    let _fixed = false;
    p.worldTimeline.forEach(e => { if (!e.id) { e.id = uid(); _fixed = true; } });
    if (_fixed) autoSave();
  }
  const events = (p.worldTimeline || []).slice().sort((a,b) => (a.year||0) - (b.year||0));
  const cats = getWorldCats(p.genre);
  const grouped = {};
  cats.forEach(c => { grouped[c] = items.filter(i => i.category === c); });
  items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = items.filter(x => x.category === i.category); });

  // 타임라인 HTML
  const TL_COLOR_MAP = {
    '전쟁':'#e06040','정치':'#7986cb','재앙':'#546e7a',
    '문화':'#4caf50','종교':'#ab47bc','경제':'#c4922a','기타':'#9a8e7f'
  };
  let timelineHtml = '';
  if (events.length === 0) {
    timelineHtml = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">사건을 추가해보세요</div>`;
  } else {
    const minY = events[0].year || 0;
    const maxY = events[events.length-1].year || 0;
    const range = Math.max(maxY - minY, 1);

    // 연도별 그룹핑
    const yearGroups = {};
    events.forEach((ev, ei) => {
      const key = ev.year;
      if (!yearGroups[key]) yearGroups[key] = [];
      yearGroups[key].push({ev, ei});
    });
    const uniqueYears = Object.keys(yearGroups).map(Number).sort((a,b)=>a-b);

    // 그룹당 최대 노드 수로 높이 결정
    const maxStack = Math.max(...Object.values(yearGroups).map(g=>g.length));
    const DOT = 20; // 점 크기
    const GAP = 10;  // 점 간격
    const TOUCH = 44; // 터치 영역 크기
    const LINE_Y = 40; // 가로선 y위치 (상단에서 px)
    const totalH = LINE_Y + 16 + (maxStack - 1) * (DOT + GAP) + 40; // 선 위 라벨 + 아래 점들

    const minWidth = Math.max(uniqueYears.length * 100, 400);

    let nodesHtml = '';
    uniqueYears.forEach(yr => {
      const pct = range === 0 ? 50 : ((yr - minY) / range * 86 + 7);
      const group = yearGroups[yr];
      // 연도 라벨
      nodesHtml += `<div style="position:absolute;left:${pct}%;transform:translateX(-50%);
        top:${LINE_Y - 22}px;font-size:10px;color:var(--muted);text-align:center;white-space:nowrap">
        ${esc(String(group[0].ev.yearLabel || yr))}</div>`;
      // 가로선 위 점
      nodesHtml += `<div style="position:absolute;left:${pct}%;top:${LINE_Y - 5}px;
        transform:translateX(-50%);width:2px;height:10px;background:var(--border)"></div>`;
      // 각 사건 점
      group.forEach(({ev, ei}, si) => {
        const color = TL_COLOR_MAP[ev.type] || TL_COLOR_MAP['기타'];
        const dotTop = LINE_Y + 8 + si * (DOT + GAP);
        const evIdEsc = esc(ev.id||'');
        nodesHtml += `
          <button class="tl-node" data-ei="${ei}"
            style="position:absolute;left:${pct}%;top:${dotTop - (TOUCH-DOT)/2}px;
              transform:translateX(-50%);
              width:${TOUCH}px;height:${TOUCH}px;
              display:flex;align-items:center;justify-content:center;
              background:transparent;border:none;
              cursor:pointer;z-index:2;padding:0;-webkit-tap-highlight-color:transparent;"
            title="${esc(ev.title)}"
            onclick="toggleTlDetail('tld-${evIdEsc}')">
            <div style="width:${DOT}px;height:${DOT}px;border-radius:50%;
              background:${color};border:2px solid var(--paper);
              box-shadow:0 2px 6px var(--shadow);pointer-events:none;
              transition:transform .15s"
              onmouseenter="this.style.transform='scale(1.3)'"
              onmouseleave="this.style.transform='scale(1)'"></div>
          </button>`;
      });
    });

    timelineHtml = `
      <div style="position:relative;overflow-x:auto;padding-bottom:8px">
        <div style="position:relative;min-width:${minWidth}px;height:${totalH}px;margin-bottom:8px">
          <!-- 가로선 -->
          <div style="position:absolute;top:${LINE_Y}px;left:3%;right:3%;height:2px;background:var(--border)"></div>
          ${nodesHtml}
        </div>
        <!-- 범례 -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          ${Object.entries(TL_COLOR_MAP).map(([t,c])=>`
            <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
              <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${t}
            </span>`).join('')}
        </div>
        <!-- 상세 카드 (접힘) -->
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:8px">
          ${events.map((ev, ei) => {
            const color = TL_COLOR_MAP[ev.type] || TL_COLOR_MAP['기타'];
            const evIdEsc = esc(ev.id||'');
            return `
            <div id="tld-${evIdEsc}" style="display:none;border:1.5px solid ${color};border-radius:10px;overflow:hidden">
              <div style="padding:10px 14px;background:${color}18;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div>
                  <span style="font-weight:700;font-size:14px;color:${color}">${esc(ev.title)}</span>
                  <span style="font-size:11px;color:var(--muted);margin-left:8px">${esc(ev.yearLabel||String(ev.year))} · ${esc(ev.type)}</span>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-outline btn-sm" onclick="showTimelineModal('${evIdEsc}')" style="font-size:11px">✏️ 수정</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteTimeline('${evIdEsc}')" style="font-size:11px">🗑️ 삭제</button>
                </div>
              </div>
              <div style="padding:10px 14px;font-size:13px;line-height:1.7">
                ${ev.desc ? `<div style="color:var(--muted);margin-bottom:8px;white-space:pre-wrap">${esc(ev.desc)}</div>` : ''}
                <div style="display:flex;gap:16px;flex-wrap:wrap">
                  ${ev.chars ? `<div style="font-size:12px"><span style="color:var(--muted)">👤 인물</span> ${esc(ev.chars)}</div>` : ''}
                  ${ev.place ? `<div style="font-size:12px"><span style="color:var(--muted)">📍 장소</span> ${esc(ev.place)}</div>` : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  let html = '';
  const allCats = [...cats, ...Object.keys(grouped).filter(c => !cats.includes(c))];
  allCats.forEach(cat => {
    const catItems = grouped[cat] || [];
    if (catItems.length === 0) return;
    html += `<div style="margin-bottom:20px">
      <div style="font-family:'Noto Serif KR',serif;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:10px;letter-spacing:1px">${esc(cat)}</div>
      <div style="display:grid;gap:10px">
        ${catItems.map(w => {
          const idx = items.findIndex(i => i.id === w.id);
          return `
          <div class="card card-sm" style="padding:0;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--cream);cursor:pointer;user-select:none" onclick="(function(el){var body=el.parentElement.querySelector('.world-main-body');var arrow=el.querySelector('.world-main-arrow');var isHidden=body.style.display==='none';body.style.display=isHidden?'':'none';arrow.style.transform=isHidden?'rotate(0deg)':'rotate(-90deg)'})(this)">
              <div style="font-weight:700;font-size:14px">${esc(w.title)}</div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="world-main-arrow" style="color:var(--muted);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(-90deg)">▼</span>
                <button class="btn-icon" onclick="event.stopPropagation();showWorldModal(${idx})" style="width:28px;height:28px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onclick="event.stopPropagation();deleteWorld(${idx})" title="삭제"
                  style="width:28px;height:28px;border-radius:50%;background:rgba(181,69,27,.1);
                    border:none;cursor:pointer;color:var(--rust);font-size:15px;font-weight:700;
                    display:flex;align-items:center;justify-content:center">×</button>
              </div>
            </div>
            <div class="world-main-body" style="padding:10px 14px;color:var(--muted);font-size:13px;line-height:1.7;white-space:pre-wrap;display:none">${esc(w.content)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  document.getElementById('main').innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div class="font-display" style="font-size:22px">세계관 설정 (${items.length})</div>
        <button class="btn btn-gold" onclick="showWorldModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          설정 추가
        </button>
      </div>

      <!-- 역사 타임라인 -->
      <div class="card" style="margin-bottom:24px;padding:0;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:12px 18px;background:var(--cream);cursor:pointer;user-select:none"
          onclick="(function(el){
            var body=document.getElementById('timeline-body');
            var arrow=el.querySelector('.tl-collapse-arrow');
            var isHidden=body.style.display==='none';
            body.style.display=isHidden?'':'none';
            arrow.style.transform=isHidden?'rotate(0deg)':'rotate(-90deg)';
          })(this)">
          <span class="font-display" style="font-size:16px">⏳ 타임라인 (${events.length})</span>
          <div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
            <button class="btn btn-outline btn-sm" onclick="showTimelineModal()">＋ 사건 추가</button>
            <span class="tl-collapse-arrow" style="color:var(--muted);font-size:11px;
              transition:transform .2s;display:inline-block;cursor:pointer"
              onclick="event.stopPropagation();this.closest('.card').querySelector('[onclick*=timeline-body]').click()">▼</span>
          </div>
        </div>
        <div id="timeline-body" style="padding:16px 18px">
          ${timelineHtml}
        </div>
      </div>

      ${items.length === 0
        ? `<div class="card empty-state"><div class="emoji">🌍</div><p>세계관 설정을 추가해보세요.</p></div>`
        : html}
    </div>`;
}

function toggleTlDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}



// 타임라인
const TL_TYPES = ['전쟁','정치','재앙','문화','종교','경제','기타'];
function showTimelineModal(id) {
  const p = getProject();
  const ev = id ? (p.worldTimeline||[]).find(e => e.id === id) : null;
  const isEdit = !!ev;
  const evData = ev || {};
  const idEsc = esc(id||'');
  showModal(`
    <div class="modal-title">${isEdit ? '사건 수정' : '사건 추가'}</div>
    <div class="form-grid">
      <div><label class="label">표시 연도/시기 *</label>
        <input id="tl-year" value="${esc(evData.yearLabel||String(evData.year??''))}" placeholder="예: 건국 3년차, 300년 전, B.C 12"></div>
      <div><label class="label">정렬 순서 (숫자) *<span style="font-size:10px;color:var(--muted);font-weight:400"> 작을수록 왼쪽</span></label>
        <input id="tl-order" type="number" value="${evData.year??''}" placeholder="예: -300, 1, 100"></div>
      <div><label class="label">사건 종류</label>
        <select id="tl-type">${TL_TYPES.map(t=>`<option value="${t}" ${evData.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="full"><label class="label">사건명 *</label>
        <input id="tl-title" value="${esc(evData.title||'')}" placeholder="사건 이름"></div>
      <div class="full"><label class="label">설명</label>
        <textarea id="tl-desc" rows="3" placeholder="사건의 내용과 결과">${esc(evData.desc||'')}</textarea></div>
      <div><label class="label">관련 인물</label>
        <input id="tl-chars" value="${esc(evData.chars||'')}" placeholder="예: 영희, 철수"></div>
      <div><label class="label">관련 장소</label>
        <input id="tl-place" value="${esc(evData.place||'')}" placeholder="예: 수도 아르켄"></div>
    </div>
    <div class="modal-footer">
      ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteTimeline('${idEsc}')">삭제</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveTimeline('${idEsc}')">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('tl-year')?.focus(), 100);
}
function saveTimeline(id) {
  const title = document.getElementById('tl-title').value.trim();
  const yearRaw = document.getElementById('tl-year').value.trim();
  const orderRaw = document.getElementById('tl-order').value.trim();
  if (!title || !yearRaw || orderRaw === '') { toast('표시 연도, 정렬 순서, 사건명을 입력해주세요.'); return; }
  const yearNum = parseFloat(orderRaw);
  const p = getProject();
  if (!p.worldTimeline) p.worldTimeline = [];
  const existingIdx = id ? p.worldTimeline.findIndex(e => e.id === id) : -1;
  const isEdit = existingIdx >= 0;
  const ev = {
    id: isEdit ? p.worldTimeline[existingIdx].id : uid(),
    year: yearNum, yearLabel: yearRaw, title,
    type: document.getElementById('tl-type').value,
    desc: document.getElementById('tl-desc').value,
    chars: document.getElementById('tl-chars').value,
    place: document.getElementById('tl-place').value,
  };
  if (isEdit) p.worldTimeline[existingIdx] = ev;
  else p.worldTimeline.push(ev);
  autoSave(); closeModal(); renderWorld();
}
function deleteTimeline(id) {
  const p = getProject();
  const i = p?.worldTimeline?.findIndex(e => e.id === id) ?? -1;
  if (i < 0) return;
  p.worldTimeline.splice(i, 1);
  autoSave(); closeModal(); renderWorld();
  toast('사건을 삭제했어요.');
}

function showWorldModal(idx) {
  const p = getProject();
  const w = idx !== undefined ? p.worldSettings[idx] : {};
  const cats = getWorldCats(p.genre);
  const defaultCat = w.category || cats[0];
  // 지리 계층과 공통 카테고리 구분해서 optgroup으로 표시
  const geo = WORLD_CATS_GEO[p.genre] || WORLD_CATS_GEO['기타'];
  const catOpts = `
    <optgroup label="📍 지리/장소">
      ${geo.map(c => `<option value="${c}" ${defaultCat===c?'selected':''}>${c}</option>`).join('')}
    </optgroup>
    <optgroup label="📚 공통 설정">
      ${WORLD_CATS_COMMON.map(c => `<option value="${c}" ${defaultCat===c?'selected':''}>${c}</option>`).join('')}
    </optgroup>`;
  showModal(`
    <div class="modal-title">${idx !== undefined ? '설정 수정' : '설정 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">항목명 *</label><input id="wm-title" value="${esc(w.title||'')}" placeholder="설정 이름"></div>
    <div style="margin-bottom:12px"><label class="label">카테고리</label><select id="wm-cat">${catOpts}</select></div>
    <div style="margin-bottom:20px"><label class="label">내용</label><textarea id="wm-content" rows="6" placeholder="설정 내용을 자세히 설명하세요">${esc(w.content||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveWorld(${idx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('wm-title')?.focus(), 100);
}

function saveWorld(idx) {
  const title = document.getElementById('wm-title').value.trim();
  if (!title) { toast('항목명을 입력해주세요.'); return; }
  const w = {
    id: idx !== undefined ? getProject().worldSettings[idx].id : uid(),
    title, category: document.getElementById('wm-cat').value,
    content: document.getElementById('wm-content').value,
  };
  const p = getProject();
  if (idx !== undefined) p.worldSettings[idx] = w;
  else p.worldSettings.push(w);
  autoSave(); closeModal();
  const _sp = document.getElementById('split-panel');
  const _inSp = _sp && !_sp.classList.contains('hidden') && splitTab === 'world';
  const _inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
  if (_inFocus) { refreshSplitPanel(); }
  else if (_inSp) { renderSplitContent(); }
  else { renderWorld(); }
}
function deleteWorld(idx) {
  confirmDialog('이 세계관 설정을 삭제합니다.', () => {
    getProject().worldSettings.splice(idx,1);
    autoSave();
    const _inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
    if (_inFocus) refreshSplitPanel(); else renderWorld();
    toast('설정을 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
// PLOT
// ═══════════════════════════════════════════════════════════════
function renderPlot() {
  const p = getProject();
  const arcs = p.arcs || [];
  const chList = (p.chapters || []).filter(c => !c.isFolder);
  const chapterById = new Map();
  chList.forEach((c, i) => chapterById.set(c.id, { num: i + 1, title: c.title }));

  const cols = arcs.map((a, ai) => {
  const scenes = (a.scenes || []).map((s, si) => {
    const linkedCh = s.chapterId ? chapterById.get(s.chapterId) : null;
    const chapterLink = linkedCh
      ? `<div style="font-size:10px;color:var(--gold);margin-top:4px;cursor:pointer" onclick="event.stopPropagation();gotoChapterFromScene('${esc(s.chapterId)}')" title="이 화로 이동"><span style="text-decoration:underline">🔗 ${linkedCh.num}화 · ${esc(linkedCh.title)}</span></div>`
      : '';
    return `
      <div class="scene-row" data-ai="${ai}" data-si="${si}" style="position:relative;margin-bottom:8px">
        <div class="scene-card" style="margin-bottom:0;padding-left:28px${linkedCh?';border-left:3px solid var(--gold)':''}" onclick="showSceneModal(${ai},${si})">
          <span class="scene-handle" data-ai="${ai}" data-si="${si}"
            style="position:absolute;left:6px;top:50%;transform:translateY(-50%);
              color:var(--border);font-size:16px;cursor:grab;padding:4px;
              touch-action:none;user-select:none;line-height:1">⠿</span>
          <span class="font-display" style="color:var(--gold);font-size:11px">#${si+1}</span>
          <div class="scene-card-title">${esc(s.title)}</div>
          <span class="scene-card-type">${esc(s.type||'')}</span>
          ${s.summary?`<div style="color:var(--muted);margin-top:4px;font-size:11px;line-height:1.5;white-space:pre-wrap">${esc(s.summary)}</div>`:''}
          ${chapterLink}
        </div>
        <button
          style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;
            background:rgba(181,69,27,0.12);border:none;cursor:pointer;
            display:flex;align-items:center;justify-content:center;z-index:10;
            color:var(--rust);font-size:13px;font-weight:700;line-height:1"
          onclick="event.stopPropagation();deleteScene(${ai},${si})">×</button>
      </div>`;
  }).join('');

    return `
      <div class="arc-col" data-ai="${ai}">
        <div class="arc-col-header" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <span class="arc-col-title">${esc(a.title)}</span>
            <div style="display:flex;gap:4px">
              <button class="btn-icon" onclick="showArcModal(${ai})" style="width:28px;height:28px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon" onclick="deleteArc(${ai})" style="color:var(--rust);width:28px;height:28px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
          ${a.description ? `<div style="font-size:11px;color:var(--muted);font-weight:400;line-height:1.5;white-space:pre-wrap">${esc(a.description)}</div>` : ''}
        </div>
        ${scenes}
        <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:4px" onclick="showSceneModal(${ai})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          장면 추가
        </button>
      </div>`;
  }).join('');

  document.getElementById('main').innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div class="font-display" style="font-size:22px">플롯 구성</div>
        <button class="btn btn-gold" onclick="showArcModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          아크 추가
        </button>
      </div>
      ${arcs.length === 0
        ? `<div class="card empty-state"><div class="emoji">🗺️</div><p>스토리 아크를 추가하고<br>장면을 구성해보세요.</p></div>`
        : `<div class="arc-list">${cols}</div>`}
    </div>`;
  setTimeout(initSceneDrag, 50);
}

function showArcModal(idx) {
  const p = getProject();
  const a = idx !== undefined ? p.arcs[idx] : {};
  showModal(`
    <div class="modal-title">${idx !== undefined ? '아크 수정' : '아크 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">아크 이름 *</label><input id="am-title" value="${esc(a.title||'')}" placeholder="예: 1부 - 각성편"></div>
    <div style="margin-bottom:20px"><label class="label">설명</label><textarea id="am-desc" rows="3" placeholder="이 아크의 주요 사건">${esc(a.description||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveArc(${idx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('am-title')?.focus(), 100);
}
function saveArc(idx) {
  const title = document.getElementById('am-title').value.trim();
  if (!title) { toast('아크 이름을 입력해주세요.'); return; }
  const a = { id: idx !== undefined ? getProject().arcs[idx].id : uid(), title, description: document.getElementById('am-desc').value, scenes: idx !== undefined ? getProject().arcs[idx].scenes : [] };
  const p = getProject();
  if (idx !== undefined) p.arcs[idx] = a;
  else p.arcs.push(a);
  autoSave(); closeModal(); renderPlot();
}
function deleteArc(idx) {
  confirmDialog('이 아크와 모든 장면을 삭제합니다.', () => {
    getProject().arcs.splice(idx,1);
    autoSave(); renderPlot();
    toast('아크를 삭제했어요.');
  });
}

function showSceneModal(arcIdx, sceneIdx) {
  const p = getProject();
  const s = sceneIdx !== undefined ? p.arcs[arcIdx].scenes[sceneIdx] : {};
  const chapters = (p.chapters || []).filter(c => !c.isFolder);
  const chapterOpts = chapters.map((c, i) =>
    `<option value="${c.id}" ${s.chapterId===c.id?'selected':''}>${i+1}화 · ${esc(c.title)}</option>`
  ).join('');
  showModal(`
    <div class="modal-title">${sceneIdx !== undefined ? '장면 수정' : '장면 추가'}</div>
    <div class="form-grid">
      <div><label class="label">장면 제목 *</label><input id="sm-title" value="${esc(s.title||'')}" placeholder="장면 이름"></div>
      <div><label class="label">유형</label><select id="sm-type">${selOpts(SCENE_TYPES,s.type||SCENE_TYPES[0])}</select></div>
      <div class="full">
        <label class="label">연결된 화 <span style="font-size:10px;color:var(--gold)">🔗 자동 동기화</span></label>
        <select id="sm-chapter" style="width:100%">
          <option value="">— 연결 안 함 —</option>
          ${chapterOpts}
        </select>
        ${chapters.length === 0 ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">아직 작성된 화가 없습니다.</div>' : ''}
      </div>
      <div class="full"><label class="label">요약</label><textarea id="sm-sum" rows="3" placeholder="이 장면에서 일어나는 일">${esc(s.summary||'')}</textarea></div>
      <div class="full"><label class="label">등장인물</label><input id="sm-chars" value="${esc(s.characters||'')}" placeholder="예: 이수한, 서아린"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveScene(${arcIdx},${sceneIdx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('sm-title')?.focus(), 100);
}
function saveScene(arcIdx, sceneIdx) {
  const title = document.getElementById('sm-title').value.trim();
  if (!title) { toast('장면 제목을 입력해주세요.'); return; }
  const s = {
    id: sceneIdx !== undefined ? getProject().arcs[arcIdx].scenes[sceneIdx].id : uid(),
    title,
    type: document.getElementById('sm-type').value,
    chapterId: document.getElementById('sm-chapter')?.value || '',
    summary: document.getElementById('sm-sum').value,
    characters: document.getElementById('sm-chars').value,
  };
  const p = getProject();
  if (sceneIdx !== undefined) p.arcs[arcIdx].scenes[sceneIdx] = s;
  else p.arcs[arcIdx].scenes.push(s);
  autoSave(); closeModal(); renderPlot();
}
function deleteScene(arcIdx, sceneIdx) {
  confirmDialog('이 장면을 삭제합니다.', () => {
    getProject().arcs[arcIdx].scenes.splice(sceneIdx,1);
    autoSave(); renderPlot();
    toast('장면을 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
