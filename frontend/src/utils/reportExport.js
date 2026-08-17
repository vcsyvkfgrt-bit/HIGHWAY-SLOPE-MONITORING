import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import * as echarts from 'echarts'
import { API_DATA } from '../config/api'

function safeText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function fileNameSafe(value) {
  return safeText(value).replace(/[\\/:*?"<>|]/g, '_') || '监测报告'
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

function tableCell(text, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: safeText(text), bold })],
      }),
    ],
  })
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((header) => tableCell(header, true)) }),
      ...rows.map((row) => new TableRow({ children: row.map((cell) => tableCell(cell)) })),
    ],
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

function paragraphFromStyle(text, style, kind = 'body') {
  const normalized = normalizeStyle(style, kind)
  return new Paragraph({
    children: [textRunFromStyle(text, normalized)],
    alignment: alignmentFromStyle(normalized),
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
  }
}

async function createTrendChartImage(selectedData = [], slopeCategory = '') {
  const chartContainer = document.createElement('div')
  chartContainer.style.position = 'fixed'
  chartContainer.style.left = '-10000px'
  chartContainer.style.top = '-10000px'
  chartContainer.style.width = '900px'
  chartContainer.style.height = '420px'
  chartContainer.style.background = '#fff'
  document.body.appendChild(chartContainer)

  const chart = echarts.init(chartContainer, null, { renderer: 'canvas', width: 900, height: 420 })
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

  chart.setOption({
    animation: false,
    title: { text: slopeCategory ? `${slopeCategory} 监测数据趋势图` : '监测数据趋势图', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 64, right: 36, top: 58, bottom: 72 },
    xAxis: { type: 'category', data: dates.length ? dates : ['无数据'], axisLabel: { fontSize: 12 } },
    yAxis: { type: 'value', name: '监测值', axisLabel: { fontSize: 12 } },
    series: series.length ? series : [{ name: '无数据', type: 'line', data: [0] }],
  })

  await new Promise((resolve) => setTimeout(resolve, 100))
  const image = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  chart.dispose()
  document.body.removeChild(chartContainer)
  return dataUrlToBytes(image)
}

function findChartMaterial(report, materialId) {
  const savedAssets = report.chart_assets || report.chartAssets || []
  const localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
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

export async function exportReportToWord(report) {
  const content = report.content_json || {}
  const moduleContents = content.moduleContents || {}
  const children = [
    new Paragraph({
      text: report.title || content.title || '监测报告',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun(`编制人：${report.author || content.author || '未填写'}    `),
        new TextRun(`审核人：${report.reviewer || content.reviewer || '未填写'}    `),
        new TextRun(`日期：${report.report_date || content.reportDate || '未选择'}`),
      ],
      spacing: { after: 240 },
    }),
    ...selectedDataTable(report.selected_data || []),
  ]

  for (const [key, value] of Object.entries(moduleContents)) {
    const { headingStyle, bodyStyle } = getContentStyles(report, key)
    children.push(paragraphFromStyle(key, headingStyle, 'heading'))
    children.push(...await renderContent(value, report, bodyStyle))
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${fileNameSafe(report.title || content.title)}.docx`
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
