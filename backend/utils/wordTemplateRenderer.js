const fs = require('fs')
const path = require('path')
const { createReport, listCommands } = require('docx-templates')

const TEMPLATE_DELIMITER = ['{', '}']

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function scalar(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return typeof value === 'object' ? fallback : String(value)
}

function normalizeTable(material) {
  const columns = Array.isArray(material?.columns) ? material.columns : []
  const rows = Array.isArray(material?.rows) ? material.rows : []
  return rows.map((row, index) => {
    const normalized = { 序号: index + 1, index: index + 1 }
    columns.forEach((column) => {
      const key = column.key || column.label
      const label = column.label || column.key
      normalized[key] = scalar(row?.[key], '')
      normalized[label] = scalar(row?.[key], '')
    })
    return normalized
  })
}

function normalizeSectionList(material, materialKey = '') {
  return (material?.sections || []).map((section, index) => ({
    序号: index + 1,
    index: index + 1,
    标题: scalar(section.title),
    title: scalar(section.title),
    blocks: (section.blocks || []).map((block, blockIndex) => ({
      ...block,
      标题: scalar(block.title),
      title: scalar(block.title),
      内容: scalar(block.value || block.note),
      value: scalar(block.value || block.note),
      rows: normalizeTable(block),
      imageKey: block?.kind === 'chart' ? `section:${materialKey}:${index}:${blockIndex}` : '',
    })),
  }))
}

function dataUrlToImage(dataUrl, title = '') {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:image\/(png|jpe?g|gif|svg\+xml);base64,(.+)$/i)
  if (!match) return null
  const extension = match[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  return {
    width: 16,
    height: 9,
    data: match[2],
    extension: `.${extension}`,
    alt: title || '报告图表',
    caption: title || undefined,
  }
}

function buildTemplateData(report) {
  const content = parseJson(report.content_json, {})
  const moduleContents = content.moduleContents || {}
  const structuredContents = content.structuredContents || {}
  const chartAssets = parseJson(report.chart_assets, [])
  const selectedData = parseJson(report.selected_data, [])
  const scope = content.scope || {}
  const templateSnapshot = parseJson(report.template_snapshot, {})
  const materials = {}
  const images = {}

  Object.entries(structuredContents).forEach(([rawKey, material]) => {
    const key = rawKey.replace(/^binding:/, '').replace(/^[{]|[}]$/g, '')
    const kind = material?.kind || 'text'
    const entry = {
      key,
      kind,
      title: material?.title || key,
      note: material?.note || '',
      source: material?.source || '',
      value: scalar(material?.value || material?.note),
      rows: normalizeTable(material),
      sections: normalizeSectionList(material, key),
      raw: material,
    }
    materials[key] = entry
  })

  chartAssets.forEach((asset) => {
    const key = asset.placeholderKey || asset.key || asset.title || asset.id
    const image = dataUrlToImage(asset.imageUrl || asset.dataUrl, asset.title)
    if (key && image) images[String(key).replace(/^[{]|[}]$/g, '')] = image
    if (asset.id && image) images[String(asset.id)] = image
  })

  const data = {
    报告标题: scalar(report.title || content.title),
    报告类型: scalar(report.report_type || content.reportType),
    报告日期: scalar(report.report_date || content.reportDate),
    统计月份: scalar(report.report_period || content.reportMonth),
    汇报月份: scalar(content.meetingMonth || report.report_period),
    统计截止日期: scalar(content.cutoffDate || report.report_date),
    监理例会标题: scalar(content.supervisionMeetingTitle || report.title),
    编制人: scalar(report.author || content.author),
    审核人: scalar(report.reviewer || content.reviewer),
    标段: scalar(scope.sectionName || scope.section),
    边坡名称: scalar(scope.slopeName || scope.slope),
    report: {
      title: scalar(report.title || content.title),
      type: scalar(report.report_type || content.reportType),
      date: scalar(report.report_date || content.reportDate),
      period: scalar(report.report_period || content.reportMonth),
      author: scalar(report.author || content.author),
      reviewer: scalar(report.reviewer || content.reviewer),
    },
    scope,
    selectedData,
    materials,
    images,
    hasWarnings: Number(content.materialSummary?.warningCount || 0) > 0,
  }

  Object.entries(moduleContents).forEach(([key, value]) => {
    data[key] = scalar(value)
  })
  Object.entries(materials).forEach(([key, material]) => {
    data[key] = material.kind === 'text' ? material.value : `${material.rows.length || material.sections.length} 项`
    data[`${key}Rows`] = material.rows
    data[`${key}Sections`] = material.sections
  })

  const numericValues = selectedData
    .map(item => Number(item.value ?? item.monitoringData))
    .filter(Number.isFinite)
  const slopeNames = [...new Set(selectedData.map(item => item.slope || item.slope_name).filter(Boolean))]
  const fieldValues = {
    title: data.报告标题,
    reportType: data.报告类型,
    reportDate: data.报告日期,
    date: data.报告日期,
    reportMonth: data.统计月份,
    meetingMonth: data.汇报月份,
    cutoffDate: data.统计截止日期,
    supervisionMeetingTitle: data.监理例会标题,
    author: data.编制人,
    reviewer: data.审核人,
    section: data.标段,
    slopeName: data.边坡名称,
    slope: data.边坡名称,
    slopes: slopeNames.join('、') || data.边坡名称,
    dateRange: Array.isArray(scope.dateRange) ? scope.dateRange.filter(Boolean).join(' 至 ') : scalar(scope.dateRange),
    generateTime: scalar(content.materialProvenance?.generatedAt || new Date().toISOString()),
    maxValue: numericValues.length ? Math.max(...numericValues) : '—',
    minValue: numericValues.length ? Math.min(...numericValues) : '—',
    avgValue: numericValues.length ? (numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(2) : '—',
  }
  Object.entries(templateSnapshot.dataBindings || {}).forEach(([rawKey, binding]) => {
    if (rawKey.startsWith('__')) return
    const key = String(binding?.placeholderKey || rawKey).replace(/^[{]|[}]$/g, '')
    const field = binding?.field
    if (field && fieldValues[field] !== undefined) data[key] = fieldValues[field]
    if (materials[key]) {
      data[key] = materials[key].kind === 'text' ? materials[key].value : `${materials[key].rows.length || materials[key].sections.length} 项`
      data[`${key}Rows`] = materials[key].rows
      data[`${key}Sections`] = materials[key].sections
    }
  })

  data.日期 = fieldValues.reportDate
  data.日期范围 = fieldValues.dateRange
  data.监测边坡 = fieldValues.slopes
  data.生成时间 = fieldValues.generateTime
  data.最大值 = fieldValues.maxValue
  data.最小值 = fieldValues.minValue
  data.平均值 = fieldValues.avgValue

  return data
}

function commandLabel(command) {
  return String(command?.raw || command?.code || '').trim()
}

function validateSimpleCommands(commands) {
  const allowedTypes = new Set(['INS', 'FOR', 'END-FOR', 'IF', 'END-IF', 'IMAGE'])
  const forbidden = /(?:\b(?:constructor|prototype|__proto__|global|globalThis|process|require|module|exports|eval|Function|fetch|XMLHttpRequest)\b|=>|;|`)/
  const identifier = '[$\\p{L}_][$\\p{L}\\p{N}_]*'
  const pathExpression = new RegExp(`^${identifier}(?:\\.${identifier})*$`, 'u')
  const loopExpression = new RegExp(`^(${identifier})\\s+IN\\s+(${identifier}(?:\\.${identifier})*)$`, 'u')
  const imageExpression = new RegExp(`^image\\((?:["'“”][^"'“”]+["'“”]|${identifier}(?:\\.${identifier})*)\\)$`, 'u')
  if (commands.length > 5000) throw new Error('模板指令数量超过 5000 条，请拆分模板后重试')
  const invalid = commands.filter((command) => {
    if (!allowedTypes.has(command.type)) return true
    if (forbidden.test(commandLabel(command))) return true
    const code = String(command.code || '').trim()
    if (command.type === 'INS') return !pathExpression.test(code)
    if (command.type === 'FOR') return !loopExpression.test(code)
    if (command.type === 'END-FOR') return !new RegExp(`^${identifier}$`, 'u').test(code)
    if (command.type === 'IF') return !new RegExp(`^!?${identifier}(?:\\.${identifier})*$`, 'u').test(code)
    if (command.type === 'END-IF') return Boolean(code)
    if (command.type === 'IMAGE') return !imageExpression.test(code)
    return false
  })
  if (invalid.length) {
    const details = invalid.slice(0, 5).map(commandLabel).join('、')
    throw new Error(`模板包含不支持的高级指令：${details}。仅允许字段、FOR 循环、IF 条件和 IMAGE 图片指令。`)
  }
}

async function renderWordTemplate(templatePath, report) {
  const template = fs.readFileSync(templatePath)
  const commands = await listCommands(template, TEMPLATE_DELIMITER)
  validateSimpleCommands(commands)
  const data = buildTemplateData(report)

  return createReport({
    template,
    data,
    cmdDelimiter: TEMPLATE_DELIMITER,
    processLineBreaks: true,
    preserveSpace: true,
    fixSmartQuotes: true,
    rejectNullish: false,
    failFast: false,
    additionalJsContext: {
      image: (name) => data.images[String(name)] || null,
      hasData: (name) => {
        const material = data.materials[String(name)]
        return Boolean(material && (material.rows.length || material.sections.length || material.value !== '—'))
      },
    },
  })
}

async function validateWordTemplateFile(templatePath) {
  const template = fs.readFileSync(templatePath)
  const commands = await listCommands(template, TEMPLATE_DELIMITER)
  validateSimpleCommands(commands)
  return commands.map((command) => ({ type: command.type, raw: commandLabel(command) }))
}

function resolveUploadedTemplate(filePath) {
  const uploadRoot = path.resolve(__dirname, '..', 'uploads')
  const relative = String(filePath || '').replace(/^[/\\]+uploads[/\\]?/i, '')
  const resolved = path.resolve(uploadRoot, relative)
  if (resolved !== uploadRoot && !resolved.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error('模板文件路径不合法')
  }
  return resolved
}

module.exports = {
  buildTemplateData,
  renderWordTemplate,
  resolveUploadedTemplate,
  validateWordTemplateFile,
}
