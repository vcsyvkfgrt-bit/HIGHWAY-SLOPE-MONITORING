function text(value) {
  return value === null || value === undefined ? '' : String(value)
}

function createCheck(code, severity, title, message, location = '', action = '') {
  return { code, severity, title, message, location, action }
}

function inspectReportQuality(report = {}) {
  const content = report.content_json || report.contentJson || {}
  const modules = content.moduleContents || {}
  const structured = content.structuredContents || {}
  const charts = report.chart_assets || report.chartAssets || []
  const checks = []

  if (!text(report.title || content.title).trim()) checks.push(createCheck('META_TITLE', 'error', '报告标题缺失', '无法形成正式报告题名。', '基本信息', '填写报告标题'))
  if (!text(report.author || content.author).trim()) checks.push(createCheck('META_AUTHOR', 'error', '编制人缺失', '正式报告应标明编制人。', '基本信息', '填写编制人'))
  if (!text(report.report_date || content.reportDate).trim()) checks.push(createCheck('META_DATE', 'warning', '报告日期缺失', '报告统计截止口径可能不明确。', '基本信息', '补充报告日期'))

  if (!Object.keys(modules).length && !Object.keys(structured).length) {
    checks.push(createCheck('CONTENT_EMPTY', 'error', '报告正文为空', '未找到文本段落或结构化素材。', '报告正文', '生成或填写报告内容'))
  }

  Object.entries(modules).forEach(([key, value]) => {
    const unresolved = text(value).match(/\{[^{}]+\}/g) || []
    if (unresolved.length) checks.push(createCheck('PLACEHOLDER_UNRESOLVED', 'warning', '存在未替换字段', `${[...new Set(unresolved)].join('、')}`, key, '补齐字段或删除占位符'))
    const referenced = [...text(value).matchAll(/\[图表素材：([^\]]+)\]/g)].map(match => match[1])
    referenced.forEach(id => {
      if (!charts.some(chart => String(chart.id) === String(id))) checks.push(createCheck('CHART_MISSING', 'error', '引用的图表缺失', `图表素材 ${id} 未随报告保存。`, key, '重新生成或移除该图表引用'))
    })
  })

  const conclusionEntries = Object.entries(modules).filter(([key, value]) => /结论|建议/.test(key) && text(value).trim())
  if (conclusionEntries.length && !content.aiDraft && !content.materialProvenance?.generatedAt) {
    checks.push(createCheck(
      'CONCLUSION_PROVENANCE_MISSING',
      'error',
      '结论缺少数据来源记录',
      '正文包含结论或建议，但未保存本次统计素材的生成时间和来源。',
      conclusionEntries.map(([key]) => key).join('、'),
      '重新加载报告素材后再生成结论'
    ))
  }

  Object.entries(structured).forEach(([key, material]) => {
    const title = material?.title || key
    if (material?.kind === 'table') {
      const columns = material.columns || []
      const rows = material.rows || []
      if (!rows.length) checks.push(createCheck('TABLE_EMPTY', 'warning', '表格无数据', `“${title}”没有可导出数据。`, title, '检查数据范围或移除空表'))
      if (columns.length > 7) checks.push(createCheck('TABLE_WIDE', 'info', '宽表版式复核', `“${title}”包含 ${columns.length} 列，将使用横向页。`, title, '通过 PDF 版式预览确认'))
      const missingKeys = columns.filter(column => rows.some(row => row && !(column.key in row))).map(column => column.label || column.key)
      if (missingKeys.length) checks.push(createCheck('TABLE_FIELD_MISMATCH', 'warning', '表格字段不完整', `“${title}”部分行缺少：${[...new Set(missingKeys)].join('、')}。`, title, '复核素材字段绑定'))
    }
    if (material?.kind === 'chart') {
      const series = material.series || []
      if (!series.some(item => (item.data || []).length)) checks.push(createCheck('CHART_EMPTY', 'warning', '图表无数据', `“${title}”无可绘制序列。`, title, '检查监测日期和数值'))
      const units = [...new Set(series.map(item => text(item.unit).trim()).filter(Boolean))]
      if (units.length > 1 && material.chartType !== 'rainfall-overlay') checks.push(createCheck('CHART_UNIT_MIXED', 'warning', '图表单位混用', `“${title}”包含 ${units.join('、')} 多种单位。`, title, '分图展示或明确次坐标轴'))
      if (series.some(item => (item.data || []).length && !text(item.unit).trim())) checks.push(createCheck('CHART_UNIT_MISSING', 'warning', '图表序列缺少单位', `“${title}”至少一个数据序列未标明单位。`, title, '补充纵轴和图例单位'))
      const invalidPoints = series.flatMap(item => item.data || []).filter(point => !Array.isArray(point) || !/^\d{4}-\d{2}-\d{2}/.test(text(point[0])) || !Number.isFinite(Number(point[1])))
      if (invalidPoints.length) checks.push(createCheck('CHART_POINT_INVALID', 'error', '图表数据格式异常', `“${title}”有 ${invalidPoints.length} 个点缺少有效日期或数值。`, title, '修正原始日期和监测值'))
    }
  })

  charts.forEach((chart, index) => {
    if (!text(chart.title).trim()) checks.push(createCheck('CAPTION_MISSING', 'warning', '图表题注缺失', `第 ${index + 1} 个图表没有题名，导出后无法形成清晰图注。`, '图表素材', '补充图表标题'))
    if (!text(chart.imageUrl).trim()) checks.push(createCheck('CHART_IMAGE_MISSING', 'error', '图表图像缺失', `“${chart.title || '未命名图表'}”没有可导出的图像内容。`, '图表素材', '重新生成图表'))
  })

  const summary = content.materialSummary || {}
  const selected = report.selected_data || report.selectedData || []
  if (Number.isFinite(Number(summary.observationCount)) && selected.length && Number(summary.observationCount) !== selected.length) {
    checks.push(createCheck('COUNT_SCOPE_DIFFERENCE', 'info', '数据口径需确认', `素材包统计 ${summary.observationCount} 条，报告附带 ${selected.length} 条已选数据。`, '数据范围', '确认是否为预期的统计口径'))
  }

  const aiDraft = content.aiDraft
  const aiReview = content.aiReview || {}
  if (aiDraft && aiReview.appliedAt && aiReview.status !== 'confirmed') checks.push(createCheck('AI_UNCONFIRMED', 'error', '智能初稿未人工确认', '已写入正文的智能内容仍处于草稿或审核中状态。', '智能初稿', '逐段核对证据后确认'))
  ;(aiDraft?.sections || []).forEach(section => {
    ;(section.paragraphs || []).forEach((paragraph, index) => {
      if (paragraph.kind !== 'missing' && !(paragraph.evidenceRefs || []).length) checks.push(createCheck('AI_EVIDENCE_MISSING', 'error', '智能段落无证据引用', `“${section.title}”第 ${index + 1} 段无法追溯到数据素材。`, section.title, '补充证据引用或删除该段'))
    })
  })

  checks.push(createCheck('LAYOUT_PDF_REVIEW', 'info', '最终版式需预览', '孤立标题、空白页、图例可读性与图表跨页需由 Word/PDF 排版引擎确认。', '导出版式', '使用“版式预览”逐页检查'))

  const counts = checks.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] || 0) + 1 }), { error: 0, warning: 0, info: 0 })
  const score = Math.max(0, 100 - counts.error * 18 - counts.warning * 7 - counts.info * 1)
  return {
    score,
    level: counts.error ? 'blocked' : counts.warning ? 'review' : 'ready',
    canExport: counts.error === 0,
    counts,
    checks,
    checkedAt: new Date().toISOString(),
  }
}

module.exports = { inspectReportQuality }
