import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { API_DATA } from '../config/api'
import { getWordChartTransformation, renderAcademicChartImage } from './academicChart'
import { absoluteAssetUrl } from './reportMaterials'

function safeText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function fileNameSafe(value) {
  return safeText(value).replace(/[\\/:*?"<>|]/g, '_') || '监测报告'
}

export function inspectReportForExport(report) {
  const errors = []
  const warnings = []
  const content = report?.content_json || {}
  const moduleContents = content.moduleContents || {}
  const structuredContents = content.structuredContents || {}
  const chartAssets = report?.chart_assets || report?.chartAssets || []

  if (!safeText(report?.title || content.title).trim()) errors.push('缺少报告标题')
  if (!Object.keys(moduleContents).length && !Object.keys(structuredContents).length) warnings.push('报告正文和结构化材料均为空')

  Object.entries(moduleContents).forEach(([key, value]) => {
    const unresolved = safeText(value).match(/\{[^{}]+\}/g)
    if (unresolved?.length) warnings.push(`“${key}”仍含未替换字段：${[...new Set(unresolved)].join('、')}`)
    const materialIds = [...safeText(value).matchAll(/\[图表素材：([^\]]+)\]/g)].map(match => match[1])
    materialIds.forEach((id) => {
      if (!chartAssets.some(asset => String(asset.id) === String(id))) warnings.push(`“${key}”引用的图表素材 ${id} 不存在`)
    })
  })

  Object.entries(structuredContents).forEach(([key, material]) => {
    if (material?.kind === 'table' && !(material.rows || []).length) warnings.push(`“${material.title || key}”没有表格数据`)
    if (material?.kind === 'chart' && !(material.series || []).some(series => (series.data || []).length)) warnings.push(`“${material.title || key}”没有可绘制数据`)
    if (material?.kind === 'section-list' && !(material.sections || []).length) warnings.push(`“${material.title || key}”没有可生成的循环章节`)
  })

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

function tokenHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

async function request(url) {
  const response = await fetch(url, { headers: tokenHeaders() })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.message || '请求失败')
  return data.data
}

const COLORS = {
  ink: '1F2937',
  muted: '64748B',
  border: '94A3B8',
  headerFill: 'DCE6F1',
  stripeFill: 'F8FAFC',
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

function tableCell(text, bold = false, options = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.shading ? { fill: options.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: options.alignment || AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 300 },
        children: [new TextRun({ text: safeText(text), bold, font: 'SimSun', size: 20, color: COLORS.ink })],
      }),
    ],
  })
}

function makeTable(headers, rows, options = {}) {
  const totalWidth = options.totalWidth || 9000
  const weights = options.columnWeights?.length === headers.length
    ? options.columnWeights
    : headers.map(() => 1)
  const weightTotal = weights.reduce((sum, value) => sum + Number(value || 1), 0)
  const widths = weights.map(value => Math.floor((Number(value || 1) / weightTotal) * totalWidth))
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((header, index) => tableCell(header, true, { width: widths[index], shading: COLORS.headerFill })),
      }),
      ...rows.map((row, rowIndex) => new TableRow({
        cantSplit: true,
        children: row.map((cell, index) => tableCell(cell, false, {
          width: widths[index],
          shading: rowIndex % 2 ? COLORS.stripeFill : undefined,
          alignment: index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        })),
      })),
    ],
  })
}

function makePairedSurfaceWeeklyTable(material, tableNumber) {
  const totalWidth = 9000
  const weights = [0.8, 0.9, 0.9, 1.1, 1.25, 0.8, 0.9, 0.9, 1.1, 1.25]
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const widths = weights.map(value => Math.floor(value / weightTotal * totalWidth))
  const spanWidth = (start, count) => widths.slice(start, start + count).reduce((sum, value) => sum + value, 0)
  const border = { style: BorderStyle.SINGLE, size: 4, color: '475569' }
  const rows = material.rows || []
  const bodyRows = rows.map(row => new TableRow({
    cantSplit: true,
    children: [
      row.displacement_point, row.displacement_weekly, row.displacement_cumulative, row.displacement_rate, row.displacement_remark,
      row.settlement_point, row.settlement_weekly, row.settlement_cumulative, row.settlement_rate, row.settlement_remark,
    ].map((value, index) => tableCell(value, false, { width: widths[index], alignment: index % 5 === 4 ? AlignmentType.LEFT : AlignmentType.CENTER })),
  }))
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [tableCell(`表 ${tableNumber}  ${material.title || '边坡监测周报表'}`, true, { width: totalWidth, columnSpan: 10, shading: 'FFFFFF' })],
      }),
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          tableCell('工程名称', true, { width: widths[0], shading: COLORS.headerFill }),
          tableCell(material.projectName || '-', false, { width: spanWidth(1, 4), columnSpan: 4, alignment: AlignmentType.LEFT }),
          tableCell('日期', true, { width: widths[5], shading: COLORS.headerFill }),
          tableCell(material.dateRange || '-', false, { width: spanWidth(6, 4), columnSpan: 4 }),
        ],
      }),
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          tableCell('水平位移（mm）', true, { width: spanWidth(0, 5), columnSpan: 5, shading: COLORS.headerFill }),
          tableCell('沉降位移（mm）', true, { width: spanWidth(5, 5), columnSpan: 5, shading: COLORS.headerFill }),
        ],
      }),
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: ['点号', '本周变化', '累计变化', '周变化速率', '备注', '点号', '本周变化', '累计变化', '周变化速率', '备注']
          .map((label, index) => tableCell(label, true, { width: widths[index], shading: COLORS.headerFill })),
      }),
      ...bodyRows,
    ],
  })
}

function captionParagraph(kind, number, title) {
  return new Paragraph({
    style: 'ReportCaption',
    alignment: AlignmentType.CENTER,
    keepNext: kind === '表',
    children: [new TextRun({ text: `${kind} ${number}  ${safeText(title)}`, font: 'SimSun', size: 20 })],
  })
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function splitMonitorDate(item) {
  return item.monitorDate || item.monitor_date || item.monitoringTime || ''
}

function normalizeStyle(style, kind = 'body') {
  return {
    fontFamily: kind === 'heading' ? 'SimHei' : 'SimSun',
    fontSize: kind === 'heading' ? 16 : 12,
    fontWeight: kind === 'heading' ? 'bold' : 'normal',
    textAlign: 'left',
    firstLineIndent: kind === 'body' ? 2 : 0,
    lineHeight: 1.5,
    spacingBefore: kind === 'heading' ? 12 : 0,
    spacingAfter: kind === 'heading' ? 8 : 6,
    ...(style || {}),
  }
}

function alignmentFromStyle(style) {
  const map = {
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    left: AlignmentType.LEFT,
  }
  return map[style.textAlign] || AlignmentType.LEFT
}

function textRunFromStyle(text, style) {
  const normalized = normalizeStyle(style)
  return new TextRun({
    text: safeText(text),
    font: normalized.fontFamily,
    size: Number(normalized.fontSize || 12) * 2,
    bold: normalized.fontWeight === 'bold',
  })
}

function paragraphFromStyle(text, style, kind = 'body', headingLevel = null) {
  const normalized = normalizeStyle(style, kind)
  return new Paragraph({
    heading: headingLevel || undefined,
    style: kind === 'body' ? 'ReportBody' : undefined,
    children: [textRunFromStyle(text, normalized)],
    alignment: alignmentFromStyle(normalized),
    keepNext: kind === 'heading',
    keepLines: kind === 'heading',
    indent: {
      firstLine: Math.round(Number(normalized.firstLineIndent || 0) * 420),
    },
    spacing: {
      before: Math.round(Number(normalized.spacingBefore || 0) * 20),
      after: Math.round(Number(normalized.spacingAfter || 0) * 20),
      line: Math.round(Number(normalized.lineHeight || 1.5) * 240),
    },
  })
}

function findTemplateNodeByContentKey(report, key) {
  const modules = report.template_snapshot?.modules || []
  for (const module of modules) {
    if (module.name === key) {
      return { module, child: null }
    }
    const child = (module.children || []).find((item) => `${module.name}-${item.name}` === key)
    if (child) {
      return { module, child }
    }
  }
  return { module: null, child: null }
}

function getContentStyles(report, key) {
  const { module, child } = findTemplateNodeByContentKey(report, key)
  return {
    headingStyle: child?.style || module?.style || normalizeStyle(null, 'heading'),
    bodyStyle: child?.style || normalizeStyle(null, 'body'),
    headingLevel: child ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
  }
}

async function createTrendChartImage(selectedData = [], slopeCategory = '') {
  const filtered = slopeCategory
    ? selectedData.filter((item) => item.slope === slopeCategory || item.slope_name === slopeCategory || item.monitoringPoint?.includes(slopeCategory))
    : selectedData

  const dates = [...new Set(filtered.map(splitMonitorDate).filter(Boolean))].sort()
  const groups = {}
  filtered.forEach((item) => {
    const name = item.pointName || item.point_name || item.monitoringPoint || item.slope || '监测点'
    const date = splitMonitorDate(item)
    const value = Number(item.value ?? item.monitoringData)
    if (!date || !Number.isFinite(value)) return
    if (!groups[name]) groups[name] = {}
    groups[name][date] = value
  })

  const series = Object.entries(groups).map(([name, values]) => ({
    name,
    type: 'line',
    smooth: true,
    connectNulls: true,
    data: dates.map((date) => values[date] ?? null),
  }))

  const image = await renderAcademicChartImage({
    key: `legacy-trend-${Date.now()}`,
    kind: 'chart',
    title: slopeCategory ? `${slopeCategory} 监测数据趋势图` : '监测数据趋势图',
    chartType: 'line',
    xName: '监测日期',
    yName: '监测值',
    source: 'selected_data',
    series: series.length ? series.map(item => ({ name: item.name, data: dates.map((date, index) => [date, item.data[index]]) })) : [{ name: '无数据', data: [[new Date().toISOString().slice(0, 10), 0]] }],
  })
  return dataUrlToBytes(image)
}

function findChartMaterial(report, materialId) {
  const savedAssets = report.chart_assets || report.chartAssets || []
  let localAssets = []
  try {
    localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  } catch {
    localAssets = []
  }
  return [...savedAssets, ...localAssets].find((item) => String(item.id) === String(materialId))
}

async function buildLedgerTable(month) {
  const data = await request(`${API_DATA}/api/slope-ledger?month=${month}`)
  const rows = (data.rows || []).map((row) => [
    row.section,
    row.slope_name,
    row.slope_type,
    row.total_points,
    row.point_type_summary,
    row.completed_points,
    row.completion_rate === null ? '未配置' : `${row.completion_rate}%`,
    row.safety_status,
    row.work_status,
    row.current_problem,
  ])
  return makeTable(
    ['标段', '边坡名称', '类型', '测点总数', '按类型数量', '已完成测点', '完成率', '安全状态', '工作状态', '当前问题'],
    rows
  )
}

async function renderContent(content, report, bodyStyle = null) {
  const nodes = []
  const text = safeText(content)
  const tokenRegex = /(\[图表：([^\s\]]+)\s+数据(?:趋势|对比)图\]|\[台账表：(\d{4}-\d{2})\]|\[图表素材：([^\]]+)\])/g
  let lastIndex = 0
  let match

  while ((match = tokenRegex.exec(text)) !== null) {
    const plain = text.slice(lastIndex, match.index).trim()
    if (plain) {
      plain.split('\n').forEach((line) => {
        if (line.trim()) nodes.push(paragraphFromStyle(line.trim(), bodyStyle, 'body'))
      })
    }

    if (match[4]) {
      const material = findChartMaterial(report, match[4])
      if (material?.imageUrl) {
        nodes.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: dataUrlToBytes(material.imageUrl), transformation: { width: 540, height: 281 } })],
          spacing: { before: 120, after: 80 },
        }))
        nodes.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: material.title || '监测数据图表', size: 18 })],
          spacing: { after: 160 },
        }))
      } else {
        nodes.push(paragraphFromStyle(`[图表素材缺失：${match[4]}]`, bodyStyle, 'body'))
      }
    } else if (match[2]) {
      const chartBytes = await createTrendChartImage(report.selected_data || [], match[2])
      nodes.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: chartBytes, transformation: { width: 520, height: 242 } })],
        spacing: { before: 120, after: 160 },
      }))
    } else if (match[3]) {
      nodes.push(new Paragraph({
        text: `${match[3]} 边坡监测台账`,
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 160, after: 80 },
      }))
      nodes.push(await buildLedgerTable(match[3]))
    }

    lastIndex = tokenRegex.lastIndex
  }

  const rest = text.slice(lastIndex).trim()
  if (rest) {
    rest.split('\n').forEach((line) => {
      if (line.trim()) nodes.push(paragraphFromStyle(line.trim(), bodyStyle, 'body'))
    })
  }

  if (nodes.length === 0) nodes.push(new Paragraph({ text: '未填写' }))
  return nodes
}

function selectedDataTable(selectedData = []) {
  const rows = selectedData.slice(0, 100).map((item) => [
    item.slope || item.slope_name || '',
    item.pointName || item.point_name || item.monitoringPoint || '',
    item.monitoringType || item.monitor_type || '',
    item.monitorDate || item.monitor_date || '',
    item.value ?? item.monitoringData ?? '',
    item.unit || '',
  ])
  if (rows.length === 0) return []
  return [
    new Paragraph({ text: '选用监测数据', heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 120 } }),
    makeTable(['边坡', '测点', '类型', '日期', '数值', '单位'], rows),
  ]
}

function orderedKeys(report, values) {
  const keys = Object.keys(values || {})
  const ordered = []
  for (const module of (report.template_snapshot?.modules || [])) {
    if (keys.includes(module.name)) ordered.push(module.name)
    for (const child of (module.children || [])) {
      const key = `${module.name}-${child.name}`
      if (keys.includes(key)) ordered.push(key)
    }
  }
  return [...ordered, ...keys.filter(key => !ordered.includes(key))]
}

function reportStyles() {
  const bodyRun = { font: { name: 'SimSun', eastAsia: 'SimSun' }, size: 24, color: COLORS.ink }
  return {
    default: {
      document: {
        run: bodyRun,
        paragraph: { spacing: { line: 360, after: 120 } },
      },
      title: {
        run: { font: { name: 'SimHei', eastAsia: 'SimHei' }, size: 40, bold: true, color: COLORS.ink },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 360 } },
      },
      heading1: {
        run: { font: { name: 'SimHei', eastAsia: 'SimHei' }, size: 32, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { name: 'SimHei', eastAsia: 'SimHei' }, size: 28, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 220, after: 120 }, keepNext: true, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { name: 'SimHei', eastAsia: 'SimHei' }, size: 24, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 180, after: 100 }, keepNext: true, outlineLevel: 2 },
      },
    },
    paragraphStyles: [
      {
        id: 'ReportBody',
        name: '报告正文',
        basedOn: 'Normal',
        next: 'ReportBody',
        quickFormat: true,
        run: bodyRun,
        paragraph: { alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 480 }, spacing: { line: 360, after: 120 } },
      },
      {
        id: 'ReportCaption',
        name: '图表题注',
        basedOn: 'Normal',
        quickFormat: true,
        run: { font: { name: 'SimSun', eastAsia: 'SimSun' }, size: 20, color: COLORS.ink },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 80, after: 160 }, keepNext: true },
      },
      {
        id: 'ReportSource',
        name: '数据来源',
        basedOn: 'Normal',
        run: { font: { name: 'SimSun', eastAsia: 'SimSun' }, size: 18, color: COLORS.muted },
        paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 120 } },
      },
    ],
  }
}

function headerFooter(report) {
  const title = report.title || report.content_json?.title || '边坡监测报告'
  return {
    headers: {
      first: new Header({ children: [new Paragraph({ text: '' })] }),
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border } },
          children: [new TextRun({ text: safeText(title), font: 'SimSun', size: 18, color: COLORS.muted })],
        })],
      }),
    },
    footers: {
      first: new Footer({ children: [new Paragraph({ text: '' })] }),
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '—  ', font: 'Times New Roman', size: 18, color: COLORS.muted }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 18, color: COLORS.muted }),
            new TextRun({ text: '  —', font: 'Times New Roman', size: 18, color: COLORS.muted }),
          ],
        })],
      }),
    },
  }
}

function coverNodes(report, content, includeToc = true) {
  const nodes = [
    new Paragraph({ spacing: { before: 2200, after: 400 }, children: [] }),
    new Paragraph({
      text: report.title || content.title || '监测报告',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 900 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: safeText(report.report_type || content.reportType || '监测报告'), font: 'SimHei', size: 28 })],
      spacing: { after: 1800 },
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `编制人：${report.author || content.author || '未填写'}`, font: 'SimSun', size: 24 })], spacing: { after: 180 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `审核人：${report.reviewer || content.reviewer || '未填写'}`, font: 'SimSun', size: 24 })], spacing: { after: 180 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `编制日期：${report.report_date || content.reportDate || '未选择'}`, font: 'SimSun', size: 24 })] }),
  ]
  if (includeToc) {
    nodes.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: '目录', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 260 } }),
      new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' })
    )
  }
  return nodes
}

function pageProperties(landscape = false, startPageNumber = undefined) {
  return {
    type: SectionType.NEXT_PAGE,
    page: {
      size: landscape
        ? { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE }
        : { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
      margin: { top: 1440, right: 1701, bottom: 1440, left: 1701, header: 720, footer: 720, gutter: 0 },
      pageNumbers: startPageNumber ? { start: startPageNumber } : undefined,
    },
  }
}

function buildContentSections(blocks, report, includeCover, cover) {
  const sections = []
  const { headers, footers } = headerFooter(report)

  if (includeCover) {
    sections.push({
      properties: { ...pageProperties(false, 1), titlePage: true },
      headers,
      footers,
      children: cover,
    })
  }

  let active = null
  blocks.forEach((block) => {
    if (!active || active.landscape !== block.landscape) {
      active = { landscape: block.landscape, children: [] }
      sections.push({
        properties: pageProperties(block.landscape, !includeCover && sections.length === 0 ? 1 : undefined),
        headers: { default: headers.default },
        footers: { default: footers.default },
        children: active.children,
      })
    }
    active.children.push(...block.nodes)
  })

  if (!sections.length) {
    sections.push({
      properties: pageProperties(false, 1),
      headers: { default: headers.default },
      footers: { default: footers.default },
      children: [paragraphFromStyle('当前报告暂无可导出内容。', null, 'body')],
    })
  }
  return sections
}

async function buildFromOriginalTemplate(report) {
  const snapshot = report.template_snapshot || {}
  if (snapshot.templateKind !== 'word' || snapshot.sourceFormat === 'pdf' || !snapshot.fileAssetId) return null

  const response = report.id
    ? await fetch(`${API_DATA}/api/reports/${report.id}/export-word`, { headers: tokenHeaders() })
    : await fetch(`${API_DATA}/api/reports/export-word-preview`, {
        method: 'POST',
        headers: tokenHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(report),
      })
  if (!response.ok) {
    let message = '按原 Word 模板导出失败'
    try {
      const payload = await response.json()
      message = payload.message || message
    } catch {
      // 保留通用提示
    }
    throw new Error(message)
  }
  return response.blob()
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function fitImageToReport(width, height, maxWidth = 520, maxHeight = 430) {
  const safeWidth = Number(width) || maxWidth
  const safeHeight = Number(height) || maxHeight
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1)
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

async function imageAssetFromUrl(url) {
  const response = await fetch(absoluteAssetUrl(url), { headers: tokenHeaders() })
  if (!response.ok) throw new Error('读取报告图片素材失败')
  const blob = await response.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!String(blob.type || '').startsWith('image/')) {
    return { bytes, transformation: { width: 520, height: 320 } }
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('无法识别布点图尺寸'))
      image.src = objectUrl
    })
    return { bytes, transformation: fitImageToReport(dimensions.width, dimensions.height) }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function renderStructuredMaterial(material, context) {
  if (!material) return []
  if (material.kind === 'text') return [paragraphFromStyle(material.value || '—', null, 'body')]
  if (material.kind === 'table') {
    const columns = material.columns || []
    const rows = (material.rows || []).slice(0, 1000).map(row => columns.map(column => row?.[column.key] ?? ''))
    const nodes = []
    if (material.note) nodes.push(paragraphFromStyle(material.note, { fontSize: 10, textAlign: 'left' }, 'body'))
    if (columns.length) {
      context.tableNo += 1
      if (material.tableLayout === 'paired-surface-weekly') {
        nodes.push(makePairedSurfaceWeeklyTable(material, context.tableNo))
        return nodes
      }
      nodes.push(captionParagraph('表', context.tableNo, material.title || '监测数据统计'))
      nodes.push(makeTable(
        columns.map(column => column.label),
        rows,
        {
          totalWidth: context.landscape ? 13700 : 9000,
          columnWeights: columns.map(column => column.width || (column.key?.includes('name') ? 1.6 : 1)),
        }
      ))
    }
    else nodes.push(paragraphFromStyle('当前报告范围内暂无表格数据', null, 'body'))
    return nodes
  }
  if (material.kind === 'chart') {
    const hasChartData = (material.series || []).some(series => (series.data || []).length > 0)
    if (!hasChartData) return [paragraphFromStyle('当前报告范围内暂无可绘制数据', null, 'body')]
    const image = await renderAcademicChartImage(material)
    const transformation = getWordChartTransformation(material)
    context.figureNo += 1
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        keepLines: true,
        children: [new ImageRun({ data: dataUrlToBytes(image), transformation })],
        spacing: { before: 120, after: 80 },
      }),
      captionParagraph('图', context.figureNo, material.title || '监测图表'),
    ]
  }
  if (material.kind === 'section-list') {
    const nodes = []
    const sections = material.sections || []
    if (!sections.length) return [paragraphFromStyle('当前报告范围内暂无可生成的边坡章节', null, 'body')]
    for (const [sectionIndex, section] of sections.entries()) {
      if (sectionIndex > 0) nodes.push(new Paragraph({ children: [new PageBreak()] }))
      nodes.push(paragraphFromStyle(section.title || '分边坡监测进展', null, 'heading', HeadingLevel.HEADING_2))
      for (const block of (section.blocks || [])) {
        if (block.title && block.kind !== 'chart' && block.tableLayout !== 'paired-surface-weekly') nodes.push(paragraphFromStyle(block.title, { fontSize: 12, fontWeight: 'bold' }, 'body'))
        nodes.push(...await renderStructuredMaterial(block, context))
      }
    }
    return nodes
  }
  if (material.kind === 'image-list') {
    const nodes = []
    for (const item of (material.items || []).slice(0, 20)) {
      try {
        const { bytes, transformation } = await imageAssetFromUrl(item.file_path)
        nodes.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ data: bytes, transformation })], spacing: { before: 120, after: 60 } }))
        context.figureNo += 1
        nodes.push(captionParagraph('图', context.figureNo, item.caption || item.original_name || '监测布点图'))
      } catch (error) {
        nodes.push(paragraphFromStyle(`[图片素材读取失败：${item.caption || item.original_name || ''}]`, null, 'body'))
      }
    }
    if (!nodes.length) nodes.push(paragraphFromStyle('所选边坡尚未维护布点图', null, 'body'))
    return nodes
  }
  return []
}

export async function buildReportWordBlob(report) {
  const inspection = inspectReportForExport(report)
  if (inspection.errors.length) throw new Error(`导出检查未通过：${inspection.errors.join('；')}`)
  const templateBlob = await buildFromOriginalTemplate(report)
  if (templateBlob) return templateBlob

  const content = report.content_json || {}
  const moduleContents = content.moduleContents || {}
  const structuredContents = content.structuredContents || {}
  const exportOptions = {
    includeCover: true,
    includeToc: true,
    includeSelectedData: false,
    ...(content.exportOptions || {}),
  }
  const cover = exportOptions.includeCover ? coverNodes(report, content, exportOptions.includeToc) : []
  const blocks = []
  const context = { figureNo: 0, tableNo: 0, landscape: false }

  for (const key of orderedKeys(report, moduleContents)) {
    const value = moduleContents[key]
    const { headingStyle, bodyStyle, headingLevel } = getContentStyles(report, key)
    blocks.push({
      landscape: false,
      nodes: [
        paragraphFromStyle(key, headingStyle, 'heading', headingLevel),
        ...await renderContent(value, report, bodyStyle),
      ],
    })
  }

  for (const key of orderedKeys(report, structuredContents)) {
    const material = structuredContents[key]
    const title = material?.title || key.replace(/^binding:/, '').replace(/^[{]|[}]$/g, '')
    const landscape = material?.kind === 'table' && (material.columns || []).length > 7
    context.landscape = landscape
    const nodes = [
      paragraphFromStyle(title, null, 'heading', HeadingLevel.HEADING_2),
      ...await renderStructuredMaterial(material, context),
    ]
    if (material?.source) nodes.push(new Paragraph({ style: 'ReportSource', children: [new TextRun({ text: `数据来源：${material.source}`, font: 'SimSun', size: 18, color: COLORS.muted })] }))
    blocks.push({ landscape, nodes })
  }

  if (content.materialProvenance?.generatedAt) {
    blocks.push({ landscape: false, nodes: [new Paragraph({ style: 'ReportSource', children: [new TextRun({ text: `报告素材生成时间：${content.materialProvenance.generatedAt}；变化速率参考值：${content.materialProvenance.rateReferenceMmPerDay ?? 2} mm/d。`, font: 'SimSun', size: 18, color: COLORS.muted })] })] })
  }

  if (exportOptions.includeSelectedData) {
    blocks.push({ landscape: false, nodes: selectedDataTable(report.selected_data || []) })
  }

  const sections = buildContentSections(blocks, report, exportOptions.includeCover, cover)
  const doc = new Document({
    creator: report.author || content.author || '边坡监测系统',
    title: report.title || content.title || '监测报告',
    description: '由边坡监测系统依据已录入数据和报告模板生成',
    styles: reportStyles(),
    settings: { updateFields: true },
    sections,
  })

  return Packer.toBlob(doc)
}

export async function exportReportToWord(report) {
  const blob = await buildReportWordBlob(report)
  downloadBlob(blob, `${fileNameSafe(report.title || report.content_json?.title)}.docx`)
}

export async function exportReportToPdf(report) {
  const wordBlob = await buildReportWordBlob(report)
  const formData = new FormData()
  formData.append('file', wordBlob, `${fileNameSafe(report.title || report.content_json?.title)}.docx`)
  const response = await fetch(`${API_DATA}/api/reports/preview-pdf`, {
    method: 'POST', headers: tokenHeaders(), body: formData,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.message || 'PDF 排版生成失败')
  }
  downloadBlob(await response.blob(), `${fileNameSafe(report.title || report.content_json?.title)}.pdf`)
}

export async function previewReportAsPdf(report) {
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.title = '正在生成 PDF 预览'
    previewWindow.document.body.innerHTML = '<p style="font:14px/1.7 sans-serif;padding:24px;color:#475569">正在生成 Word 版式预览，请稍候……</p>'
  }
  try {
    const wordBlob = await buildReportWordBlob(report)
    const formData = new FormData()
    formData.append('file', wordBlob, `${fileNameSafe(report.title || report.content_json?.title)}.docx`)
    const response = await fetch(`${API_DATA}/api/reports/preview-pdf`, {
      method: 'POST',
      headers: tokenHeaders(),
      body: formData,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.message || 'PDF 预览生成失败')
    }
    const pdfUrl = URL.createObjectURL(await response.blob())
    if (previewWindow) previewWindow.location.href = pdfUrl
    else window.open(pdfUrl, '_blank')
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 5 * 60 * 1000)
  } catch (error) {
    if (previewWindow) previewWindow.close()
    throw error
  }
}
