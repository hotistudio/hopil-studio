// DIAGRAM ENGINE
// ═══════════════════════════════════════════════════════════════
const DG_COLORS = [
  {v:'#f0e9d8', label:'기본',   border:'#c4922a'},
  {v:'#e53935', label:'빨강',   border:'#b71c1c'},
  {v:'#e64a19', label:'주황',   border:'#bf360c'},
  {v:'#f9a825', label:'노랑',   border:'#f57f17'},
  {v:'#43a047', label:'초록',   border:'#1b5e20'},
  {v:'#00897b', label:'청록',   border:'#004d40'},
  {v:'#1e88e5', label:'파랑',   border:'#0d47a1'},
  {v:'#5e35b1', label:'남보라', border:'#311b92'},
  {v:'#8e24aa', label:'보라',   border:'#4a148c'},
  {v:'#d81b60', label:'핑크',   border:'#880e4f'},
  {v:'#546e7a', label:'회색',   border:'#263238'},
  {v:'#263238', label:'다크',   border:'#000000'},
];

const DG_TYPE_COLORS = {
  character: {bg:'#fff3e0', border:'#e8bc5c', text:'#7a4a00'},
  place:     {bg:'#e8f5e9', border:'#4caf50', text:'#1b5e20'},
  event:     {bg:'#e8eaf6', border:'#7986cb', text:'#283593'},
  idea:      {bg:'#fce4ec', border:'#f48fb1', text:'#880e4f'},
  world:     {bg:'#e0f7fa', border:'#4dd0e1', text:'#006064'},
  memo:      {bg:'#fffde7', border:'#ffee58', text:'#827717'},
};

const DG_TYPES = [
  {id:'character', label:'인물', icon:'👤', desc:'등장인물'},
  {id:'place',     label:'장소', icon:'📍', desc:'지역/장소'},
  {id:'event',     label:'사건', icon:'⚡', desc:'사건/사고'},
  {id:'idea',      label:'아이디어', icon:'💡', desc:'아이디어'},
  {id:'world',     label:'세계관', icon:'🌍', desc:'세계관 요소'},
  {id:'memo',      label:'메모', icon:'📝', desc:'자유 메모'},
];

const DG_DIAGRAM_TYPES = [
  {id:'relation',  label:'인물 관계도'},
  {id:'plot',      label:'플롯 흐름도'},
  {id:'world',     label:'세계관 맵'},
  {id:'free',      label:'자유 메모'},
];

let dgState = {
  activeDiagramId: null,
  selectedNodeId: null,
  selectedEdgeIdx: null,
  connecting: false,
  connectFrom: null,
  pan: {x:0, y:0},
  zoom: 1,
  dragging: null,
  dragOffset: {x:0, y:0},  // 논리 좌표 기준 offset
};

// 화면 좌표 → 논리 좌표
function screenToLogic(sx, sy) {
  const wrap = document.getElementById('dg-wrap');
  const wr   = wrap ? wrap.getBoundingClientRect() : {left:0, top:0};
  return {
    x: (sx - wr.left - dgState.pan.x) / dgState.zoom,
    y: (sy - wr.top  - dgState.pan.y) / dgState.zoom,
  };
}

function findDiagramEdgeAt(clientX, clientY, maxScreenDistance) {
  const diagram = getActiveDiagram();
  if (!diagram?.edges?.length) return -1;
  const point = screenToLogic(clientX, clientY);
  let closest = -1;
  let closestDistance = maxScreenDistance / dgState.zoom;
  (diagram.edges || []).forEach((edge, index) => {
    const from = (diagram.nodes || []).find(node => node.id === edge.from);
    const to = (diagram.nodes || []).find(node => node.id === edge.to);
    if (!from || !to) return;
    const fromEl = document.getElementById('node-' + from.id);
    const toEl = document.getElementById('node-' + to.id);
    const x1 = from.x + (fromEl?.offsetWidth || 180) / 2;
    const y1 = from.y + (fromEl?.offsetHeight || 76) / 2;
    const x2 = to.x + (toEl?.offsetWidth || 180) / 2;
    const y2 = to.y + (toEl?.offsetHeight || 76) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
    if (distance < closestDistance) { closestDistance = distance; closest = index; }
  });
  return closest;
}

// 논리 좌표 → 화면 좌표 (wrap 기준)
function logicToScreen(lx, ly) {
  return {
    x: lx * dgState.zoom + dgState.pan.x,
    y: ly * dgState.zoom + dgState.pan.y,
  };
}

// stage 트랜스폼 적용
function applyStage() {
  const stage = document.getElementById('dg-stage');
  if (!stage) return;
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate(${dgState.pan.x}px,${dgState.pan.y}px) scale(${dgState.zoom})`;
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = Math.round(dgState.zoom*100)+'%';
}

function getDiagrams() { return getProject().diagrams || []; }
function getActiveDiagram() { return getDiagrams().find(d => d.id === dgState.activeDiagramId); }

function saveDiagram() {
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  autoSave();
}

// ── 다이어그램 탭 렌더 ──
function renderDiagram() {
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  const diagrams = p.diagrams;

  // 활성 다이어그램이 없으면 첫 번째로
  if (!dgState.activeDiagramId && diagrams.length > 0) {
    dgState.activeDiagramId = diagrams[0].id;
    dgState.pan = {x:0, y:0};
    dgState.zoom = 1;
  }

  const tabsHtml = diagrams.map(d => `
    <button class="diagram-tab ${d.id===dgState.activeDiagramId?'active':''}"
      onclick="switchDiagram('${d.id}')">${esc(d.name)}</button>`).join('');

  document.getElementById('main').innerHTML = `
    <div class="diagram-wrap">
      <div class="diagram-toolbar">
        <div class="diagram-tabs">${tabsHtml}</div>
        <button class="btn btn-gold btn-sm" onclick="showNewDiagramModal()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          새 다이어그램
        </button>
        ${diagrams.length>0?`
        <div style="width:1px;height:20px;background:var(--border)"></div>
        <button class="btn btn-outline btn-sm" onclick="showAddNodeModal()">＋ 노드 추가</button>
        <button class="btn btn-outline btn-sm" onclick="toggleConnectMode()" id="btn-connect">🔗 연결</button>
        <button class="btn btn-outline btn-sm" onclick="editSelectedDiagramNode()" id="btn-edit-node" disabled>선택한 노드 편집</button>
        <button class="btn btn-outline btn-sm" onclick="resetView()">⊕ 화면 맞춤</button>
        <span id="zoom-label" style="font-size:11px;color:var(--muted);min-width:36px;text-align:center">100%</span>
        <button class="btn btn-outline btn-sm" onclick="clearSelection()">✕ 선택 해제</button>
        <span class="diagram-help">빈 공간 끌기: 이동 · 휠/두 손가락: 확대 · 노드 선택/선 터치: 편집</span>
        <button class="btn btn-danger btn-sm" onclick="deleteActiveDiagram()">다이어그램 삭제</button>
        `:''}
      </div>
      <div class="diagram-canvas-wrap" id="dg-wrap" style="touch-action:none">
        ${diagrams.length===0
          ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted)">
              <div style="font-size:40px">🗂️</div>
              <div style="font-size:15px">다이어그램을 만들어보세요</div>
              <button class="btn btn-gold" onclick="showNewDiagramModal()">＋ 새 다이어그램 만들기</button>
            </div>`
          : `<div id="dg-stage" style="position:absolute;inset:0;overflow:visible;">
               <div id="diagram-canvas" style="position:absolute;inset:0;"></div>
               <svg id="diagram-svg" style="position:absolute;left:0;top:0;width:4000px;height:4000px;pointer-events:none;overflow:visible"><defs></defs><g id="svg-edges"></g></svg>
             </div>`}
      </div>
    </div>`;

  if (diagrams.length > 0) {
    dgState.pan = {x:0, y:0};
    dgState.zoom = 1;
    renderDiagramCanvas();
    setupDiagramEvents();
    requestAnimationFrame(resetView);
  }
}

function switchDiagram(id) {
  dgState.activeDiagramId = id;
  dgState.selectedNodeId = null;
  dgState.connecting = false;
  dgState.connectFrom = null;
  dgState.pan = {x:0, y:0};
  dgState.zoom = 1;
  renderDiagram();
}

function renderDiagramCanvas() {
  const dg = getActiveDiagram();
  if (!dg) return;
  const canvas = document.getElementById('diagram-canvas');
  const svgEdges = document.getElementById('svg-edges');
  if (!canvas || !svgEdges) return;

  // 노드 렌더
  canvas.innerHTML = '';
  (dg.nodes||[]).forEach(node => {
    const el = document.createElement('div');
    el.className = `dg-node type-${node.type}${node.id===dgState.selectedNodeId?' selected':''}`;
    el.id = 'node-'+node.id;
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';
    el.dataset.id = node.id;
    const typeInfo = DG_TYPES.find(t=>t.id===node.type)||DG_TYPES[0];
    // 커스텀 색상 적용
    if (node.color && node.color !== '#f0e9d8') {
      const darkColors = ['#e53935','#e64a19','#43a047','#00897b','#1e88e5','#5e35b1','#8e24aa','#d81b60','#546e7a','#263238'];
      const isDark = darkColors.includes(node.color);
      el.style.background  = node.color;
      el.style.borderColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)';
      el.style.color       = isDark ? '#ffffff' : '#1a1208';
    }
    el.innerHTML = `
      <div class="dg-node-icon">${typeInfo.icon}</div>
      <div class="dg-node-label">${esc(node.label)}</div>
      ${node.sub?`<div class="dg-node-sub">${esc(node.sub)}</div>`:''}
    `;
    canvas.appendChild(el);
  });
  updateDiagramSelectionToolbar();

  // ── 엣지(연결선) 렌더 ────────────────────────────────────────
  const EDGE_COLORS = ['#235f62','#c4922a','#b5451b','#3949ab','#7b1fa2','#555555'];

  // defs 초기화
  let defsHtml = '<defs>';
  EDGE_COLORS.forEach(c => {
    const id = c.replace('#','');
    defsHtml += `<marker id="ae-${id}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
    defsHtml += `<marker id="as-${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
  });
  defsHtml += '</defs>';
  svgEdges.innerHTML = defsHtml;

  // 노드 DOM 크기를 실제로 읽어서 가장자리 계산
  function calcEdgePt(node, toX, toY, arrowOff) {
    const el = document.getElementById('node-' + node.id);
    const hw = el ? el.offsetWidth  / 2 : 90;
    const hh = el ? el.offsetHeight / 2 : 38;
    const cx = node.x + hw;
    const cy = node.y + hh;
    const dx = toX - cx, dy = toY - cy;
    if (!dx && !dy) return {x: cx, y: cy};
    const sx = dx ? hw / Math.abs(dx) : 1e9;
    const sy = dy ? hh / Math.abs(dy) : 1e9;
    const s  = Math.min(sx, sy);
    const ex = cx + dx * s, ey = cy + dy * s;
    if (arrowOff > 0) {
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      return {x: ex - (dx/len)*arrowOff, y: ey - (dy/len)*arrowOff};
    }
    return {x: ex, y: ey};
  }

  (dg.edges||[]).forEach((edge, ei) => {
    const fromNode = (dg.nodes||[]).find(n => n.id === edge.from);
    const toNode   = (dg.nodes||[]).find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    const color = edge.color  || '#235f62';
    const dir   = edge.dir   || 'forward';
    const style = edge.style || 'solid';
    const cid   = color.replace('#','');

    // 두 노드 중심 (실제 DOM 크기 기준)
    const fel = document.getElementById('node-' + fromNode.id);
    const tel = document.getElementById('node-' + toNode.id);
    const fhw = fel ? fel.offsetWidth/2  : 90, fhh = fel ? fel.offsetHeight/2 : 38;
    const thw = tel ? tel.offsetWidth/2  : 90, thh = tel ? tel.offsetHeight/2 : 38;
    const fcx = fromNode.x + fhw;
    const fcy = fromNode.y + fhh;
    const tcx = toNode.x   + thw;
    const tcy = toNode.y   + thh;

    const hasEnd   = (dir === 'forward' || dir === 'both');
    const hasStart = (dir === 'both');

    const fp = calcEdgePt(fromNode, tcx, tcy, hasStart ? 13 : 0);
    const tp = calcEdgePt(toNode,   fcx, fcy, hasEnd   ? 13 : 0);
    const fx = fp.x, fy = fp.y, tx = tp.x, ty = tp.y;
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.dataset.edgeIdx = ei;
    const isSelected = (dgState.selectedEdgeIdx === ei);

    if (style === 'cut') {
      // 절단선: 두 반쪽 + X 기호
      const q1x = (fx*2+tx)/3, q1y = (fy*2+ty)/3;
      const q2x = (fx+tx*2)/3, q2y = (fy+ty*2)/3;
      [[fx,fy,q1x,q1y,hasStart,false],[q2x,q2y,tx,ty,false,hasEnd]].forEach(([x1,y1,x2,y2,ms,me]) => {
        const seg = document.createElementNS('http://www.w3.org/2000/svg','line');
        seg.setAttribute('x1',x1); seg.setAttribute('y1',y1);
        seg.setAttribute('x2',x2); seg.setAttribute('y2',y2);
        seg.setAttribute('stroke',color); seg.setAttribute('stroke-width','2.5');
        seg.setAttribute('stroke-linecap','round');
        if (me) seg.setAttribute('marker-end',  `url(#ae-${cid})`);
        if (ms) seg.setAttribute('marker-start',`url(#as-${cid})`);
        g.appendChild(seg);
      });
      // X 기호
      const xs = 7;
      [[-xs,-xs,xs,xs],[xs,-xs,-xs,xs]].forEach(([dx1,dy1,dx2,dy2]) => {
        const xl = document.createElementNS('http://www.w3.org/2000/svg','line');
        xl.setAttribute('x1',mx+dx1); xl.setAttribute('y1',my+dy1);
        xl.setAttribute('x2',mx+dx2); xl.setAttribute('y2',my+dy2);
        xl.setAttribute('stroke',color); xl.setAttribute('stroke-width','2.5');
        xl.setAttribute('stroke-linecap','round');
        g.appendChild(xl);
      });
    } else {
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',fx); line.setAttribute('y1',fy);
      line.setAttribute('x2',tx); line.setAttribute('y2',ty);
      line.setAttribute('stroke',color); line.setAttribute('stroke-width','2.5');
      line.setAttribute('stroke-linecap','round');
      if (style === 'dashed') line.setAttribute('stroke-dasharray','8,5');
      if (hasEnd)   line.setAttribute('marker-end',  `url(#ae-${cid})`);
      if (hasStart) line.setAttribute('marker-start',`url(#as-${cid})`);
      g.appendChild(line);
    }

    // 선택 하이라이트 (선택됐을 때만 표시)
    if (isSelected) {
      const glow = document.createElementNS('http://www.w3.org/2000/svg','line');
      glow.setAttribute('x1',fx); glow.setAttribute('y1',fy);
      glow.setAttribute('x2',tx); glow.setAttribute('y2',ty);
      glow.setAttribute('stroke', color);
      glow.setAttribute('stroke-width','10');
      glow.setAttribute('stroke-opacity','0.25');
      glow.setAttribute('stroke-linecap','round');
      g.insertBefore(glow, g.firstChild);
    }
    // 넓은 터치 히트 영역
    const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
    hit.setAttribute('x1',fx); hit.setAttribute('y1',fy);
    hit.setAttribute('x2',tx); hit.setAttribute('y2',ty);
    hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','28');
    g.insertBefore(hit, g.firstChild);

    // 라벨 (정중앙)
    if (edge.label) {
      const lw = Math.max(50, edge.label.length * 10 + 20);
      const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
      bg.setAttribute('x', mx - lw/2); bg.setAttribute('y', my - 12);
      bg.setAttribute('width', lw);    bg.setAttribute('height', 22);
      bg.setAttribute('rx', 11);       bg.setAttribute('fill','#fff');
      bg.setAttribute('stroke', color); bg.setAttribute('stroke-width','1.5');
      g.appendChild(bg);
      const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x', mx); txt.setAttribute('y', my + 5);
      txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','11');
      txt.setAttribute('fill', color); txt.setAttribute('font-weight','700');
      txt.setAttribute('font-family','Noto Sans KR,sans-serif');
      txt.textContent = edge.label;
      g.appendChild(txt);
    }

    svgEdges.appendChild(g);
  });

}

function setupDiagramEvents() {
  const canvas = document.getElementById('diagram-canvas');
  const svgEl  = document.getElementById('diagram-svg');
  if (!canvas) return;

  // ── 공통 좌표 추출 ──────────────────────────────────────────
  function xy(e) {
    const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    return { x: t.clientX, y: t.clientY };
  }

  // ── 상태 ────────────────────────────────────────────────────
  let drag       = null;   // { id, offX, offY }
  let longTimer  = null;
  let moved      = false;
  let tapTimer   = null;
  let tapId      = null;

  // ── 노드 터치 시작 ───────────────────────────────────────────
  function nodeStart(e, nodeEl) {
    const id = nodeEl.dataset.id;
    const {x, y} = xy(e);

    // 첫 탭 → 선택, 선택된 노드 재탭 → 편집
    if (dgState.selectedNodeId === id) {
      // 이미 선택된 노드를 탭 → 편집 모달 열기 (짧게 탭했을 때만)
      tapId = id;
    } else {
      tapId = null;
    }

    // 드래그 offset 계산을 위해 node 미리 찾기
    const dg0   = getActiveDiagram();
    const node0 = (dg0?.nodes||[]).find(n => n.id === id);

    // 연결 모드 → 탭만으로 처리
    if (dgState.connecting) {
      if (!dgState.connectFrom) {
        dgState.connectFrom = id;
        nodeEl.style.outline = '3px solid var(--rust)';
        toast('연결할 두 번째 노드를 탭하세요');
      } else if (dgState.connectFrom !== id) {
        showConnectLabelModal(dgState.connectFrom, id);
        dgState.connectFrom = null;
        toggleConnectMode(false);
      }
      e.preventDefault(); return;
    }

    moved = false;
    dgState.selectedNodeId = id;
    updateDiagramSelectionToolbar();

    // 롱프레스 (800ms) → 컨텍스트 메뉴
    longTimer = setTimeout(() => {
      if (!moved) {
        drag = null;
        showNodeContextMenu(id, x, y);  // x,y는 화면좌표 (메뉴 위치용)
      }
    }, 800);

    // 드래그 준비
    const lpos = screenToLogic(x, y);
    // node0.x/y는 이미 논리좌표 → offset도 논리좌표 기준
    drag = { id, startX:x, startY:y, offX: lpos.x - (node0?.x ?? lpos.x), offY: lpos.y - (node0?.y ?? lpos.y) };
    nodeEl.style.zIndex = 100;
    e.preventDefault();
  }

  // ── 노드 이동 ────────────────────────────────────────────────
  function nodeMove(e) {
    if (!drag) return;
    const {x, y} = xy(e);
    if (!moved && Math.hypot(x - drag.startX, y - drag.startY) < 6) return;
    moved = true;
    clearTimeout(longTimer);
    const dgEnd  = getActiveDiagram();
    const nodeEnd2 = (dgEnd?.nodes||[]).find(n => n.id === drag.id);
    if (!nodeEnd2) return;
    const wrap = document.getElementById('dg-wrap');
    const lpos  = screenToLogic(x, y);
    const dg1   = getActiveDiagram();
    const nodeMv = (dg1?.nodes||[]).find(n => n.id === drag.id);
    if (!nodeMv) return;
    nodeMv.x = lpos.x - drag.offX;
    nodeMv.y = lpos.y - drag.offY;
    const el = document.getElementById('node-' + drag.id);
    if (el) {
      el.style.left = nodeMv.x + 'px';
      el.style.top  = nodeMv.y + 'px';
    }
    // 엣지만 빠르게 다시 그리기
    renderEdgesOnly();
    e.preventDefault();
  }

  // ── 노드 터치 끝 ─────────────────────────────────────────────
  function nodeEnd(e) {
    clearTimeout(longTimer);
    if (drag) {
      if (!moved) {
        // 짧은 탭
        if (tapId === drag.id) {
          // 이미 선택된 상태에서 탭 → 편집
          showEditNodeModal(drag.id);
        } else {
          // 첫 탭 → 선택
          dgState.selectedNodeId = drag.id;
          renderDiagramCanvas();
        }
        tapId = null;
      } else if (moved) {
        saveDiagram();
      }
      const el = document.getElementById('node-' + drag.id);
      if (el) { el.style.boxShadow = ''; el.style.zIndex = ''; }
      drag = null;
    }
  }

  // ── 캔버스 이벤트 등록 ───────────────────────────────────────
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) nodeStart(e, nodeEl);
    else { dgState.selectedNodeId = null; renderDiagramCanvas(); }
  }, {passive: false});

  canvas.addEventListener('touchmove',  nodeMove, {passive: false});
  canvas.addEventListener('touchend',   nodeEnd,  {passive: false});

  // 마우스 (PC)
  canvas.addEventListener('mousedown', e => {
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) nodeStart(e, nodeEl);
  });
  window.addEventListener('mousemove', e => { if (drag) nodeMove(e); });
  window.addEventListener('mouseup',   e => { if (drag) nodeEnd(e); });

  // PC 우클릭
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) showNodeContextMenu(nodeEl.dataset.id, e.clientX, e.clientY);
  });

  // ── 핀치 줌 + 두 손가락 패닝 ────────────────────────────────
  const wrapEl = document.getElementById('dg-wrap');
  if (wrapEl) {
    let mousePan = null;
    let touchPan = null;
    wrapEl.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('.dg-node')) return;
      mousePan = {x:e.clientX, y:e.clientY};
      wrapEl.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!mousePan) return;
      dgState.pan.x += e.clientX - mousePan.x;
      dgState.pan.y += e.clientY - mousePan.y;
      mousePan = {x:e.clientX, y:e.clientY};
      applyStage();
    });
    window.addEventListener('mouseup', () => {
      mousePan = null;
      wrapEl.style.cursor = '';
    });
    wrapEl.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = wrapEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const nextZoom = Math.max(0.3, Math.min(3, dgState.zoom * (1 - e.deltaY * 0.001)));
      const ratio = nextZoom / dgState.zoom;
      dgState.pan.x = x - (x - dgState.pan.x) * ratio;
      dgState.pan.y = y - (y - dgState.pan.y) * ratio;
      dgState.zoom = nextZoom;
      applyStage();
    }, {passive:false});
    let lastDist  = null;
    let lastMidX  = null, lastMidY  = null;
    let isPinching = false;

    function getTouchDist(e) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }
    function getTouchMid(e) {
      return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }

    wrapEl.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        isPinching = true;
        drag = null; // 드래그 취소
        touchPan = null;
        clearTimeout(longTimer);
        lastDist = getTouchDist(e);
        const mid = getTouchMid(e);
        lastMidX = mid.x; lastMidY = mid.y;
        e.preventDefault();
      } else if (e.touches.length === 1 && !e.target.closest('.dg-node')) {
        touchPan = {x:e.touches[0].clientX, y:e.touches[0].clientY};
      }
    }, {passive: false});

    wrapEl.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && isPinching) {
        e.preventDefault();
        const dist = getTouchDist(e);
        const mid  = getTouchMid(e);
        const wr   = wrapEl.getBoundingClientRect();

        const wr2 = wrapEl.getBoundingClientRect();
        // 줌: 중점 고정
        if (lastDist && lastDist > 0) {
          const ratio   = dist / lastDist;
          const newZoom = Math.max(0.3, Math.min(3, dgState.zoom * ratio));
          const mx = mid.x - wr2.left;
          const my = mid.y - wr2.top;
          dgState.pan.x = mx - (mx - dgState.pan.x) * (newZoom / dgState.zoom);
          dgState.pan.y = my - (my - dgState.pan.y) * (newZoom / dgState.zoom);
          dgState.zoom  = newZoom;
        }
        // 패닝
        if (lastMidX !== null) {
          dgState.pan.x += mid.x - lastMidX;
          dgState.pan.y += mid.y - lastMidY;
        }
        lastDist = dist; lastMidX = mid.x; lastMidY = mid.y;
        applyStage();
      } else if (e.touches.length === 1 && touchPan) {
        e.preventDefault();
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        dgState.pan.x += x - touchPan.x;
        dgState.pan.y += y - touchPan.y;
        touchPan = {x, y};
        applyStage();
      }
    }, {passive: false});

    wrapEl.addEventListener('touchend', e => {
      if (e.touches.length === 0) touchPan = null;
      if (e.touches.length < 2) {
        isPinching = false;
        lastDist = null; lastMidX = null; lastMidY = null;
      }
    }, {passive: true});
    wrapEl.addEventListener('touchcancel', () => { touchPan = null; }, {passive:true});
  }

  // ── 연결선 터치 — wrap 전체에서 감지 (SVG pointer-events 우회) ──
  const wrap = document.getElementById('dg-wrap');
  if (wrap) {
    let edgeIndex = -1;
    let edgeMoved = false;
    let edgeTouchX = 0, edgeTouchY = 0;

    wrap.addEventListener('touchstart', e => {
      // 노드 위면 무시 (노드 이벤트가 처리)
      edgeIndex = -1;
      if (e.touches.length !== 1 || e.target.closest('.dg-node')) return;
      edgeMoved = false;
      edgeTouchX = e.touches[0].clientX;
      edgeTouchY = e.touches[0].clientY;

      // 터치 좌표와 가장 가까운 엣지 찾기
      const dg = getActiveDiagram();
      if (!dg || !dg.edges || dg.edges.length === 0) return;
      edgeIndex = findDiagramEdgeAt(edgeTouchX, edgeTouchY, 20);
    }, {passive: true});

    wrap.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) { edgeIndex = -1; return; }
      const dx = e.touches[0].clientX - edgeTouchX;
      const dy = e.touches[0].clientY - edgeTouchY;
      if (Math.hypot(dx,dy) > 8) edgeMoved = true;
    }, {passive: true});

    wrap.addEventListener('touchend', e => {
      if (e.touches.length === 0 && edgeIndex >= 0 && !edgeMoved) showEditEdgeModal(edgeIndex);
      edgeIndex = -1;
    }, {passive: true});
    wrap.addEventListener('touchcancel', () => { edgeIndex = -1; }, {passive: true});

    // 연결선은 더블클릭으로 편집한다. 노드는 두 번째 클릭에서 열리므로 중복 실행하지 않는다.
    wrap.addEventListener('dblclick', e => {
      const nodeEl = e.target.closest('.dg-node');
      if (nodeEl) return;
      const dg = getActiveDiagram();
      if (!dg || !dg.edges || dg.edges.length === 0) return;
      const closestIdx = findDiagramEdgeAt(e.clientX, e.clientY, 20);
      if (closestIdx >= 0) showEditEdgeModal(closestIdx);
    });
  }
}

function renderEdgesOnly() {
  const dg = getActiveDiagram();
  if (!dg) return;
  const svgEdges = document.getElementById('svg-edges');
  if (!svgEdges) return;

  const COLORS = ['#235f62','#c4922a','#b5451b','#3949ab','#7b1fa2','#555555'];
  let defs = '<defs>';
  COLORS.forEach(c => {
    const id = c.replace('#','');
    defs += `<marker id="ae-${id}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
    defs += `<marker id="as-${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
  });
  defs += '</defs>';
  svgEdges.innerHTML = defs;

  function ep(node, toX, toY, off) {
    const el=document.getElementById('node-'+node.id);
    const hw=el?el.offsetWidth/2:90, hh=el?el.offsetHeight/2:38;
    const cx=node.x+hw, cy=node.y+hh;
    const dx=toX-cx, dy=toY-cy;
    if(!dx&&!dy) return{x:cx,y:cy};
    const s=Math.min(dx?90/Math.abs(dx):1e9, dy?38/Math.abs(dy):1e9);
    const ex=cx+dx*s, ey=cy+dy*s;
    if(off>0){const l=Math.sqrt(dx*dx+dy*dy)||1;return{x:ex-dx/l*off,y:ey-dy/l*off};}
    return{x:ex,y:ey};
  }

  (dg.edges||[]).forEach(edge => {
    const fn = (dg.nodes||[]).find(n=>n.id===edge.from);
    const tn = (dg.nodes||[]).find(n=>n.id===edge.to);
    if(!fn||!tn) return;
    const color=edge.color||'#235f62', dir=edge.dir||'forward', cid=color.replace('#','');
    const fe=document.getElementById('node-'+fn.id), te=document.getElementById('node-'+tn.id);
    const fcx=fn.x+(fe?fe.offsetWidth/2:90), fcy=fn.y+(fe?fe.offsetHeight/2:38);
    const tcx=tn.x+(te?te.offsetWidth/2:90), tcy=tn.y+(te?te.offsetHeight/2:38);
    const he=dir==='forward'||dir==='both', hs=dir==='both';
    const fp=ep(fn,tcx,tcy,hs?13:0), tp=ep(tn,fcx,fcy,he?13:0);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',fp.x); line.setAttribute('y1',fp.y);
    line.setAttribute('x2',tp.x); line.setAttribute('y2',tp.y);
    line.setAttribute('stroke',color); line.setAttribute('stroke-width','2.5');
    if(edge.style==='dashed') line.setAttribute('stroke-dasharray','8,5');
    if(he) line.setAttribute('marker-end',`url(#ae-${cid})`);
    if(hs) line.setAttribute('marker-start',`url(#as-${cid})`);
    svgEdges.appendChild(line);
  });
}



function resetView() {
  const dg = getActiveDiagram();
  const wrap = document.getElementById('dg-wrap');
  if (!dg || !wrap) return;
  const nodes = dg.nodes || [];
  if (!nodes.length) {
    dgState.pan = {x:0, y:0};
    dgState.zoom = 1;
    applyStage();
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    const el = document.getElementById('node-' + node.id);
    const width = el?.offsetWidth || 180;
    const height = el?.offsetHeight || 76;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + width);
    maxY = Math.max(maxY, node.y + height);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const viewWidth = wrap.clientWidth || wrap.offsetWidth;
  const viewHeight = wrap.clientHeight || wrap.offsetHeight;
  if (!viewWidth || !viewHeight) return;
  dgState.zoom = Math.max(0.3, Math.min(1, (viewWidth - 64) / width, (viewHeight - 64) / height));
  dgState.pan = {
    x: (viewWidth - width * dgState.zoom) / 2 - minX * dgState.zoom,
    y: (viewHeight - height * dgState.zoom) / 2 - minY * dgState.zoom
  };
  applyStage();
}
function clearSelection() { dgState.selectedNodeId=null; renderDiagramCanvas(); }
function updateDiagramSelectionToolbar() {
  const button = document.getElementById('btn-edit-node');
  if (!button) return;
  const node = (getActiveDiagram()?.nodes || []).find(item => item.id === dgState.selectedNodeId);
  button.disabled = !node;
  button.textContent = node ? `${node.label} 편집` : '선택한 노드 편집';
}
function editSelectedDiagramNode() {
  if (dgState.selectedNodeId) showEditNodeModal(dgState.selectedNodeId);
}

function toggleConnectMode(force) {
  dgState.connecting = force !== undefined ? force : !dgState.connecting;
  dgState.connectFrom = null;
  const btn = document.getElementById('btn-connect');
  if (btn) {
    btn.style.background = dgState.connecting ? 'var(--teal)' : '';
    btn.style.color = dgState.connecting ? '#fff' : '';
    btn.style.borderColor = dgState.connecting ? 'var(--teal)' : '';
  }
  if (dgState.connecting) toast('연결할 첫 번째 노드를 탭하세요');
}

function deleteEdge(idx) {
  const dg = getActiveDiagram();
  if (!dg) return;
  dg.edges.splice(idx,1);
  saveDiagram(); renderDiagramCanvas();
}

function showEditEdgeModal(idx) {
  dgState.selectedEdgeIdx = idx;
  renderDiagramCanvas();
  const dg = getActiveDiagram();
  const edge = dg?.edges?.[idx];
  if (!edge) return;
  showModal(`
    <div class="modal-title">연결선 편집</div>
    <div style="margin-bottom:14px">
      <label class="label">설명</label>
      <input id="ee-label" value="${esc(edge.label||'')}" placeholder="예: 연인, 라이벌">
    </div>
    <div style="margin-bottom:14px">
      <label class="label">화살표 방향</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="ee-dir-group">
        ${[{v:'forward',l:'단방향 →'},{v:'both',l:'양방향 ↔'},{v:'none',l:'방향 없음 ─'}].map(t=>{
          const sel=(edge.dir||'forward')===t.v;
          return `<button type="button" onclick="selectEdgeOpt('ee-dir-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${sel?'var(--gold-light)':'transparent'};color:${sel?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label class="label">선 스타일</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="ee-style-group">
        ${[{v:'solid',l:'실선 ─────'},{v:'dashed',l:'점선 ╌╌╌╌╌'},{v:'cut',l:'절단 ─ ✕ ─'}].map(t=>{
          const sel=(edge.style||'solid')===t.v;
          return `<button type="button" onclick="selectEdgeOpt('ee-style-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${sel?'var(--gold-light)':'transparent'};color:${sel?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:20px">
      <label class="label">선 색상</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        ${[{v:'#235f62',l:'초록'},{v:'#c4922a',l:'금색'},{v:'#b5451b',l:'빨강'},{v:'#3949ab',l:'파랑'},{v:'#7b1fa2',l:'보라'},{v:'#555555',l:'회색'}].map(c=>`
          <label style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:var(--muted)">
            <input type="radio" name="ee-color" value="${c.v}" ${(edge.color||'#235f62')===c.v?'checked':''} style="display:none">
            <div style="width:28px;height:28px;border-radius:50%;background:${c.v};border:3px solid ${(edge.color||'#235f62')===c.v?'var(--gold)':'transparent'};transition:border-color .15s"
              onclick="document.querySelectorAll('[name=ee-color]').forEach(r=>r.parentNode.querySelector('div').style.borderColor='transparent');this.style.borderColor='var(--gold)'">
            </div>
            ${c.l}
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="deleteEdge(${idx});closeModal()">삭제</button>
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveEdge(${idx})">저장</button>
    </div>`, false);
}

function saveEdge(idx) {
  const dg = getActiveDiagram();
  const edge = dg?.edges?.[idx];
  if (!edge) return;
  edge.label = document.getElementById('ee-label').value.trim();
  edge.dir   = document.querySelector('#ee-dir-group button[data-selected]')?.dataset.val||'forward';
  edge.style = document.querySelector('#ee-style-group button[data-selected]')?.dataset.val||'solid';
  edge.color = document.querySelector('input[name="ee-color"]:checked')?.value||'#235f62';
  saveDiagram(); closeModal(); renderDiagramCanvas();
}

function deleteNode(id) {
  confirmDialog('이 노드를 삭제합니다.', () => {
  const dg = getActiveDiagram();
  if (!dg) return;
  dg.nodes = (dg.nodes||[]).filter(n=>n.id!==id);
  dg.edges = (dg.edges||[]).filter(e=>e.from!==id&&e.to!==id);
  dgState.selectedNodeId=null;
  saveDiagram(); renderDiagramCanvas();
  });
}

// ── 모달들 ──
function showNewDiagramModal() {
  showModal(`
    <div class="modal-title">새 다이어그램</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="dg-name" placeholder="예: 주요 인물 관계도"></div>
    <div style="margin-bottom:20px"><label class="label">종류</label>
      <select id="dg-type">${DG_DIAGRAM_TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="createDiagram()">만들기</button>
    </div>`);
  setTimeout(()=>document.getElementById('dg-name')?.focus(),100);
}

function createDiagram() {
  const name = document.getElementById('dg-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  const dg = { id:uid(), name, type:document.getElementById('dg-type').value, nodes:[], edges:[] };
  p.diagrams.push(dg);
  dgState.activeDiagramId = dg.id;
  saveDiagram(); closeModal(); renderDiagram();
}

function deleteActiveDiagram() {
  confirmDialog('이 다이어그램을 삭제합니다.', () => {
    const p = getProject();
    p.diagrams = (p.diagrams||[]).filter(d=>d.id!==dgState.activeDiagramId);
    dgState.activeDiagramId = p.diagrams[0]?.id || null;
    saveDiagram(); renderDiagram();
  });
}

function showAddNodeModal() {
  const dg = getActiveDiagram();
  if (!dg) return;
  showModal(`
    <div class="modal-title">노드 추가</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="nd-label" placeholder="노드 이름"></div>
    <div style="margin-bottom:12px"><label class="label">종류</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="nd-type-group">
        ${DG_TYPES.map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('nd-type-group',this,'${t.id}')"
            data-val="${t.id}" ${i===0?'data-selected="1"':''}
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};
              border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:'Noto Sans KR',sans-serif;text-align:center;
              background:${i===0?'var(--gold-light)':'transparent'};
              color:${i===0?'var(--gold)':'var(--muted)'};transition:all .15s">
            ${t.icon} ${t.label}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px"><label class="label">부제 (선택)</label>
      <input id="nd-sub" placeholder="예: 주인공, 악역, 왕국..."></div>
    <div style="margin-bottom:20px">
      <label class="label">노드 색상 (선택)</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="nd-color-group">
        ${DG_COLORS.map((c,i)=>`
          <button type="button" onclick="selectEdgeOpt('nd-color-group',this,'${c.v}')"
            data-val="${c.v}" ${i===0?'data-selected="1"':''}
            title="${c.label}"
            style="width:34px;height:34px;border-radius:50%;cursor:pointer;transition:all .18s;
              background:${c.v};
              border:3px solid ${i===0?'#c4922a':c.border};
              box-shadow:0 2px 6px rgba(0,0,0,.18)">
          </button>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="addNode()">추가</button>
    </div>`);
  setTimeout(()=>document.getElementById('nd-label')?.focus(),100);
}

function addNode() {
  const label = document.getElementById('nd-label').value.trim();
  if (!label) { toast('이름을 입력해주세요.'); return; }
  const type = document.querySelector('#nd-type-group button[data-selected]')?.dataset.val || 'idea';
  const sub = document.getElementById('nd-sub').value.trim();
  const dg = getActiveDiagram();
  const wrap = document.getElementById('dg-wrap');
  const cx = wrap ? (wrap.offsetWidth/2 - dgState.pan.x) / dgState.zoom - 90 : 200;
  const cy = wrap ? (wrap.offsetHeight/2 - dgState.pan.y) / dgState.zoom - 30 : 150;
  if (!dg.nodes) dg.nodes = [];
  const color = document.querySelector('#nd-color-group button[data-selected]')?.dataset.val || '#f0e9d8';
  dg.nodes.push({ id:uid(), label, type, sub, color, x:cx + (Math.random()-0.5)*80, y:cy + (Math.random()-0.5)*80 });
  saveDiagram(); closeModal(); renderDiagramCanvas();
  toast('노드가 추가됐어요!');
}

function showEditNodeModal(id) {
  const dg = getActiveDiagram();
  const node = (dg?.nodes||[]).find(n=>n.id===id);
  if (!node) return;
  showModal(`
    <div class="modal-title">노드 편집</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="nd-label" value="${esc(node.label)}" placeholder="노드 이름"></div>
    <div style="margin-bottom:12px"><label class="label">종류</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="nd-type-group">
        ${DG_TYPES.map(t=>{
          const sel = t.id===node.type;
          return `<button type="button" onclick="selectEdgeOpt('nd-type-group',this,'${t.id}')"
            data-val="${t.id}" ${sel?'data-selected="1"':''}
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};
              border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:'Noto Sans KR',sans-serif;text-align:center;
              background:${sel?'var(--gold-light)':'transparent'};
              color:${sel?'var(--gold)':'var(--muted)'};transition:all .15s">
            ${t.icon} ${t.label}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px"><label class="label">부제 (선택)</label>
      <input id="nd-sub" value="${esc(node.sub||'')}" placeholder="예: 주인공, 악역..."></div>
    <div style="margin-bottom:20px">
      <label class="label">노드 색상</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="nd-color-group">
        ${DG_COLORS.map(c=>{
          const sel=(node.color||'#f0e9d8')===c.v;
          return `<button type="button" onclick="selectEdgeOpt('nd-color-group',this,'${c.v}')"
            data-val="${c.v}" ${sel?'data-selected="1"':''}
            title="${c.label}"
            style="width:34px;height:34px;border-radius:50%;cursor:pointer;transition:all .18s;
              background:${c.v};
              border:3px solid ${sel?'#c4922a':c.border};
              box-shadow:0 2px 6px rgba(0,0,0,.18)">
          </button>`;}).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="deleteNode('${id}');closeModal()">삭제</button>
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="editNode('${id}')">저장</button>
    </div>`, false);
}

function editNode(id) {
  const label = document.getElementById('nd-label').value.trim();
  if (!label) { toast('이름을 입력해주세요.'); return; }
  const dg = getActiveDiagram();
  const node = (dg?.nodes||[]).find(n=>n.id===id);
  if (!node) return;
  node.label = label;
  node.type  = document.querySelector('#nd-type-group button[data-selected]')?.dataset.val || node.type;
  node.sub   = document.getElementById('nd-sub').value.trim();
  node.color = document.querySelector('#nd-color-group button[data-selected]')?.dataset.val || node.color || 'default';
  saveDiagram(); closeModal(); renderDiagramCanvas();
}

function showConnectLabelModal(fromId, toId) {
  showModal(`
    <div class="modal-title">연결선 설정</div>
    <div style="margin-bottom:14px">
      <label class="label">설명 (선택)</label>
      <input id="edge-label" placeholder="예: 연인, 라이벌, 스승, 원인→결과">
    </div>
    <div style="margin-bottom:14px">
      <label class="label">화살표 방향</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="edge-dir-group">
        ${[{v:'forward',l:'단방향 →'},{v:'both',l:'양방향 ↔'},{v:'none',l:'방향 없음 ─'}].map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('edge-dir-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${i===0?'var(--gold-light)':'transparent'};color:${i===0?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label class="label">선 스타일</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="edge-style-group">
        ${[{v:'solid',l:'실선 ─────'},{v:'dashed',l:'점선 ╌╌╌╌╌'},{v:'cut',l:'절단 ─ ✕ ─'}].map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('edge-style-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${i===0?'var(--gold-light)':'transparent'};color:${i===0?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:20px">
      <label class="label">선 색상</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        ${[
          {v:'#235f62',label:'초록',bg:'#235f62'},
          {v:'#c4922a',label:'금색',bg:'#c4922a'},
          {v:'#b5451b',label:'빨강',bg:'#b5451b'},
          {v:'#3949ab',label:'파랑',bg:'#3949ab'},
          {v:'#7b1fa2',label:'보라',bg:'#7b1fa2'},
          {v:'#555555',label:'회색',bg:'#555555'},
        ].map((c,i)=>`
          <label style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:var(--muted)">
            <input type="radio" name="edge-color" value="${c.v}" ${i===0?'checked':''} style="display:none">
            <div style="width:28px;height:28px;border-radius:50%;background:${c.bg};border:3px solid transparent;transition:border-color .15s"
              onclick="document.querySelectorAll('[name=edge-color]').forEach(r=>r.parentNode.querySelector('div').style.borderColor='transparent');this.style.borderColor='var(--gold)'">
            </div>
            ${c.label}
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="addEdge('${fromId}','${toId}')">연결</button>
    </div>`);
  setTimeout(()=>document.getElementById('edge-label')?.focus(),100);
}

function addEdge(fromId, toId) {
  const label = document.getElementById('edge-label')?.value.trim()||'';
  const dir = document.querySelector('#edge-dir-group button[data-selected]')?.dataset.val||'forward';
  const style = document.querySelector('#edge-style-group button[data-selected]')?.dataset.val||'solid';
  const color = document.querySelector('input[name="edge-color"]:checked')?.value||'#235f62';
  const dg = getActiveDiagram();
  if (!dg.edges) dg.edges = [];
  dg.edges.push({from:fromId, to:toId, label, dir, style, color});
  saveDiagram(); closeModal(); renderDiagramCanvas();
  toast('연결됐어요!');
}

function showNodeContextMenu(id, x, y) {
  const existing = document.getElementById('node-ctx-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.id = 'node-ctx-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:var(--white);
    border:1px solid var(--border);border-radius:10px;padding:6px;
    box-shadow:0 4px 20px var(--shadow);z-index:9000;min-width:130px`;
  menu.innerHTML = `
    <button onclick="showEditNodeModal('${id}');document.getElementById('node-ctx-menu')?.remove()"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:'Noto Sans KR',sans-serif">✏️ 편집</button>
    <button onclick="dgState.connecting=true;dgState.connectFrom='${id}';document.getElementById('node-ctx-menu')?.remove();toast('연결할 노드를 탭하세요')"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:'Noto Sans KR',sans-serif">🔗 연결하기</button>
    <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">
    <button onclick="deleteNode('${id}');document.getElementById('node-ctx-menu')?.remove()"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;color:var(--rust);font-family:'Noto Sans KR',sans-serif">🗑️ 삭제</button>
  `;
  document.body.appendChild(menu);
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),50);
}


// ═══════════════════════════════════════════════════════════════
