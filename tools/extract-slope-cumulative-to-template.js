#!/usr/bin/env node

/**
 * 边坡监测原始 Excel 累计值提取脚本
 *
 * 功能：
 * 1. 从每个原始 Excel 的“成果统计表”中提取：
 *    - 地表偏移 / 水平位移：累计偏移(mm)
 *    - 沉降数据：累计沉降(mm)
 * 2. 分别输出为系统录入模板格式：
 *    第一行：监测日期、测点1、测点2、...、备注
 *    后续行：日期、对应累计值、...、备注
 *
 * 使用：
 *   node tools/extract-slope-cumulative-to-template.js
 *
 * 说明：
 * - 当前脚本优先读取“成果统计表”，因为它已经是汇总后的累计值。
 * - 如果后续你的 Excel 模板变化，优先改 CONFIG 和 extractFromSummarySheet()。
 */

const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  XLSX = require(path.resolve(__dirname, '../frontend/node_modules/xlsx'));
}

const CONFIG = {
  inputFiles: [
    'E:/汪斌-资料/兴长项目/项目部季度考核材料/监测相关/原始监测数据/三标/地表水平位移/DK0+206.5-EK1+545.5.xlsx',
    'E:/汪斌-资料/兴长项目/项目部季度考核材料/监测相关/原始监测数据/三标/地表水平位移/H10.xlsx',
    'E:/汪斌-资料/兴长项目/项目部季度考核材料/监测相关/原始监测数据/三标/地表水平位移/H24.xlsx',
    'E:/汪斌-资料/兴长项目/项目部季度考核材料/监测相关/原始监测数据/三标/地表水平位移/三星店大桥终点桥台ZK72+210-284沉降板.xlsx',
  ],
  outputDir: path.resolve(process.cwd(), 'converted_slope_cumulative_templates'),
  summarySheetName: '成果统计表',
};

const TYPES = {
  surface: {
    label: '地表偏移数据',
    outputSheetName: '地表位移监测点',
    titleKeywords: ['累计偏移成果数据表', '累计位移成果数据表'],
    valueKeywords: ['累计偏移', '累计位移'],
  },
  settlement: {
    label: '沉降数据',
    outputSheetName: '沉降监测点',
    titleKeywords: ['累计沉降成果数据表'],
    valueKeywords: ['累计沉降'],
  },
};

const SLOPE_SPLIT_RULES = [
  {
    sourceBaseName: 'DK0+206.5-EK1+545.5',
    targetBaseName: 'EK1+335~EK1+435',
    points: new Set(['DQ-1', 'DQ-2', 'DQ-3']),
  },
];

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeName(name) {
  return normalizeText(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'converted';
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const text = normalizeText(value).replace(/,/g, '');
  const num = Number(text);
  return Number.isFinite(num) ? Number(num.toFixed(4)) : null;
}

function parseDate(value) {
  if (value == null || value === '') return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = normalizeText(value);
  if (!text) return '';

  // 兼容：2025/7/9 9:30、5/7/25、2025-07-09、2025年7月9日
  const datePart = text.split(/\s+/)[0]
    .replace(/[年月.]/g, '/')
    .replace(/[日号]/g, '')
    .replace(/-/g, '/');

  let match = datePart.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  match = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  }

  return '';
}

function normalizePointName(name) {
  return normalizeText(name)
    .replace(/^新/, '')
    .replace(/#/g, '')
    .replace(/HP-/i, 'HP-')
    .replace(/BKO-/i, 'BK0-');
}

function normalizePointKey(name) {
  return normalizePointName(name).toUpperCase().replace(/\s+/g, '');
}

function includesAny(text, keywords) {
  const source = normalizeText(text);
  return keywords.some((keyword) => source.includes(keyword));
}

function findBlockStarts(rows, typeConfig) {
  const starts = [];

  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (includesAny(row[c], typeConfig.titleKeywords)) {
        starts.push({ titleRow: r, startCol: c });
      }
    }
  }

  return starts;
}

function findNextBlockStart(blockStarts, currentStart, maxCols) {
  const next = blockStarts
    .map((item) => item.startCol)
    .filter((col) => col > currentStart)
    .sort((a, b) => a - b)[0];

  return next ?? maxCols;
}

function buildPointColumns(rows, startCol, endCol, typeConfig) {
  const pointRow = rows[1] || [];
  const headerRow = rows[3] || [];
  const pointColumns = [];

  for (let c = startCol + 1; c < endCol; c += 1) {
    const header = normalizeText(headerRow[c]);
    if (!includesAny(header, typeConfig.valueKeywords)) continue;

    // 成果统计表一般是：点名列、空列；第 4 行是：速率、累计值。
    // “累计值”列本身通常在点名右侧 1 列，所以优先向左找最近的点名。
    let pointName = '';
    for (let pc = c; pc >= startCol; pc -= 1) {
      pointName = normalizePointName(pointRow[pc]);
      if (pointName) break;
    }

    if (pointName) {
      pointColumns.push({ point: pointName, col: c });
    }
  }

  return pointColumns;
}

function extractBlockRecords(rows, block, allBlocks, typeKey) {
  const typeConfig = TYPES[typeKey];
  const endCol = findNextBlockStart(allBlocks, block.startCol, Math.max(...rows.map((row) => row.length)));
  const pointColumns = buildPointColumns(rows, block.startCol, endCol, typeConfig);
  const records = [];

  if (!pointColumns.length) return records;

  for (let r = 4; r < rows.length; r += 1) {
    const date = parseDate(rows[r]?.[block.startCol]);
    if (!date) continue;

    for (const item of pointColumns) {
      const value = parseNumber(rows[r]?.[item.col]);
      if (value == null) continue;

      records.push({
        type: typeKey,
        date,
        point: item.point,
        value,
      });
    }
  }

  return records;
}

function extractFromSummarySheet(workbook, inputFile) {
  const sheetName = workbook.SheetNames.includes(CONFIG.summarySheetName)
    ? CONFIG.summarySheetName
    : workbook.SheetNames.find((name) => normalizeText(name).includes('成果统计'));

  if (!sheetName) {
    throw new Error(`未找到“${CONFIG.summarySheetName}”工作表：${inputFile}`);
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
  });

  const surfaceBlocks = findBlockStarts(rows, TYPES.surface);
  const settlementBlocks = findBlockStarts(rows, TYPES.settlement);
  const allBlocks = [...surfaceBlocks, ...settlementBlocks].sort((a, b) => a.startCol - b.startCol);

  return {
    surface: surfaceBlocks.flatMap((block) => extractBlockRecords(rows, block, allBlocks, 'surface')),
    settlement: settlementBlocks.flatMap((block) => extractBlockRecords(rows, block, allBlocks, 'settlement')),
  };
}

function mergeRecords(recordsList) {
  const dateMap = new Map();
  const pointSet = new Set();

  for (const record of recordsList.flat()) {
    if (!record.date || !record.point) continue;
    pointSet.add(record.point);
    if (!dateMap.has(record.date)) dateMap.set(record.date, new Map());
    dateMap.get(record.date).set(record.point, record.value);
  }

  const points = [...pointSet].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
  const dates = [...dateMap.keys()].sort();

  return [
    ['监测日期', ...points, '备注'],
    ...dates.map((date) => [
      date,
      ...points.map((point) => dateMap.get(date).has(point) ? dateMap.get(date).get(point) : ''),
      '',
    ]),
  ];
}

function writeTemplateWorkbook(outputPath, sheetName, rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  XLSX.writeFile(wb, outputPath);
}

function splitExtractedBySlopeRule(inputFile, extracted) {
  const base = path.basename(inputFile, path.extname(inputFile));
  const rule = SLOPE_SPLIT_RULES.find((item) => base.includes(item.sourceBaseName));
  if (!rule) return [{ base, extracted, splitFrom: '' }];

  const splitPointSet = new Set([...rule.points].map(normalizePointKey));
  const parent = { surface: [], settlement: [] };
  const target = { surface: [], settlement: [] };

  for (const typeKey of ['surface', 'settlement']) {
    for (const record of extracted[typeKey] || []) {
      if (splitPointSet.has(normalizePointKey(record.point))) {
        target[typeKey].push(record);
      } else {
        parent[typeKey].push(record);
      }
    }
  }

  return [
    { base, extracted: parent, splitFrom: '' },
    { base: rule.targetBaseName, extracted: target, splitFrom: base },
  ].filter((item) => item.extracted.surface.length || item.extracted.settlement.length);
}

function convert() {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const allSurface = [];
  const allSettlement = [];
  const detailRows = [['源文件', '地表偏移记录数', '沉降记录数']];

  for (const inputFile of CONFIG.inputFiles) {
    const workbook = XLSX.readFile(inputFile, { cellDates: true });
    const extracted = extractFromSummarySheet(workbook, inputFile);

    for (const splitItem of splitExtractedBySlopeRule(inputFile, extracted)) {
      allSurface.push(splitItem.extracted.surface);
      allSettlement.push(splitItem.extracted.settlement);

      detailRows.push([
        splitItem.splitFrom ? `${inputFile} -> ${splitItem.base}` : inputFile,
        splitItem.extracted.surface.length,
        splitItem.extracted.settlement.length,
      ]);

      const base = safeName(splitItem.base);

      if (splitItem.extracted.surface.length) {
        writeTemplateWorkbook(
          path.join(CONFIG.outputDir, `${base}_地表偏移数据_系统录入模板.xlsx`),
          TYPES.surface.outputSheetName,
          mergeRecords([splitItem.extracted.surface]),
        );
      }

      if (splitItem.extracted.settlement.length) {
        writeTemplateWorkbook(
          path.join(CONFIG.outputDir, `${base}_沉降数据_系统录入模板.xlsx`),
          TYPES.settlement.outputSheetName,
          mergeRecords([splitItem.extracted.settlement]),
        );
      }
    }
  }

  writeTemplateWorkbook(
    path.join(CONFIG.outputDir, '三标_地表偏移数据_合并系统录入模板.xlsx'),
    TYPES.surface.outputSheetName,
    mergeRecords(allSurface),
  );

  writeTemplateWorkbook(
    path.join(CONFIG.outputDir, '三标_沉降数据_合并系统录入模板.xlsx'),
    TYPES.settlement.outputSheetName,
    mergeRecords(allSettlement),
  );

  writeTemplateWorkbook(
    path.join(CONFIG.outputDir, '转换明细.xlsx'),
    '转换明细',
    detailRows,
  );

  console.log(JSON.stringify({
    success: true,
    outputDir: CONFIG.outputDir,
    files: fs.readdirSync(CONFIG.outputDir),
  }, null, 2));
}

convert();
