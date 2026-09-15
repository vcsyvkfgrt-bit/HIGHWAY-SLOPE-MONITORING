<template>
  <section class="pdf-reader" aria-label="规范 PDF 阅读器">
    <header class="reader-toolbar">
      <div class="page-tools">
        <el-button :disabled="pageNumber <= 1" @click="goToPage(pageNumber - 1)">上一页</el-button>
        <label class="page-counter">
          <el-input-number v-model="pageNumber" :min="1" :max="pageCount || 1" controls-position="right" @change="goToPage" />
          <span>/ {{ pageCount || '—' }} 页</span>
        </label>
        <el-button :disabled="pageNumber >= pageCount" @click="goToPage(pageNumber + 1)">下一页</el-button>
      </div>
      <div class="zoom-tools">
        <el-button text aria-label="缩小" @click="changeScale(-0.15)">−</el-button>
        <span>{{ Math.round(scale * 100) }}%</span>
        <el-button text aria-label="放大" @click="changeScale(0.15)">＋</el-button>
        <el-button text @click="fitWidth">适合宽度</el-button>
        <el-button text type="primary" @click="downloadPdf">下载原文</el-button>
      </div>
    </header>

    <div ref="viewport" class="pdf-viewport" :class="{ loading }">
      <div v-if="error" class="reader-state">
        <strong>PDF 无法显示</strong>
        <span>{{ error }}</span>
        <el-button type="primary" plain @click="loadPdf">重新加载</el-button>
      </div>
      <div v-else-if="loading" class="reader-state">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>正在载入规范原文…</span>
      </div>
      <canvas v-show="!loading && !error" ref="canvas" class="pdf-canvas" />
    </div>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import { API_DATA } from '../config/api'

const props = defineProps({
  standardId: { type: [Number, String], required: true },
  modelValue: { type: Number, default: 1 },
})
const emit = defineEmits(['update:modelValue', 'loaded'])

const canvas = ref(null)
const viewport = ref(null)
const loading = ref(true)
const error = ref('')
const pageNumber = ref(props.modelValue || 1)
const pageCount = ref(0)
const scale = ref(1.15)
let pdfDocument = null
let renderTask = null
let resizeObserver = null

async function fetchPdf() {
  const response = await fetch(`${API_DATA}/api/standards/library/${props.standardId}/file`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || '读取规范文件失败')
  }
  return response.arrayBuffer()
}

async function loadPdf() {
  loading.value = true
  error.value = ''
  try {
    if (pdfDocument) await pdfDocument.destroy()
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await fetchPdf()) }).promise
    pageCount.value = pdfDocument.numPages
    pageNumber.value = Math.min(Math.max(props.modelValue || 1, 1), pageCount.value)
    emit('loaded', pageCount.value)
    await nextTick()
    await renderPage()
  } catch (err) {
    error.value = err.message || '读取规范文件失败'
  } finally {
    loading.value = false
  }
}

async function renderPage() {
  if (!pdfDocument || !canvas.value) return
  if (renderTask) {
    renderTask.cancel()
    renderTask = null
  }
  const page = await pdfDocument.getPage(pageNumber.value)
  const pageViewport = page.getViewport({ scale: scale.value })
  const outputScale = Math.min(window.devicePixelRatio || 1, 2)
  const context = canvas.value.getContext('2d')
  canvas.value.width = Math.floor(pageViewport.width * outputScale)
  canvas.value.height = Math.floor(pageViewport.height * outputScale)
  canvas.value.style.width = `${Math.floor(pageViewport.width)}px`
  canvas.value.style.height = `${Math.floor(pageViewport.height)}px`
  renderTask = page.render({
    canvasContext: context,
    viewport: pageViewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  })
  try { await renderTask.promise } catch (err) { if (err?.name !== 'RenderingCancelledException') throw err }
  renderTask = null
}

async function goToPage(value) {
  const next = Math.min(Math.max(Number(value) || 1, 1), pageCount.value || 1)
  pageNumber.value = next
  emit('update:modelValue', next)
  await renderPage()
  viewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function changeScale(delta) {
  scale.value = Math.min(Math.max(scale.value + delta, 0.55), 2.4)
  await renderPage()
}

async function fitWidth() {
  if (!pdfDocument || !viewport.value) return
  const page = await pdfDocument.getPage(pageNumber.value)
  const base = page.getViewport({ scale: 1 })
  scale.value = Math.min(Math.max((viewport.value.clientWidth - 56) / base.width, 0.55), 2.4)
  await renderPage()
}

async function downloadPdf() {
  try {
    const response = await fetch(`${API_DATA}/api/standards/library/${props.standardId}/file?download=1`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
    if (!response.ok) throw new Error('下载规范失败')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `规范-${props.standardId}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (err) { ElMessage.error(err.message) }
}

watch(() => props.modelValue, value => {
  if (value && value !== pageNumber.value && pdfDocument) goToPage(value)
})
watch(() => props.standardId, loadPdf)

onMounted(() => {
  loadPdf()
  resizeObserver = new ResizeObserver(() => {})
  if (viewport.value) resizeObserver.observe(viewport.value)
})
onBeforeUnmount(async () => {
  resizeObserver?.disconnect()
  if (renderTask) renderTask.cancel()
  if (pdfDocument) await pdfDocument.destroy()
})
</script>

<style scoped>
.pdf-reader { min-width: 0; height: 100%; display: flex; flex-direction: column; background: #e8edf2; }
.reader-toolbar { min-height: 48px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border-bottom: 1px solid #d8e0e8; }
.page-tools, .zoom-tools, .page-counter { display: flex; align-items: center; gap: 8px; }
.page-counter :deep(.el-input-number) { width: 88px; }
.page-counter span, .zoom-tools span { color: #5b6875; font-size: 13px; white-space: nowrap; }
.pdf-viewport { flex: 1; overflow: auto; padding: 28px; text-align: center; }
.pdf-canvas { display: inline-block; background: #fff; box-shadow: 0 8px 28px rgba(25, 43, 60, .16); }
.reader-state { min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #667786; }
.reader-state strong { color: #223547; font-size: 16px; }
@media (max-width: 900px) {
  .reader-toolbar { align-items: flex-start; flex-direction: column; }
  .pdf-viewport { padding: 14px; }
}
</style>
