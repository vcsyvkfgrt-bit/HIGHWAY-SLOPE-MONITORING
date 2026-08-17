#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  XLSX = require(path.resolve(__dirname, '../frontend/node_modules/xlsx'));
}

const SURFACE_SHEET = '地表位移监测点';
const SETTLEMENT_SHEET = '沉降监测点';

function usage() {
  console.log([
    'Usage:',
    '  node tools/convert-monitoring-excel.js <input.xlsx> [output-dir]',
    '',
    'Examples:',
    '  node tools/convert-monitoring-excel.js tmp_file_1.xlsx converted',
    '  node tools/convert-monitoring-excel.js "E:/data/H10.xlsx"',
  ].join('\n'));
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
  const match = text.match(/SYXCTJ[-_\u2014\uff0d]?([123])/i);
  if (match) return `SYXCTJ-${match[1]}\u6807`;
  const simple = text.match(/^([123])\u6807$/);
  if (simple) return `SYXCTJ-${simple[1]}\u6807`;
  return normalizeText(name);
}

function defaultSegmentRules() {
  return [
    { segment: 'SYXCTJ-1\u6807', patterns: ['SYXCTJ-1', 'SYXCTJ1', 'TJ-1', 'TJ1', '1\u6807'] },
    { segment: 'SYXCTJ-2\u6807', patterns: ['SYXCTJ-2', 'SYXCTJ2', 'TJ-2', 'TJ2', '2\u6807'] },
    { segment: 'SYXCTJ-3\u6807', patterns: ['SYXCTJ-3', 'SYXCTJ3', 'TJ-3', 'TJ3', '3\u6807'] },
  ];
}

function parseSegmentRules(text) {
  const rules = defaultSegmentRules();
  const lines = normalizeText(text).split(/[;\n]/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/[:?=]/);
    if (parts.length < 2) continue;
    const segment = normalizeSegmentName(parts[0]);
    const patterns = parts.slice(1).join(':').split(/[,\uff0c\u3001|]/).map((item) => normalizeText(item)).filter(Boolean);
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
  ].filter(Boolean).join(' '), rules) || '\u672a\u8bc6\u522b\u6807\u6bb5';
}

function sortPoints(points) {
  return [...points].sort((a, b) => {
    const na = Number(pointNumberToken(a));
    const nb = Number(pointNumberToken(b));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, 'zh-Hans-CN');
  });
}

const SLOPE_SPLIT_RULES = [
  {
    sourceBaseName: 'DK0+206.5-EK1+545.5',
    targetBaseName: 'EK1+335~EK1+435',
    points: new Set(['DQ-1', 'DQ-2', 'DQ-3']),
  },
];

function normalizePointKey(name) {
  return normalizePointName(name).toUpperCase().replace(/\s+/g, '');
}

function splitRecordsBySlopeRule(records, context, baseName) {
  const sourceBaseName = path.basename(context?.sourceName || '', path.extname(context?.sourceName || ''));
  const rule = SLOPE_SPLIT_RULES.find((item) => sourceBaseName.includes(item.sourceBaseName) || baseName.includes(item.sourceBaseName));
  if (!rule) return [{ baseName, records, splitFrom: '' }];

  const splitPointSet = new Set([...rule.points].map(normalizePointKey));
  const parent = [];
  const target = [];
  for (const record of records) {
    if (splitPointSet.has(normalizePointKey(record.point))) target.push(record);
    else parent.push(record);
  }

  return [
    { baseName, records: parent, splitFrom: '' },
    { baseName: rule.targetBaseName, records: target, splitFrom: baseName },
  ].filter((item) => item.records.length);
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
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
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

function writeWorkbook(outputPath, typedRecords, metaRows) {
  const wb = XLSX.utils.book_new();
  for (const sheetName of [SURFACE_SHEET, SETTLEMENT_SHEET]) {
    const rows = rowsToSheet(typedRecords[sheetName] || []);
    if (rows.length > 1) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows), '转换说明');
  XLSX.writeFile(wb, outputPath);
}

function writeSingleTypeWorkbook(outputPath, sheetName, records, metaRows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsToSheet(records)), sheetName);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows), '转换说明');
  XLSX.writeFile(wb, outputPath);
}

function writeTypedOutputs(outputDir, baseName, typedRecords, metaRows) {
  const outputs = [];
  for (const sheetName of [SURFACE_SHEET, SETTLEMENT_SHEET]) {
    const records = typedRecords[sheetName] || [];
    if (!records.length) continue;
    const outputPath = path.join(outputDir, `${baseName}_${sheetName}_系统录入模板.xlsx`);
    writeSingleTypeWorkbook(outputPath, sheetName, records, metaRows);
    outputs.push({ outputPath, records: records.length, type: sheetName });
  }
  return outputs;
}

function safeName(name) {
  return normalizeText(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'converted';
}

function writeTypedSegmentOutputs(outputDir, baseName, records, context, metaRows, segmentRules) {
  const outputs = [];
  for (const splitItem of splitRecordsBySlopeRule(records, context, baseName)) {
    const segmented = groupedBySegmentAndType(splitItem.records, context, segmentRules);
    for (const segmentItem of segmented) {
      for (const sheetName of [SURFACE_SHEET, SETTLEMENT_SHEET]) {
        const segmentRecords = segmentItem.grouped[sheetName] || [];
        if (!segmentRecords.length) continue;
        const outputPath = path.join(outputDir, `${safeName(splitItem.baseName)}_${safeName(segmentItem.segment)}_${sheetName}_\u7cfb\u7edf\u5f55\u5165\u6a21\u677f.xlsx`);
        writeSingleTypeWorkbook(outputPath, sheetName, segmentRecords, [
          ...metaRows,
          ['\u6807\u6bb5', segmentItem.segment],
          ...(splitItem.splitFrom ? [['\u62c6\u5206\u6765\u6e90', splitItem.splitFrom]] : []),
        ]);
        outputs.push({
          outputPath,
          records: segmentRecords.length,
          type: sheetName,
          segment: segmentItem.segment,
          splitFrom: splitItem.splitFrom,
        });
      }
    }
  }
  return outputs;
}

function convertWorkbook(inputPath, outputDir, options = {}) {
  const wb = XLSX.readFile(inputPath, { cellDates: true });
  const base = safeName(path.basename(inputPath, path.extname(inputPath)));
  const segmentRules = parseSegmentRules(options.segmentRules || process.env.SEGMENT_RULES || '');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputs = [];

  const cumulativeSurface = wb.SheetNames.find((name) => /\u7d2f[\u79ef\u8ba1]?\u4f4d\u79fb\u91cf/.test(name));
  const cumulativeSettlement = wb.SheetNames.find((name) => /\u7d2f[\u8ba1\u79ef]?\u6c89\u964d\u91cf/.test(name));
  if (cumulativeSurface || cumulativeSettlement) {
    const records = [];
    if (cumulativeSurface) records.push(...parsePointRowsDateColumns(aoaFromSheet(wb.Sheets[cumulativeSurface]), SURFACE_SHEET));
    if (cumulativeSettlement) records.push(...parsePointRowsDateColumns(aoaFromSheet(wb.Sheets[cumulativeSettlement]), SETTLEMENT_SHEET));
    const typedOutputs = writeTypedSegmentOutputs(outputDir, base, records, { sourceName: inputPath }, [
      ['\u6e90\u6587\u4ef6', inputPath],
      ['\u8bc6\u522b\u7c7b\u578b', '\u7d2f\u8ba1\u77e9\u9635\u8868\uff1a\u6309\u65e5\u671f\u5217\u8f6c\u6362'],
      ['\u4f4d\u79fb\u5de5\u4f5c\u8868', cumulativeSurface || '\u65e0'],
      ['\u6c89\u964d\u5de5\u4f5c\u8868', cumulativeSettlement || '\u65e0'],
      ['\u8bf4\u660e', '\u65e5\u671f\u5217\u4e3a\u89c2\u6d4b\u65e5\u671f\uff0c\u6570\u503c\u5355\u4f4d mm\u3002'],
    ], segmentRules);
    outputs.push(...typedOutputs.map((item) => ({ ...item, mode: 'cumulative-matrix' })));
    return outputs;
  }

  for (const sheetName of wb.SheetNames) {
    const rows = aoaFromSheet(wb.Sheets[sheetName]);
    const text = rows.slice(0, 8).flat().map(normalizeText).join('|');
    let records = [];
    let mode = '';
    if (text.includes('\u8fb9\u5761\u4f4d\u79fb\u6570\u636e\u6c47\u603b\u8868') || text.includes('\u8fb9\u5761\u504f\u79fb\u6570\u636e\u6c47\u603b\u8868')) {
      records = parsePerPointBlocks(rows);
      mode = 'per-point-blocks';
    } else if (text.includes('\u6210\u679c\u6570\u636e\u8868') || text.includes('\u6210\u679c\u7edf\u8ba1\u8868')) {
      records = parseWideResultTable(rows);
      mode = 'wide-result-table';
    }
    if (!records.length) continue;
    const typedOutputs = writeTypedSegmentOutputs(outputDir, `${base}_${safeName(sheetName)}`, records, { sourceName: inputPath, sourceSheet: sheetName }, [
      ['\u6e90\u6587\u4ef6', inputPath],
      ['\u539f\u59cb\u5de5\u4f5c\u8868', sheetName],
      ['\u8bc6\u522b\u7c7b\u578b', mode],
      ['\u8bf4\u660e', '\u65e5\u671f\u5217\u4e3a\u89c2\u6d4b\u65e5\u671f\uff0c\u6570\u503c\u5355\u4f4d mm\u3002'],
    ], segmentRules);
    outputs.push(...typedOutputs.map((item) => ({ ...item, mode, sheetName })));
  }

  if (!outputs.length) {
    throw new Error('\u672a\u8bc6\u522b\u5230\u53ef\u8f6c\u6362\u7684\u6570\u636e\u8868\uff0c\u8bf7\u786e\u8ba4\u6587\u4ef6\u662f\u5426\u5305\u542b\u7d2f\u8ba1\u4f4d\u79fb/\u7d2f\u8ba1\u6c89\u964d\u3001\u8fb9\u5761\u4f4d\u79fb\u6570\u636e\u6c47\u603b\u8868\u6216\u6210\u679c\u6570\u636e\u8868\u3002');
  }
  return outputs;
}

function main() {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3] || path.resolve(process.cwd(), 'converted_monitoring_excels');
  if (!inputPath || inputPath === '-h' || inputPath === '--help') {
    usage();
    process.exit(inputPath ? 0 : 1);
  }
  const outputs = convertWorkbook(path.resolve(inputPath), path.resolve(outputDir));
  console.log(JSON.stringify({ success: true, outputDir: path.resolve(outputDir), outputs }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  convertWorkbook,
  normalizeDate,
  parsePointRowsDateColumns,
  parsePerPointBlocks,
  parseWideResultTable,
  rowsToSheet,
  groupedByType,
};
