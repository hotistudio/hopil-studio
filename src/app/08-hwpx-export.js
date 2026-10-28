// 한글에서 편집 가능한 HWPX. 한컴 형식의 빈 문서를 서식 템플릿으로 사용한다.
const HWPX_NS = {
  hp: 'http://www.hancom.co.kr/hwpml/2011/paragraph',
  hh: 'http://www.hancom.co.kr/hwpml/2011/head',
  hc: 'http://www.hancom.co.kr/hwpml/2011/core',
  opf: 'http://www.idpf.org/2007/opf/'
};

const HWPX_STYLES = {
  default: { font: 1, color: '#302920', paper: '#FFFFFF', line: 200, margin: 8504 },
  kakao: { font: 0, color: '#2C2925', paper: '#FFFDF7', line: 190, margin: 5668 },
  ridi: { font: 1, color: '#302920', paper: '#F9F3E8', line: 205, margin: 5102 },
  naver: { font: 0, color: '#202A24', paper: '#FFFFFF', line: 185, margin: 5385 }
};

function hwpxParse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('HWPX XML을 읽지 못했습니다.');
  return doc;
}

function hwpxFirst(node, ns, name) {
  const found = node.getElementsByTagNameNS(ns, name)[0];
  if (!found) throw new Error(`HWPX 서식이 없습니다: ${name}`);
  return found;
}

function hwpxCleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function hwpxPrepareFiles(template, project, chapters) {
  const files = { ...template };
  const style = HWPX_STYLES[readerStyle] || HWPX_STYLES.default;
  const size = Math.max(12, Math.min(28, Number(editorFontSize) || 16));
  const header = hwpxParse(files['Contents/header.xml']);
  // 화면에서 쓰는 Noto 글꼴 이름을 문서에도 지정한다. 설치되지 않은 PC에서는 한글이 대체 글꼴을 사용한다.
  for (const fontface of header.getElementsByTagNameNS(HWPX_NS.hh, 'fontface')) {
    for (const font of fontface.getElementsByTagNameNS(HWPX_NS.hh, 'font')) {
      const id = font.getAttribute('id');
      if (id === '0') font.setAttribute('face', 'Noto Sans KR');
      if (id === '1') font.setAttribute('face', 'Noto Serif KR');
    }
  }
  const charProperties = hwpxFirst(header, HWPX_NS.hh, 'charProperties');
  const bodyChar = Array.from(charProperties.children).find(el => el.getAttribute('id') === '0');
  if (!bodyChar) throw new Error('HWPX 본문 서식이 없습니다.');
  bodyChar.setAttribute('height', String(Math.round(size * 75))); // CSS px → 1/100 pt
  bodyChar.setAttribute('textColor', style.color);
  const fontRef = hwpxFirst(bodyChar, HWPX_NS.hh, 'fontRef');
  for (const attr of fontRef.getAttributeNames()) fontRef.setAttribute(attr, String(style.font));

  const headingChar = bodyChar.cloneNode(true);
  const headingId = Math.max(...Array.from(charProperties.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
  headingChar.setAttribute('id', String(headingId));
  headingChar.setAttribute('height', String(Math.round(size * 75 * 1.3)));
  headingChar.appendChild(header.createElementNS(HWPX_NS.hh, 'hh:bold'));
  charProperties.appendChild(headingChar);
  charProperties.setAttribute('itemCnt', String(charProperties.children.length));

  const paraProperties = hwpxFirst(header, HWPX_NS.hh, 'paraProperties');
  const bodyPara = Array.from(paraProperties.children).find(el => el.getAttribute('id') === '0');
  if (!bodyPara) throw new Error('HWPX 문단 서식이 없습니다.');
  hwpxFirst(bodyPara, HWPX_NS.hh, 'lineSpacing').setAttribute('value', String(style.line));
  const headingPara = bodyPara.cloneNode(true);
  const headingParaId = Math.max(...Array.from(paraProperties.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
  headingPara.setAttribute('id', String(headingParaId));
  hwpxFirst(headingPara, HWPX_NS.hh, 'align').setAttribute('horizontal', 'LEFT');
  paraProperties.appendChild(headingPara);
  paraProperties.setAttribute('itemCnt', String(paraProperties.children.length));

  if (style.paper !== '#FFFFFF') {
    const borderFills = hwpxFirst(header, HWPX_NS.hh, 'borderFills');
    const pageFill = Array.from(borderFills.children).find(el => el.getAttribute('id') === '1');
    if (!pageFill) throw new Error('HWPX 용지 서식이 없습니다.');
    const tintedFill = pageFill.cloneNode(true);
    const fillId = Math.max(...Array.from(borderFills.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
    tintedFill.setAttribute('id', String(fillId));
    const brush = header.createElementNS(HWPX_NS.hc, 'hc:fillBrush');
    const color = header.createElementNS(HWPX_NS.hc, 'hc:winBrush');
    color.setAttribute('faceColor', style.paper);
    color.setAttribute('hatchColor', '#000000');
    color.setAttribute('alpha', '0');
    brush.appendChild(color);
    tintedFill.appendChild(brush);
    borderFills.appendChild(tintedFill);
    borderFills.setAttribute('itemCnt', String(borderFills.children.length));
    files._pageFillId = String(fillId);
  }
  files['Contents/header.xml'] = new XMLSerializer().serializeToString(header);

  const section = hwpxParse(files['Contents/section0.xml']);
  const root = section.documentElement;
  const firstPara = hwpxFirst(root, HWPX_NS.hp, 'p');
  const secPr = hwpxFirst(firstPara, HWPX_NS.hp, 'secPr');
  const pagePr = hwpxFirst(secPr, HWPX_NS.hp, 'pagePr');
  const margin = hwpxFirst(pagePr, HWPX_NS.hp, 'margin');
  margin.setAttribute('left', String(style.margin));
  margin.setAttribute('right', String(style.margin));
  if (files._pageFillId) {
    for (const fill of secPr.getElementsByTagNameNS(HWPX_NS.hp, 'pageBorderFill')) {
      fill.setAttribute('borderFillIDRef', files._pageFillId);
    }
    delete files._pageFillId;
  }
  for (const run of Array.from(firstPara.getElementsByTagNameNS(HWPX_NS.hp, 'run')).slice(1)) run.remove();
  for (const lineseg of Array.from(firstPara.getElementsByTagNameNS(HWPX_NS.hp, 'linesegarray'))) lineseg.remove();
  firstPara.setAttribute('paraPrIDRef', String(headingParaId));

  let nextId = 1;
  function addText(para, text, charId) {
    const run = section.createElementNS(HWPX_NS.hp, 'hp:run');
    run.setAttribute('charPrIDRef', String(charId));
    const t = section.createElementNS(HWPX_NS.hp, 'hp:t');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = hwpxCleanText(text);
    run.appendChild(t);
    para.appendChild(run);
  }
  function addPara(text, heading = false) {
    const para = section.createElementNS(HWPX_NS.hp, 'hp:p');
    para.setAttribute('id', String(nextId++));
    para.setAttribute('paraPrIDRef', String(heading ? headingParaId : 0));
    para.setAttribute('styleIDRef', '0');
    para.setAttribute('pageBreak', '0');
    para.setAttribute('columnBreak', '0');
    para.setAttribute('merged', '0');
    addText(para, text, heading ? headingId : 0);
    root.appendChild(para);
  }
  addText(firstPara, project.title || '제목 없음', headingId);
  for (const chapter of chapters) {
    addPara('', false);
    addPara(chapter.title || '제목 없음', true);
    for (const line of String(chapter.content || '').split(/\r\n|\n|\r/)) addPara(line, false);
  }
  files['Contents/section0.xml'] = new XMLSerializer().serializeToString(section);

  const content = hwpxParse(files['Contents/content.hpf']);
  hwpxFirst(content, HWPX_NS.opf, 'title').textContent = hwpxCleanText(project.title || '제목 없음');
  files['Contents/content.hpf'] = new XMLSerializer().serializeToString(content);
  return files;
}

// 저장 방식 ZIP 작성기. 외부 스크립트 없이 오프라인에서도 내보낼 수 있다.
function hwpxZip(files) {
  const encoder = new TextEncoder();
  const parts = [], directory = [];
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    table[i] = crc >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function header(length) { return new DataView(new ArrayBuffer(length)); }
  function bytes(view) { return new Uint8Array(view.buffer); }
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = encoder.encode(name), data = encoder.encode(text);
    const crc = crc32(data);
    const local = header(30);
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, path.length, true);
    parts.push(bytes(local), path, data);
    directory.push({ path, data, crc, offset });
    offset += 30 + path.length + data.length;
  }
  const directoryOffset = offset;
  for (const entry of directory) {
    const central = header(46);
    central.setUint32(0, 0x02014B50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, entry.crc, true);
    central.setUint32(20, entry.data.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, entry.path.length, true);
    central.setUint32(42, entry.offset, true);
    parts.push(bytes(central), entry.path);
    offset += 46 + entry.path.length;
  }
  const end = header(22);
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, directory.length, true);
  end.setUint16(10, directory.length, true);
  end.setUint32(12, offset - directoryOffset, true);
  end.setUint32(16, directoryOffset, true);
  parts.push(bytes(end));
  return new Blob(parts, { type: 'application/hwp+zip' });
}

async function exportHwpx(chId) {
  const project = getProject();
  const chapters = chId ? (project.chapters || []).filter(ch => ch.id === chId) : (project.chapters || []);
  if (!chapters.length) { toast('내보낼 화가 없습니다.'); return; }
  try {
    const response = await fetch('./assets/hwpx-template.json');
    if (!response.ok) throw new Error('서식 템플릿을 읽지 못했습니다.');
    const template = await response.json();
    const blob = hwpxZip(hwpxPrepareFiles(template, project, chapters));
    const filename = (project.title || '작품') + (chId ? '_' + chapters[0].title : '_전체') + '.hwpx';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    toast('화면 양식을 적용한 HWPX 파일이 저장됐어요! 📖');
  } catch (error) {
    console.error('HWPX export failed', error);
    toast('HWPX 저장에 실패했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
}
