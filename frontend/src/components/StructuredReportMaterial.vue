<template>
  <section class="structured-material" :class="{ 'is-draft': isEditableDraft }">
    <template v-if="material?.kind === 'text'">
      <div v-if="material.title || material.note" class="material-heading">
        <strong>{{ material.title }}</strong>
        <small>{{ material.note }}</small>
      </div>
      <div v-if="isEditableDraft" class="draft-editor">
        <el-alert
          title="系统生成初稿，导出前请人工确认"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-input
          :model-value="material.value || ''"
          type="textarea"
          :rows="textareaRows"
          resize="vertical"
          @update:model-value="updateText"
        />
      </div>
      <div v-else class="material-text">{{ material.value || '—' }}</div>
    </template>

    <template v-else-if="material?.kind === 'table'">
      <div class="material-heading">
        <strong>{{ material.title }}</strong>
        <small>{{ material.note }}</small>
      </div>
      <el-table :data="material.rows || []" border size="small" max-height="360" empty-text="当前报告范围内暂无数据">
        <el-table-column
          v-for="column in material.columns || []"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
    </template>

    <template v-else-if="material?.kind === 'chart'">
      <div v-if="hasChartData" ref="chartRef" class="material-chart"></div>
      <p v-else class="material-empty">当前报告范围内暂无可绘制数据</p>
    </template>

    <template v-else-if="material?.kind === 'section-list'">
      <div class="material-heading">
        <strong>{{ material.title }}</strong>
        <small>{{ material.sections?.length || 0 }} 个边坡小节</small>
      </div>
      <div v-if="material.sections?.length" class="section-list">
        <article v-for="section in material.sections" :key="section.key" class="section-item">
          <h4>{{ section.title }}</h4>
          <StructuredReportMaterial
            v-for="block in section.blocks || []"
            :key="block.key"
            :material="block"
            :editable="editable"
            class="section-block"
            @update:material="updateSectionBlock(block, $event)"
          />
        </article>
      </div>
      <p v-else class="material-empty">当前报告范围内暂无可生成的边坡章节</p>
    </template>

    <template v-else-if="material?.kind === 'image-list'">
      <div class="material-heading">
        <strong>{{ material.title }}</strong>
        <small>当前版本布点图</small>
      </div>
      <div v-if="material.items?.length" class="image-list">
        <figure v-for="item in material.items" :key="item.id">
          <img :src="absoluteAssetUrl(item.file_path)" :alt="item.caption" />
          <figcaption>{{ item.caption }}</figcaption>
        </figure>
      </div>
      <p v-else class="material-empty">所选边坡尚未维护布点图</p>
    </template>

    <p v-else class="material-empty">未找到绑定的业务数据素材</p>
    <footer v-if="material?.source">数据来源：{{ material.source }}</footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { buildAcademicChartOption } from '../utils/academicChart'
import { absoluteAssetUrl } from '../utils/reportMaterials'

const props = defineProps({
  material: { type: Object, default: null },
  editable: { type: Boolean, default: false },
})
const emit = defineEmits(['update:material'])
defineOptions({ name: 'StructuredReportMaterial' })

const chartRef = ref(null)
const hasChartData = computed(() => (props.material?.series || []).some(series => (series.data || []).length > 0))
const isEditableDraft = computed(() => props.editable && props.material?.kind === 'text' && (props.material?.draft || props.material?.editable))
const textareaRows = computed(() => {
  const lineCount = String(props.material?.value || '').split('\n').length
  return Math.min(18, Math.max(7, lineCount + 1))
})
let chart = null

function updateText(value) {
  if (props.material) props.material.value = value
  emit('update:material', { ...(props.material || {}), value })
}

function updateSectionBlock(block, nextBlock) {
  Object.assign(block, nextBlock)
  emit('update:material', props.material)
}

async function renderChart() {
  if (props.material?.kind !== 'chart' || !hasChartData.value || !chartRef.value) return
  await nextTick()
  chart ||= echarts.init(chartRef.value)
  chart.setOption(buildAcademicChartOption(props.material), true)
}

function resize() {
  chart?.resize()
}

watch(() => props.material, renderChart, { deep: true })
onMounted(() => {
  renderChart()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.structured-material {
  width: 100%;
  border: 1px solid #dfe7ec;
  background: #fff;
}

.structured-material.is-draft {
  border-color: #e6c98f;
  background: #fffdf7;
}

.material-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-bottom: 1px solid #dfe7ec;
  color: #203b50;
}

.material-heading small {
  color: #758796;
  font-size: 11px;
  font-weight: 400;
}

.material-text {
  padding: 13px 15px;
  line-height: 1.8;
  white-space: pre-line;
}

.draft-editor {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.draft-editor :deep(.el-textarea__inner) {
  color: #1f2f3a;
  font-family: "SimSun", "宋体", serif;
  font-size: 14px;
  line-height: 1.8;
}

.material-chart {
  width: 100%;
  height: 430px;
}

.material-empty {
  margin: 0;
  padding: 24px;
  color: #8c9aa5;
  text-align: center;
}

.section-list {
  padding: 12px;
}

.section-item {
  padding: 12px 0 18px;
  border-bottom: 1px solid #e8eef2;
}

.section-item:last-child {
  border-bottom: 0;
}

.section-item h4 {
  margin: 0 0 10px;
  color: #1f3547;
  font-family: SimSun, serif;
  font-size: 16px;
}

.section-block {
  margin-top: 10px;
}

.section-block :deep(.material-heading) {
  background: #f8fafb;
}

.image-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 14px;
}

.image-list figure {
  margin: 0;
}

.image-list img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  border: 1px solid #e2e8ed;
}

.image-list figcaption {
  margin-top: 7px;
  color: #52697b;
  font-family: SimSun, serif;
  font-size: 12px;
  text-align: center;
}

.structured-material footer {
  padding: 7px 12px;
  border-top: 1px solid #edf1f4;
  color: #8493a0;
  font-size: 10px;
  text-align: right;
}

@media (max-width: 720px) {
  .image-list {
    grid-template-columns: 1fr;
  }

  .material-chart {
    height: 340px;
  }
}
</style>
