const OpenAI = require('openai')

const SECTION_KEYS = ['monitoring_overview', 'data_analysis', 'inspection_analysis', 'conclusion', 'recommendations']

const reportDraftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sections', 'overallConclusion', 'missingInformation', 'reviewNotes'],
  properties: {
    sections: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sectionKey', 'title', 'paragraphs'],
        properties: {
          sectionKey: { type: 'string', enum: SECTION_KEYS },
          title: { type: 'string' },
          paragraphs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'text', 'evidenceRefs', 'confidence'],
              properties: {
                kind: { type: 'string', enum: ['fact', 'calculation', 'analysis', 'recommendation', 'missing'] },
                text: { type: 'string' },
                evidenceRefs: { type: 'array', items: { type: 'string' } },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
        },
      },
    },
    overallConclusion: { type: 'string' },
    missingInformation: { type: 'array', items: { type: 'string' } },
    reviewNotes: { type: 'array', items: { type: 'string' } },
  },
}

function getAiStatus() {
  const provider = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase()
  const isOpenRouter = provider === 'openrouter'
  const model = String((isOpenRouter ? process.env.OPENROUTER_MODEL : process.env.OPENAI_REPORT_MODEL) || '').trim()
  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY
  return {
    configured: Boolean(apiKey && model),
    provider: isOpenRouter ? 'openrouter' : 'openai',
    model: model || null,
    mode: 'optional-human-review',
  }
}

function compactEvidence(materialPackage = {}) {
  const materials = materialPackage.materials || {}
  const compactMaterials = {}
  Object.entries(materials).forEach(([key, material]) => {
    if (!material || typeof material !== 'object') return
    if (material.kind === 'text') {
      compactMaterials[key] = { title: material.title, kind: material.kind, value: String(material.value || '').slice(0, 6000), source: material.source }
    } else if (material.kind === 'table') {
      compactMaterials[key] = { title: material.title, kind: material.kind, columns: material.columns, rows: (material.rows || []).slice(0, 120), source: material.source, totalRows: (material.rows || []).length }
    } else if (material.kind === 'chart') {
      compactMaterials[key] = {
        title: material.title, kind: material.kind, source: material.source,
        referenceLines: material.referenceLines || [],
        series: (material.series || []).slice(0, 40).map(series => ({ ...series, data: (series.data || []).slice(-80) })),
      }
    } else if (material.kind === 'section-list') {
      compactMaterials[key] = {
        title: material.title,
        kind: material.kind,
        source: material.source,
        sections: (material.sections || []).slice(0, 60).map(section => ({
          title: section.title,
          description: String(section.description || section.summary || '').slice(0, 1800),
          blocks: (section.blocks || []).slice(0, 12).map(block => {
            if (block.kind === 'chart') {
              return {
                title: block.title,
                kind: block.kind,
                source: block.source,
                series: (block.series || []).slice(0, 20).map(series => ({ ...series, data: (series.data || []).slice(-50) })),
              }
            }
            if (block.kind === 'table') return { ...block, rows: (block.rows || []).slice(0, 40) }
            return { ...block, value: String(block.value || '').slice(0, 1800) }
          }),
        })),
      }
    }
  })
  return {
    scope: materialPackage.scope || {},
    summary: materialPackage.summary || {},
    provenance: materialPackage.provenance || {},
    materials: compactMaterials,
  }
}

function reportInstructions() {
  return [
      '你是边坡监测科研报告助手。只能使用输入的证据包，不得补写或猜测数值、日期、点位、预警和现场情况。',
      '缺少证据时必须写“待人工补充”，并将 kind 设为 missing。',
      '事实、计算结果、分析判断和建议必须分开。每个非 missing 段落至少给出一个 evidenceRefs，引用格式限于 scope.<字段>、summary.<字段>、provenance.<字段> 或 materials.<素材键>。',
      '变化速率只能与证据包中的参考值比较；不将参考值表述为法定阈值或安全结论。',
      '语言严谨、简洁，适用于中文监测周报、月报或监理例会材料。所有结论和建议均需人工确认。',
    ].join('\n')
}

function reportInput(report, evidence) {
  return JSON.stringify({
    report: {
      title: report.title || '',
      reportType: report.reportType || report.report_type || '',
      reportDate: report.reportDate || report.report_date || '',
    },
    evidence,
  })
}

function validateDraft(draft, evidence) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.sections) || draft.sections.length !== SECTION_KEYS.length) {
    throw new Error('智能初稿结构不完整，请重试')
  }
  const keys = new Set((draft.sections || []).map(item => item.sectionKey))
  if (SECTION_KEYS.some(key => !keys.has(key))) throw new Error('智能初稿结构不完整，请重试')
  const malformed = draft.sections.some(section => (
    !section.title
    || !Array.isArray(section.paragraphs)
    || section.paragraphs.some(paragraph => (
      !paragraph.text
      || !['fact', 'calculation', 'analysis', 'recommendation', 'missing'].includes(paragraph.kind)
      || !Array.isArray(paragraph.evidenceRefs)
    ))
  ))
  if (
    malformed
    || typeof draft.overallConclusion !== 'string'
    || !Array.isArray(draft.missingInformation)
    || !Array.isArray(draft.reviewNotes)
  ) {
    throw new Error('智能初稿字段不完整，请重试')
  }
  const validRefs = new Set([
    ...Object.keys(evidence.scope || {}).map(key => `scope.${key}`),
    ...Object.keys(evidence.summary || {}).map(key => `summary.${key}`),
    ...Object.keys(evidence.provenance || {}).map(key => `provenance.${key}`),
    ...Object.keys(evidence.materials || {}).map(key => `materials.${key}`),
  ])
  ;(draft.sections || []).forEach(section => {
    ;(section.paragraphs || []).forEach(paragraph => {
      paragraph.evidenceRefs = (paragraph.evidenceRefs || []).map(ref => String(ref || '').replace(/^evidence\./, ''))
      const invalidRefs = paragraph.evidenceRefs.filter(ref => {
        return !validRefs.has(ref)
          && ![...validRefs].some(prefix => prefix.startsWith('materials.') && ref.startsWith(prefix + '.'))
      })
      if (!invalidRefs.length) return
      paragraph.kind = 'missing'
      paragraph.confidence = 'low'
      paragraph.evidenceRefs = []
      if (!/待人工补充/.test(paragraph.text)) {
        paragraph.text = paragraph.text + '\n【待人工补充：该段数据依据无法在本次报告素材中核验】'
      }
      draft.missingInformation.push(section.title + '：需核对数据依据（模型返回：' + invalidRefs.join('、') + '）')
    })
  })
  draft.missingInformation = [...new Set(draft.missingInformation)]
  return draft
}

async function generateWithOpenAi(status, report, evidence) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.responses.create({
    model: status.model,
    store: false,
    max_output_tokens: 6000,
    instructions: reportInstructions(),
    input: reportInput(report, evidence),
    text: {
      format: {
        type: 'json_schema',
        name: 'slope_monitoring_report_draft',
        strict: true,
        schema: reportDraftSchema,
      },
    },
  })
  if (!response.output_text) throw new Error('智能初稿服务未返回有效内容')
  return { draft: JSON.parse(response.output_text), responseId: response.id }
}

function openRouterHeaders() {
  const headers = {}
  if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL
  if (process.env.OPENROUTER_APP_NAME) headers['X-Title'] = process.env.OPENROUTER_APP_NAME
  return headers
}

async function generateWithOpenRouter(status, report, evidence) {
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultHeaders: openRouterHeaders(),
    maxRetries: 0,
  })
  const request = {
      model: status.model,
      messages: [
        { role: 'system', content: reportInstructions() },
        { role: 'user', content: reportInput(report, evidence) },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'submit_report_draft',
          description: '提交经过证据约束的边坡监测报告结构化初稿',
          parameters: reportDraftSchema,
        },
      }],
      tool_choice: { type: 'function', function: { name: 'submit_report_draft' } },
    }
  const maxRetries = Math.min(4, Math.max(0, Number(process.env.OPENROUTER_MAX_RETRIES ?? 2)))
  let response
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      response = await client.chat.completions.create(request)
      break
    } catch (error) {
      lastError = error
      const upstreamLimited = error?.status === 429
        && (error?.error?.metadata?.limit_source === 'upstream_provider_shared_pool' || /rate.?limit/i.test(String(error?.error?.metadata?.raw || error?.message)))
      if (!upstreamLimited || attempt >= maxRetries) throw error
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2500))
    }
  }
  if (!response) throw lastError || new Error('OpenRouter 未返回响应')
  const toolCall = response.choices?.[0]?.message?.tool_calls?.find(item => item.function?.name === 'submit_report_draft')
  if (!toolCall?.function?.arguments) throw new Error('当前 OpenRouter 模型未按要求返回结构化初稿，请更换支持工具调用的模型')
  return { draft: JSON.parse(toolCall.function.arguments), responseId: response.id }
}

async function generateAiReportDraft({ report = {}, materialPackage = {} }) {
  const status = getAiStatus()
  if (!status.configured) {
    const error = new Error(status.provider === 'openrouter'
      ? '智能初稿未配置：请在服务端设置 OPENROUTER_API_KEY 和 OPENROUTER_MODEL'
      : '智能初稿未配置：请在服务端设置 OPENAI_API_KEY 和 OPENAI_REPORT_MODEL')
    error.statusCode = 503
    throw error
  }

  const evidence = compactEvidence(materialPackage)
  const generated = status.provider === 'openrouter'
    ? await generateWithOpenRouter(status, report, evidence)
    : await generateWithOpenAi(status, report, evidence)
  const draft = validateDraft(generated.draft, evidence)
  return {
    ...draft,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    provider: status.provider,
    model: status.model,
    responseId: generated.responseId,
    evidenceSnapshot: { scope: evidence.scope, summary: evidence.summary, provenance: evidence.provenance },
  }
}

module.exports = { generateAiReportDraft, getAiStatus, compactEvidence }
