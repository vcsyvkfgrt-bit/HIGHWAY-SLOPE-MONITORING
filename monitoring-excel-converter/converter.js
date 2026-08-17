const SURFACE_SHEET = '地表位移监测点';
const SETTLEMENT_SHEET = '沉降监测点';

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const statusBox = document.getElementById('status');
const resultsBox = document.getElementById('results');
const batchActionsBox = document.getElementById('batchActions');
const segmentRulesInput = document.getElementById('segmentRules');
let currentOutputs = [];
let currentFailures = [];

function setStatus(type, text) {
  statusBox.className = `status ${type}`;
  statusBox.textContent = text;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = normalizeText(value);
  if (!text) return '';
  const cleaned = text.replace(/[年月.]/g, '/').replace(/[日号]/g, '').replace(/-/g, '/');
  const match = cleaned.match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/) || cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return '';
  let y;
  let m;
  let d;
  if (match[1].length === 4) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    y = Number(match[3]);
    if (y < 100) y += 2000;
    m = Number(match[1]);
    d = Number(match[2]);
  }
  if (!y || !m || !d || m > 12 || d > 31) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(normalizeText(value).replace(/,/g, ''));
  return Number.isFinite(num) ? Number(num.toFixed(4)) : null;
}

function pointNumberToken(name) {
  const match = normalizeText(name).match(/(\d+)\D*$/);
  return match ? String(Number(match[1])) : '';
}

function normalizePointName(name) {
  const raw = normalizeText(name);
  if (!raw) return '';
  return raw.replace(/#/g, '').replace(/HP-/i, 'BP-').replace(/BKO-/i, 'BK0-');
}

function normalizeSegmentName(name) {
  const text = normalizeText(name).toUpperCase().replace(/\s+/g, '');
  if (!text) return '';
  const match = text.match(/SYXCTJ[-_—－]?([123])/i);
  if (match) return `SYXCTJ-${match[1]}标`;
  const simple = text.match(/^([123])标$/);
  if (simple) return `SYXCTJ-${simple[1]}标`;
  return normalizeText(name);
}

function defaultSegmentRules() {
  return [
    { segment: 'SYXCTJ-1标', patterns: ['SYXCTJ-1', 'SYXCTJ1', 'TJ-1', 'TJ1', '1标'] },
    { segment: 'SYXCTJ-2标', patterns: ['SYXCTJ-2', 'SYXCTJ2', 'TJ-2', 'TJ2', '2标'] },
    { segment: 'SYXCTJ-3标', patterns: ['SYXCTJ-3', 'SYXCTJ3', 'TJ-3', 'TJ3', '3标'] },
  ];
}

function parseSegmentRules(text) {
  const rules = defaultSegmentRules();
  const lines = normalizeText(text).split(/[;\n]/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/[:：=]/);
    if (parts.length < 2) continue;
    const segment = normalizeSegmentName(parts[0]);
    const patterns = parts.slice(1).join(':').split(/[,，、|]/).map((item) => normalizeText(item)).filter(Boolean);
    if (segment && patterns.length) rules.unshift({ segment, patterns });
  }
  return rules;
}

function detectSegmentFromText(text, rules) {
  const source = normalizeText(text).toUpperCase();
  if (!source) return '';
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => source.includes(normalizeText(pattern).toUpperCase()))) {
      return normalizeSegmentName(rule.segment);
    }
  }
  return '';
}

function inferRecordSegment(record, context, rules) {
  return detectSegmentFromText([
    record.segment,
    record.point,
    context?.sourceSheet,
    context?.sourceName,
  ].filter(Boolean).join(' '), rules) || '未识别标段';
}

function sortPoints(points) {
  return [...points].sort((a, b) => {
    const na = Number(pointNumberToken(a));
    const nb = Number(pointNumberToken(b));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, 'zh-Hans-CN');
  });
}

function rowsToSheet(records) {
  const dateMap = new Map();
  const pointSet = new Set();
  for (const record of records) {
    if (!record.date || !record.point) continue;
    pointSet.add(record.point);
    if (!dateMap.has(record.date)) dateMap.set(record.date, new Map());
    dateMap.get(record.date).set(record.point, record.value);
  }
  const points = sortPoints(pointSet);
  const dates = [...dateMap.keys()].sort();
  const rows = [['监测日期', ...points, '备注']];
  for (const date of dates) {
    const values = dateMap.get(date);
    rows.push([date, ...points.map((point) => values.has(point) ? values.get(point) : ''), '']);
  }
  return rows;
}

function aoaFromSheet(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
}

function parsePointRowsDateColumns(rows, type) {
  if (!rows.length) return [];
  const header = rows[0] || [];
  const dates = header.map(normalizeDate);
  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    const point = normalizePointName(rows[r]?.[0]);
    if (!point) continue;
    for (let c = 1; c < header.length; c += 1) {
      if (!dates[c]) continue;
      const value = parseNumber(rows[r]?.[c]);
      if (value == null) continue;
      records.push({ type, date: dates[c], point, value });
    }
  }
  return records;
}

function parsePerPointBlocks(rows) {
  const records = [];
  const markerRow = rows[2] || [];
  for (let start = 0; start < markerRow.length; start += 1) {
    if (normalizeText(markerRow[start]) !== '测点编号') continue;
    const point = normalizePointName(markerRow[start + 1]);
    if (!point) continue;
    const dateCol = start + 1;
    const surfaceCol = start + 8;
    const settlementCol = start + 11;
    for (let r = 5; r < rows.length; r += 1) {
      const date = normalizeDate(rows[r]?.[dateCol]);
      if (!date) continue;
      const surface = parseNumber(rows[r]?.[surfaceCol]);
      const settlement = parseNumber(rows[r]?.[settlementCol]);
      if (surface != null) records.push({ type: SURFACE_SHEET, date, point, value: surface });
      if (settlement != null) records.push({ type: SETTLEMENT_SHEET, date, point, value: settlement });
    }
  }
  return records;
}

function parseWideResultTable(rows) {
  const records = [];
  for (let start = 0; start < (rows[2] || []).length; start += 1) {
    if (normalizeText(rows[2]?.[start]) !== '测点编号') continue;
    const title = normalizeText(rows[1]?.[start]);
    const type = title.includes('沉降') ? SETTLEMENT_SHEET : SURFACE_SHEET;
    const points = [];
    for (let c = start + 1; c < (rows[2] || []).length; c += 1) {
      const name = normalizePointName(rows[2]?.[c]);
      if (!name) break;
      points.push({ name, col: c });
    }
    if (!points.length) continue;
    for (let r = 4; r < rows.length; r += 1) {
      const date = normalizeDate(rows[r]?.[start]);
      if (!date) continue;
      for (const point of points) {
        const value = parseNumber(rows[r]?.[point.col]);
        if (value != null) records.push({ type, date, point: point.name, value });
      }
    }
  }
  return records;
}

function groupedByType(records) {
  return {
    [SURFACE_SHEET]: records.filter((row) => row.type === SURFACE_SHEET),
    [SETTLEMENT_SHEET]: records.filter((row) => row.type === SETTLEMENT_SHEET),
  };
}

function groupedBySegmentAndType(records, context, rules) {
  const segmentMap = new Map();
  for (const record of records) {
    const segment = inferRecordSegment(record, context, rules);
    if (!segmentMap.has(segment)) segmentMap.set(segment, []);
    segmentMap.get(segment).push({ ...record, segment });
  }
  return [...segmentMap.entries()].map(([segment, segmentRecords]) => ({
    segment,
    grouped: groupedByType(segmentRecords),
  }));
}

function safeName(name) {
  return normalizeText(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'converted';
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function workbookToBytes(workbook) {
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

function createZipBlob(files) {
  const localParts = [];
  const centralParts = [];
  const now = dosDateTime();
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.bytes;
    const checksum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(local, 0, 0x04034b50);
    writeUint16LE(local, 4, 20);
    writeUint16LE(local, 6, 0x0800);
    writeUint16LE(local, 8, 0);
    writeUint16LE(local, 10, now.dosTime);
    writeUint16LE(local, 12, now.dosDate);
    writeUint32LE(local, 14, checksum);
    writeUint32LE(local, 18, data.length);
    writeUint32LE(local, 22, data.length);
    writeUint16LE(local, 26, nameBytes.length);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(central, 0, 0x02014b50);
    writeUint16LE(central, 4, 20);
    writeUint16LE(central, 6, 20);
    writeUint16LE(central, 8, 0x0800);
    writeUint16LE(central, 10, 0);
    writeUint16LE(central, 12, now.dosTime);
    writeUint16LE(central, 14, now.dosDate);
    writeUint32LE(central, 16, checksum);
    writeUint32LE(central, 20, data.length);
    writeUint32LE(central, 24, data.length);
    writeUint16LE(central, 28, nameBytes.length);
    writeUint32LE(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralDirectory = concatUint8Arrays(centralParts);
  const end = new Uint8Array(22);
  writeUint32LE(end, 0, 0x06054b50);
  writeUint16LE(end, 8, files.length);
  writeUint16LE(end, 10, files.length);
  writeUint32LE(end, 12, centralDirectory.length);
  writeUint32LE(end, 16, centralOffset);

  return new Blob([concatUint8Arrays([...localParts, centralDirectory, end])], { type: 'application/zip' });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildOutputWorkbook(sheetName, records, metaRows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsToSheet(records)), sheetName);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows), '转换说明');
  return wb;
}

function detectAndConvert(workbook, sourceName, segmentRules = defaultSegmentRules()) {
  const outputs = [];
  const base = safeName(sourceName.replace(/\.[^.]+$/, ''));
  const cumulativeSurface = workbook.SheetNames.find((name) => /\u7d2f[\u79ef\u8ba1]?\u4f4d\u79fb\u91cf/.test(name));
  const cumulativeSettlement = workbook.SheetNames.find((name) => /\u7d2f[\u8ba1\u79ef]?\u6c89\u964d\u91cf/.test(name));

  if (cumulativeSurface || cumulativeSettlement) {
    const records = [];
    if (cumulativeSurface) records.push(...parsePointRowsDateColumns(aoaFromSheet(workbook.Sheets[cumulativeSurface]), SURFACE_SHEET));
    if (cumulativeSettlement) records.push(...parsePointRowsDateColumns(aoaFromSheet(workbook.Sheets[cumulativeSettlement]), SETTLEMENT_SHEET));
    const segmented = groupedBySegmentAndType(records, { sourceName }, segmentRules);
    for (const segmentItem of segmented) {
      for (const sheetName of [SURFACE_SHEET, SETTLEMENT_SHEET]) {
        const segmentRecords = segmentItem.grouped[sheetName] || [];
        if (!segmentRecords.length) continue;
        outputs.push({
          filename: `${base}_${safeName(segmentItem.segment)}_${sheetName}_\u7cfb\u7edf\u5f55\u5165\u6a21\u677f.xlsx`,
          sourceName,
          segment: segmentItem.segment,
          sheetName,
          records: segmentRecords,
          mode: '\u7d2f\u8ba1\u77e9\u9635\u8868\uff1a\u6309\u65e5\u671f\u5217\u8f6c\u6362',
          workbook: buildOutputWorkbook(sheetName, segmentRecords, [
            ['\u6e90\u6587\u4ef6', sourceName],
            ['\u6807\u6bb5', segmentItem.segment],
            ['\u8bc6\u522b\u7c7b\u578b', '\u7d2f\u8ba1\u77e9\u9635\u8868\uff1a\u6309\u65e5\u671f\u5217\u8f6c\u6362'],
            ['\u4f4d\u79fb\u5de5\u4f5c\u8868', cumulativeSurface || '\u65e0'],
            ['\u6c89\u964d\u5de5\u4f5c\u8868', cumulativeSettlement || '\u65e0'],
            ['\u8bf4\u660e', '\u65e5\u671f\u5217\u4e3a\u89c2\u6d4b\u65e5\u671f\uff0c\u6570\u503c\u5355\u4f4d mm\u3002'],
          ]),
        });
      }
    }
    return outputs;
  }

  for (const sheetName of workbook.SheetNames) {
    const rows = aoaFromSheet(workbook.Sheets[sheetName]);
    const text = rows.slice(0, 8).flat().map(normalizeText).join('|');
    let records = [];
    let mode = '';
    if (text.includes('\u8fb9\u5761\u4f4d\u79fb\u6570\u636e\u6c47\u603b\u8868') || text.includes('\u8fb9\u5761\u504f\u79fb\u6570\u636e\u6c47\u603b\u8868')) {
      records = parsePerPointBlocks(rows);
      mode = '\u5355\u6d4b\u70b9\u5206\u5757\u8868';
    } else if (text.includes('\u6210\u679c\u6570\u636e\u8868') || text.includes('\u6210\u679c\u7edf\u8ba1\u8868')) {
      records = parseWideResultTable(rows);
      mode = '\u6210\u679c\u5bbd\u8868';
    }
    if (!records.length) continue;
    const segmented = groupedBySegmentAndType(records, { sourceName, sourceSheet: sheetName }, segmentRules);
    for (const segmentItem of segmented) {
      for (const typeName of [SURFACE_SHEET, SETTLEMENT_SHEET]) {
        const segmentRecords = segmentItem.grouped[typeName] || [];
        if (!segmentRecords.length) continue;
        outputs.push({
          filename: `${base}_${safeName(sheetName)}_${safeName(segmentItem.segment)}_${typeName}_\u7cfb\u7edf\u5f55\u5165\u6a21\u677f.xlsx`,
          sourceName,
          segment: segmentItem.segment,
          sheetName: typeName,
          sourceSheet: sheetName,
          records: segmentRecords,
          mode,
          workbook: buildOutputWorkbook(typeName, segmentRecords, [
            ['\u6e90\u6587\u4ef6', sourceName],
            ['\u539f\u59cb\u5de5\u4f5c\u8868', sheetName],
            ['\u6807\u6bb5', segmentItem.segment],
            ['\u8bc6\u522b\u7c7b\u578b', mode],
            ['\u8bf4\u660e', '\u65e5\u671f\u5217\u4e3a\u89c2\u6d4b\u65e5\u671f\uff0c\u6570\u503c\u5355\u4f4d mm\u3002'],
          ]),
        });
      }
    }
  }
  return outputs;
}

function downloadWorkbook(output) {
  XLSX.writeFile(output.workbook, output.filename);
}

function downloadAllOutputs() {
  currentOutputs.forEach((output, index) => {
    window.setTimeout(() => downloadWorkbook(output), index * 350);
  });
}

function downloadAllAsZip() {
  if (!currentOutputs.length) return;
  const seen = new Map();
  const files = currentOutputs.map((output) => {
    const count = seen.get(output.filename) || 0;
    seen.set(output.filename, count + 1);
    const filename = count ? output.filename.replace(/\.xlsx$/i, `_${count + 1}.xlsx`) : output.filename;
    return { name: filename, bytes: workbookToBytes(output.workbook) };
  });

  const summaryRows = [
    ['源文件', '输出文件', '标段', '监测类型', '识别类型', '原始工作表', '数据条数'],
    ...currentOutputs.map((output) => [
      output.sourceName || '',
      output.filename,
      output.segment || '\u672a\u8bc6\u522b\u6807\u6bb5',
      output.sheetName,
      output.mode,
      output.sourceSheet || '',
      output.records.length,
    ]),
  ];
  if (currentFailures.length) {
    summaryRows.push([]);
    summaryRows.push(['未转换文件', '原因']);
    currentFailures.forEach((failure) => summaryRows.push([failure.file, failure.message]));
  }
  const summaryWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(summaryWorkbook, XLSX.utils.aoa_to_sheet(summaryRows), '批量转换清单');
  files.unshift({ name: '批量转换清单.xlsx', bytes: workbookToBytes(summaryWorkbook) });

  const today = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(createZipBlob(files), `monitoring_excel_converted_${today}.zip`);
}

function renderBatchActions(successFiles) {
  batchActionsBox.innerHTML = '';
  if (!currentOutputs.length) {
    batchActionsBox.className = 'batch-actions';
    return;
  }
  batchActionsBox.className = 'batch-actions visible';
  const text = document.createElement('span');
  text.textContent = `成功 ${successFiles} 个文件，生成 ${currentOutputs.length} 个模板`;
  const buttons = document.createElement('div');
  buttons.className = 'batch-buttons';
  const zipButton = document.createElement('button');
  zipButton.textContent = '下载全部 ZIP';
  zipButton.addEventListener('click', downloadAllAsZip);
  const button = document.createElement('button');
  button.className = 'secondary';
  button.textContent = '逐个下载';
  button.addEventListener('click', downloadAllOutputs);
  batchActionsBox.appendChild(text);
  buttons.appendChild(zipButton);
  buttons.appendChild(button);
  batchActionsBox.appendChild(buttons);
}

function appendFileResult(file, outputs) {
  const fileTitle = document.createElement('div');
  fileTitle.className = 'file-group-title';
  fileTitle.textContent = `${file.name}：${outputs.length} 个结果`;
  resultsBox.appendChild(fileTitle);

  outputs.forEach((output) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <h3>${output.filename}</h3>
      <p>标段：${output.segment || '\u672a\u8bc6\u522b\u6807\u6bb5'}<br>${output.mode}${output.sourceSheet ? ` · 来源：${output.sourceSheet}` : ''}<br>${output.records.length} 条数据 · ${output.sheetName}</p>
    `;
    const button = document.createElement('button');
    button.textContent = '下载文件';
    button.addEventListener('click', () => downloadWorkbook(output));
    card.appendChild(button);
    resultsBox.appendChild(card);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => /\.(xlsx|xls)$/i.test(file.name));
  if (!files.length) return;
  resultsBox.innerHTML = '';
  currentOutputs = [];
  currentFailures = [];
  batchActionsBox.className = 'batch-actions';
  batchActionsBox.innerHTML = '';

  let successFiles = 0;
  setStatus('warn', `正在批量转换 ${files.length} 个文件`);

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const segmentRules = parseSegmentRules(segmentRulesInput?.value || '');
      const outputs = detectAndConvert(workbook, file.name, segmentRules);
      if (!outputs.length) throw new Error('未识别到可转换的数据表。');
      successFiles += 1;
      currentOutputs.push(...outputs);
      appendFileResult(file, outputs);
    } catch (error) {
      currentFailures.push({ file: file.name, message: error.message || '转换失败' });
    }
  }

  renderBatchActions(successFiles);
  if (currentFailures.length) {
    const failureText = currentFailures.map((failure) => `${failure.file}：${failure.message}`).join('；');
    setStatus(currentOutputs.length ? 'warn' : 'error', `部分文件未转换：${failureText}`);
  } else {
    setStatus('ok', `批量转换完成，共生成 ${currentOutputs.length} 个系统录入模板。`);
  }
}

drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('dragging');
});
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('dragging');
  handleFiles(event.dataTransfer.files);
});
fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
