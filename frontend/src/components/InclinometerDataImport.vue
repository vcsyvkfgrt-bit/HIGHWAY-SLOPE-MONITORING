<template>
  <div class="inclinometer-import">
    <div class="import-toolbar">
      <div class="toolbar-left">
        <el-select
          v-model="selectedPointId"
          placeholder="选择测斜孔"
          filterable
          style="width: 240px"
          @change="loadBaselineStatus"
        >
          <el-option
            v-for="point in points"
            :key="point.id"
            :label="point.point_name"
            :value="String(point.id)"
          />
        </el-select>
        <el-tag v-if="baselineStatus?.has_baseline" type="success" effect="plain">
          已上传初始值
        </el-tag>
        <el-tag v-else type="warning" effect="plain">
          暂无初始值
        </el-tag>
      </div>
      <div class="toolbar-actions">
        <el-checkbox v-model="overwriteBaseline">覆盖已有初始值</el-checkbox>
        <el-upload
          action=""
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="handleBaselineFile"
        >
          <el-button type="primary" :loading="uploadingBaseline">
            <el-icon><Upload /></el-icon>
            上传初始值
          </el-button>
        </el-upload>
        <el-upload
          action=""
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="handleSurveyFile"
        >
          <el-button type="success" :loading="uploadingSurveys">
            <el-icon><Upload /></el-icon>
            上传观测数据
          </el-button>
        </el-upload>
      </div>
    </div>

    <el-alert
      v-if="selectedPointId && !baselineStatus?.has_baseline"
      title="该测斜孔暂无初始值，请先上传初始值数据。上传初始值后，系统才会接收后续观测数据并生成累积位移曲线、相对位移曲线。"
      type="warning"
      :closable="false"
      show-icon
      class="status-alert"
    />

    <el-descriptions v-if="baselineStatus?.baseline" :column="4" size="small" border class="baseline-desc">
      <el-descriptions-item label="测孔">{{ baselineStatus.baseline.hole_name }}</el-descriptions-item>
      <el-descriptions-item label="初始日期">{{ formatDate(baselineStatus.baseline.baseline_date) }}</el-descriptions-item>
      <el-descriptions-item label="孔深">{{ baselineStatus.baseline.data_length ?? '-' }} m</el-descriptions-item>
      <el-descriptions-item label="深度点">{{ baselineStatus.baseline.reading_count ?? 0 }}</el-descriptions-item>
    </el-descriptions>

    <el-table v-if="importResults.length" :data="importResults" border size="small" class="result-table">
      <el-table-column prop="hole" label="测孔" width="120" />
      <el-table-column prop="type" label="导入类型" width="120" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.ok ? 'success' : 'danger'" effect="plain">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="message" label="说明" min-width="260" show-overflow-tooltip />
      <el-table-column prop="count" label="数量" width="120" align="right" />
    </el-table>

    <el-card v-if="selectedPointId" class="current-data-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>当前测点数据列表</span>
          <div class="card-actions">
            <el-button size="small" @click="loadCurrentPointData" :loading="profileLoading">刷新</el-button>
            <el-button size="small" type="primary" @click="goViewCurve">查看曲线</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="!profileLoading && currentProfile && !currentProfile.has_baseline"
        title="暂无初始值，请先上传初始值。"
        type="warning"
        :closable="false"
        show-icon
      />

      <template v-else-if="currentProfile?.has_baseline">
        <el-descriptions :column="4" size="small" border class="baseline-desc">
          <el-descriptions-item label="测孔">{{ currentProfile.baseline.hole_name }}</el-descriptions-item>
          <el-descriptions-item label="初始日期">{{ formatDate(currentProfile.baseline.baseline_date) }}</el-descriptions-item>
          <el-descriptions-item label="孔深">{{ currentProfile.baseline.data_length ?? '-' }} m</el-descriptions-item>
          <el-descriptions-item label="深度点数">{{ currentProfile.baseline.readings?.length ?? 0 }}</el-descriptions-item>
        </el-descriptions>

        <el-table
          :data="surveyRows"
          border
          size="small"
          class="survey-table"
          empty-text="暂无观测数据"
        >
          <el-table-column prop="hole_name" label="测孔名称" width="120" />
          <el-table-column prop="survey_no" label="测试次数" width="100" align="center" />
          <el-table-column prop="survey_date" label="测试日期" width="130" align="center" />
          <el-table-column prop="reading_count" label="深度点数" width="110" align="right" />
          <el-table-column prop="max_cumulative" label="最大累积位移" width="140" align="right">
            <template #default="{ row }">{{ formatNumber(row.max_cumulative) }} mm</template>
          </el-table-column>
          <el-table-column prop="max_relative" label="最大相对位移" width="140" align="right">
            <template #default="{ row }">{{ formatNumber(row.max_relative) }} mm</template>
          </el-table-column>
          <el-table-column prop="source_file" label="来源文件" min-width="180" show-overflow-tooltip />
          <el-table-column prop="created_at" label="上传时间" width="170" align="center">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="190" fixed="right" align="center">
            <template #default="{ row }">
              <el-button type="primary" link @click="showSurveyDetail(row)">明细</el-button>
              <el-button type="primary" link @click="editSurvey(row)">编辑</el-button>
              <el-button
                type="danger"
                link
                :loading="deletingSurveyId === row.id"
                @click="deleteSurvey(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-empty
      v-if="!points.length"
      description="当前边坡下没有深部位移测斜孔，请先到边坡与测点管理创建。"
      :image-size="72"
    />

    <el-dialog v-model="detailDialogVisible" title="测斜观测深度明细" width="900px">
      <el-descriptions v-if="currentSurvey" :column="3" size="small" border class="detail-desc">
        <el-descriptions-item label="测孔">{{ currentSurvey.hole_name }}</el-descriptions-item>
        <el-descriptions-item label="测试日期">{{ currentSurvey.survey_date }}</el-descriptions-item>
        <el-descriptions-item label="深度点数">{{ currentSurvey.reading_count }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="currentSurvey?.readings || []" border size="small" max-height="520">
        <el-table-column prop="depth_m" label="孔深/m" width="110" align="right" />
        <el-table-column prop="forward_reading" label="正向读数" width="120" align="right" />
        <el-table-column prop="reverse_reading" label="反向读数" width="120" align="right" />
        <el-table-column prop="test_value" label="测试值" width="120" align="right" />
        <el-table-column prop="cumulative_displacement" label="累积位移" width="120" align="right" />
        <el-table-column prop="relative_displacement" label="相对位移" width="120" align="right" />
      </el-table>
    </el-dialog>

    <el-dialog
      v-model="editDialogVisible"
      title="编辑测斜观测数据"
      width="1080px"
      :close-on-click-modal="false"
    >
      <template v-if="editableSurvey">
        <el-form :model="editableSurvey" label-width="82px" class="edit-form">
          <el-form-item label="测试次数">
            <el-input-number v-model="editableSurvey.survey_no" :min="1" :precision="0" />
          </el-form-item>
          <el-form-item label="测试日期">
            <el-date-picker
              v-model="editableSurvey.survey_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
            />
          </el-form-item>
          <el-form-item label="来源文件">
            <el-input v-model="editableSurvey.source_file" />
          </el-form-item>
        </el-form>

        <el-table :data="editableSurvey.readings" border size="small" max-height="520" class="edit-table">
          <el-table-column prop="depth_m" label="孔深/m" width="100" align="right" />
          <el-table-column label="正向读数" width="150" align="right">
            <template #default="{ row }">
              <el-input-number
                v-model="row.forward_reading"
                :precision="3"
                :controls="false"
                class="reading-input"
                @change="recalculateEditableSurvey"
              />
            </template>
          </el-table-column>
          <el-table-column label="反向读数" width="150" align="right">
            <template #default="{ row }">
              <el-input-number
                v-model="row.reverse_reading"
                :precision="3"
                :controls="false"
                class="reading-input"
                @change="recalculateEditableSurvey"
              />
            </template>
          </el-table-column>
          <el-table-column prop="test_value" label="测试值" width="120" align="right">
            <template #default="{ row }">{{ formatNumber(row.test_value) }}</template>
          </el-table-column>
          <el-table-column prop="cumulative_displacement" label="偏差值/累计位移" width="150" align="right">
            <template #default="{ row }">{{ formatNumber(row.cumulative_displacement) }}</template>
          </el-table-column>
          <el-table-column prop="relative_displacement" label="相对变形" width="120" align="right">
            <template #default="{ row }">{{ formatNumber(row.relative_displacement) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingSurvey" @click="saveSurveyEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import { useRouter } from 'vue-router'
import { dataRequest } from '../utils/request'

const props = defineProps({
  points: {
    type: Array,
    default: () => [],
  },
})

const router = useRouter()
const selectedPointId = ref('')
const baselineStatus = ref(null)
const overwriteBaseline = ref(false)
const uploadingBaseline = ref(false)
const uploadingSurveys = ref(false)
const importResults = ref([])
const currentProfile = ref(null)
const profileLoading = ref(false)
const detailDialogVisible = ref(false)
const currentSurvey = ref(null)
const editDialogVisible = ref(false)
const editableSurvey = ref(null)
const savingSurvey = ref(false)
const deletingSurveyId = ref(null)

const surveyRows = computed(() => {
  const baseline = currentProfile.value?.baseline
  const holeName = baseline?.hole_name || ''
  return [...(currentProfile.value?.surveys || [])]
    .map((survey) => ({
      ...survey,
      hole_name: holeName,
      reading_count: survey.readings?.length || 0,
    }))
    .sort((a, b) => String(b.survey_date || '').localeCompare(String(a.survey_date || '')))
})

const pointByName = computed(() => {
  const map = new Map()
  props.points.forEach((point) => {
    map.set(String(point.point_name || '').trim(), point)
  })
  return map
})

const pointByNormalizedName = computed(() => {
  const map = new Map()
  props.points.forEach((point) => {
    const key = normalizePointName(point.point_name)
    if (key && !map.has(key)) map.set(key, point)
  })
  return map
})

watch(
  () => props.points,
  () => {
    selectedPointId.value = props.points[0] ? String(props.points[0].id) : ''
    baselineStatus.value = null
    if (selectedPointId.value) loadBaselineStatus()
  },
  { immediate: true }
)

function asText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function asNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const text = String(value).replace(/米|m/gi, '').trim()
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

function round3(value) {
  const num = asNumber(value)
  return num === null ? null : Math.round(num * 1000) / 1000
}

function round4(value) {
  const num = asNumber(value)
  return num === null ? null : Math.round((num + Number.EPSILON) * 10000) / 10000
}

function readingIncrement(row) {
  const forward = asNumber(row.forward_reading)
  const reverse = asNumber(row.reverse_reading)
  if (forward === null || reverse === null) return null
  return round4((forward - reverse) / 2)
}

function normalizeBaselineValues(readings, preferReadings = false) {
  let previousValue = 0
  return readings
    .map((row) => {
      const increment = readingIncrement(row)
      let baselineValue = preferReadings && increment !== null
        ? round4(previousValue + increment)
        : round4(row.baseline_value)
      if (baselineValue === null && increment !== null) baselineValue = round4(previousValue + increment)
      if (baselineValue !== null) previousValue = baselineValue
      return {
        ...row,
        baseline_value: baselineValue,
      }
    })
    .filter((row) => row.depth_m !== null && row.baseline_value !== null)
}

function calculateSurveyValues(readings, baselineReadings, filterInvalid = true, preferReadings = false) {
  const normalizedBaselineReadings = normalizeBaselineValues(baselineReadings, true)
  const baselineMap = new Map(
    normalizedBaselineReadings.map((row) => [Number(row.depth_m).toFixed(3), Number(row.baseline_value)])
  )
  let previousTestValue = 0
  let previousBias = null

  const calculated = readings
    .map((row) => {
      const depth = asNumber(row.depth_m)
      const increment = readingIncrement(row)
      let testValue = preferReadings && increment !== null ? round4(previousTestValue + increment) : round4(row.test_value)
      if (testValue === null && increment !== null) testValue = round4(previousTestValue + increment)

      const baselineValue = depth === null ? undefined : baselineMap.get(depth.toFixed(3))
      let biasValue = preferReadings ? null : round4(row.cumulative_displacement)
      if (biasValue === null && testValue !== null && baselineValue !== undefined) {
        biasValue = round4(testValue - baselineValue)
      }

      let relativeValue = preferReadings ? null : round4(row.relative_displacement)
      if (relativeValue === null && biasValue !== null) {
        relativeValue = round4(previousBias === null ? biasValue : biasValue - previousBias)
      }

      if (testValue !== null) previousTestValue = testValue
      if (biasValue !== null) previousBias = biasValue

      return {
        ...row,
        depth_m: depth ?? row.depth_m,
        test_value: testValue,
        cumulative_displacement: biasValue,
        relative_displacement: relativeValue,
      }
    })

  return filterInvalid
    ? calculated.filter((row) => row.depth_m !== null && row.test_value !== null)
    : calculated
}

function normalizeSurveyValues(readings, baselineReadings) {
  return calculateSurveyValues(readings, baselineReadings, true, true)
}

function normalizePointName(value) {
  return asText(value).toLowerCase()
}

function findPointByName(holeName) {
  return pointByName.value.get(holeName) || pointByNormalizedName.value.get(normalizePointName(holeName))
}

function inferHoleNameFromFile(fileName) {
  const name = asText(fileName).replace(/\.[^.]+$/, '')
  const beforeBracket = name.split(/[（(]/)[0]
  return beforeBracket.trim() || name.trim()
}

function normalizeDate(value) {
  const text = asText(value)
  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 19).replace('T', ' ')
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : '-'
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function getCell(rows, rowIndex, colIndex) {
  return rows[rowIndex]?.[colIndex] ?? ''
}

function parseRawInclinometerSheet(sheetName, rows, fileName) {
  if (asText(getCell(rows, 0, 0)) !== '孔深') return null

  const holeName = sheetName === '原始数据' ? inferHoleNameFromFile(fileName) || sheetName : sheetName
  const dataRows = rows.slice(2)
  const depths = dataRows.map((row) => asNumber(getCell([row], 0, 0))).filter((value) => value !== null)
  const interval = depths.length > 1 ? round3(Math.abs(depths[1] - depths[0])) : null
  const dataLength = depths.length ? Math.max(...depths) : null
  const surveys = []

  for (let c = 1; c < (rows[0]?.length || 0); c += 2) {
    const header = asText(getCell(rows, 0, c))
    const match = header.match(/^(\d+).*?[\uFF08(](\d{4}[./-]\d{1,2}[./-]\d{1,2})[\uFF09)]$/)
    if (!match) continue

    const surveyNo = asNumber(match[1])
    const surveyDate = normalizeDate(match[2])
    const readings = []

    for (let r = 2; r < rows.length; r += 1) {
      const depth = asNumber(getCell(rows, r, 0))
      const forward = asNumber(getCell(rows, r, c))
      const reverse = asNumber(getCell(rows, r, c + 1))
      if (depth === null || forward === null || reverse === null) continue
      readings.push({
        depth_m: depth,
        forward_reading: forward,
        reverse_reading: reverse,
        test_value: null,
        cumulative_displacement: null,
        relative_displacement: null,
      })
    }

    if (surveyDate && readings.length) {
      surveys.push({
        survey_no: surveyNo,
        survey_date: surveyDate,
        readings,
      })
    }
  }

  if (!surveys.length) return null

  const baselineReadings = normalizeBaselineValues(
    surveys[0].readings.map((row) => ({
      depth_m: row.depth_m,
      forward_reading: row.forward_reading,
      reverse_reading: row.reverse_reading,
      baseline_value: row.test_value,
    })),
    true
  )
  const normalizedSurveys = surveys.map((survey) => ({
    ...survey,
    readings: normalizeSurveyValues(survey.readings, baselineReadings),
  }))

  return {
    sheetName,
    holeName,
    baseline: {
      hole_name: holeName,
      baseline_date: surveys[0].survey_date,
      test_basis: '孔底',
      measure_interval: interval,
      data_length: dataLength,
      readings: baselineReadings,
    },
    surveys: normalizedSurveys,
  }
}

function parseWorkbook(file, fileName = '') {
  const workbook = XLSX.read(file, { type: 'array' })
  const parsed = []

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
    const rawParsed = parseRawInclinometerSheet(sheetName, rows, fileName)
    if (rawParsed) {
      parsed.push(rawParsed)
      return
    }

    if (sheetName === '原始数据') return
    const holeName = asText(getCell(rows, 1, 1)) || sheetName
    const baselineDate = normalizeDate(getCell(rows, 3, 1))
    const interval = asNumber(getCell(rows, 6, 1))
    const dataLength = asNumber(getCell(rows, 7, 1))
    const testBasis = asText(getCell(rows, 4, 1))

    if (!holeName || !baselineDate || asText(getCell(rows, 10, 0)) !== '孔深/m') return

    const baselineReadings = []
    for (let r = 11; r < rows.length; r += 1) {
      const depth = asNumber(getCell(rows, r, 0))
      const baselineValue = asNumber(getCell(rows, r, 3))
      if (depth === null) continue
      baselineReadings.push({
        depth_m: depth,
        forward_reading: asNumber(getCell(rows, r, 1)),
        reverse_reading: asNumber(getCell(rows, r, 2)),
        baseline_value: baselineValue,
      })
    }

    const surveys = []
    for (let c = 4; c < (rows[0]?.length || 0); c += 5) {
      const surveyDate = normalizeDate(getCell(rows, 3, c))
      if (!surveyDate) continue
      const readings = []
      for (let r = 11; r < rows.length; r += 1) {
        const depth = asNumber(getCell(rows, r, 0))
        const forward = asNumber(getCell(rows, r, c))
        const reverse = asNumber(getCell(rows, r, c + 1))
        const testValue = asNumber(getCell(rows, r, c + 2))
        if (depth === null || (testValue === null && (forward === null || reverse === null))) continue
        readings.push({
          depth_m: depth,
          forward_reading: forward,
          reverse_reading: reverse,
          test_value: testValue,
          cumulative_displacement: asNumber(getCell(rows, r, c + 3)),
          relative_displacement: asNumber(getCell(rows, r, c + 4)),
        })
      }
      if (readings.length) {
        surveys.push({
          survey_no: asNumber(getCell(rows, 2, c)),
          survey_date: surveyDate,
          readings,
        })
      }
    }

    const normalizedBaselineReadings = normalizeBaselineValues(baselineReadings, true)
    const normalizedSurveys = surveys.map((survey) => ({
      ...survey,
      readings: normalizeSurveyValues(survey.readings, normalizedBaselineReadings),
    }))

    parsed.push({
      sheetName,
      holeName,
      baseline: {
        hole_name: holeName,
        baseline_date: baselineDate,
        test_basis: testBasis,
        measure_interval: interval,
        data_length: dataLength,
        readings: normalizedBaselineReadings,
      },
      surveys: normalizedSurveys,
    })
  })

  return parsed
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const raw = file.raw || file
    const reader = new FileReader()
    reader.onload = (event) => resolve(new Uint8Array(event.target.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsArrayBuffer(raw)
  })
}

async function loadBaselineStatus() {
  if (!selectedPointId.value) return
  try {
    const result = await dataRequest(`/api/inclinometer-data/baseline/status?point_id=${selectedPointId.value}`)
    baselineStatus.value = result.data
    await loadCurrentPointData()
  } catch (error) {
    baselineStatus.value = null
    currentProfile.value = null
    ElMessage.error(error.message || '获取初始值状态失败')
  }
}

async function loadCurrentPointData() {
  if (!selectedPointId.value) return
  profileLoading.value = true
  try {
    const result = await dataRequest(`/api/inclinometer-data/profile?point_id=${selectedPointId.value}`)
    currentProfile.value = result.data
  } catch (error) {
    currentProfile.value = null
    ElMessage.error(error.message || '加载当前测点数据失败')
  } finally {
    profileLoading.value = false
  }
}

function showSurveyDetail(row) {
  currentSurvey.value = row
  detailDialogVisible.value = true
}

function editSurvey(row) {
  editableSurvey.value = cloneData(row)
  recalculateEditableSurvey()
  editDialogVisible.value = true
}

function recalculateEditableSurvey() {
  if (!editableSurvey.value) return
  const baselineReadings = currentProfile.value?.baseline?.readings || []
  editableSurvey.value.readings = calculateSurveyValues(editableSurvey.value.readings, baselineReadings, false, true)
}

async function saveSurveyEdit() {
  if (!editableSurvey.value?.id) return
  if (!editableSurvey.value.survey_date) {
    ElMessage.warning('请选择测试日期')
    return
  }

  savingSurvey.value = true
  try {
    recalculateEditableSurvey()
    await dataRequest(`/api/inclinometer-data/surveys/${editableSurvey.value.id}`, {
      method: 'PUT',
      body: {
        survey_no: editableSurvey.value.survey_no,
        survey_date: editableSurvey.value.survey_date,
        source_file: editableSurvey.value.source_file,
        readings: editableSurvey.value.readings,
      },
    })
    ElMessage.success('测斜观测数据已保存')
    editDialogVisible.value = false
    await loadCurrentPointData()
    await loadBaselineStatus()
  } catch (error) {
    ElMessage.error(error.message || '保存测斜观测数据失败')
  } finally {
    savingSurvey.value = false
  }
}

async function deleteSurvey(row) {
  if (!row?.id) return
  try {
    await ElMessageBox.confirm(
      `确定删除 ${row.hole_name || '该测斜孔'} ${row.survey_date || ''} 这一期观测数据吗？删除后该期曲线和深度明细都会移除。`,
      '删除测斜观测期',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  deletingSurveyId.value = row.id
  try {
    await dataRequest(`/api/inclinometer-data/surveys/${row.id}`, {
      method: 'DELETE',
    })
    ElMessage.success('该期测斜观测数据已删除')
    if (currentSurvey.value?.id === row.id) {
      detailDialogVisible.value = false
      currentSurvey.value = null
    }
    await loadCurrentPointData()
    await loadBaselineStatus()
  } catch (error) {
    ElMessage.error(error.message || '删除测斜观测数据失败')
  } finally {
    deletingSurveyId.value = null
  }
}

function goViewCurve() {
  if (!selectedPointId.value) return
  router.push({
    path: '/data-view',
    query: {
      monitoringType: '深部位移测斜孔',
      pointId: selectedPointId.value,
    },
  })
}

async function handleBaselineFile(file) {
  uploadingBaseline.value = true
  importResults.value = []
  try {
    const parsed = parseWorkbook(await readFile(file), file.name)
    if (!parsed.length) throw new Error('没有识别到有效的测斜孔 sheet')

    for (const item of parsed) {
      const point = findPointByName(item.holeName)
      if (!point) {
        importResults.value.push({ hole: item.holeName, type: '初始值', ok: false, status: '跳过', message: '系统中没有同名测斜孔', count: 0 })
        continue
      }

      try {
        const result = await dataRequest('/api/inclinometer-data/baseline', {
          method: 'POST',
          body: {
            point_id: point.id,
            source_file: file.name,
            overwrite: overwriteBaseline.value,
            ...item.baseline,
          },
        })
        importResults.value.push({
          hole: item.holeName,
          type: '初始值',
          ok: true,
          status: '成功',
          message: result.message,
          count: result.data?.reading_count || item.baseline.readings.length,
        })
      } catch (error) {
        importResults.value.push({ hole: item.holeName, type: '初始值', ok: false, status: '失败', message: error.message, count: 0 })
      }
    }

    await loadBaselineStatus()
  } catch (error) {
    ElMessage.error(error.message || '导入初始值失败')
  } finally {
    uploadingBaseline.value = false
  }
}

async function handleSurveyFile(file) {
  uploadingSurveys.value = true
  importResults.value = []
  try {
    const parsed = parseWorkbook(await readFile(file), file.name)
    if (!parsed.length) throw new Error('没有识别到有效的测斜孔 sheet')

    for (const item of parsed) {
      const point = findPointByName(item.holeName)
      if (!point) {
        importResults.value.push({ hole: item.holeName, type: '观测数据', ok: false, status: '跳过', message: '系统中没有同名测斜孔', count: 0 })
        continue
      }

      try {
        const result = await dataRequest('/api/inclinometer-data/surveys/batch', {
          method: 'POST',
          body: {
            point_id: point.id,
            source_file: file.name,
            test_basis: item.baseline.test_basis,
            measure_interval: item.baseline.measure_interval,
            data_length: item.baseline.data_length,
            overwrite: true,
            surveys: item.surveys,
          },
        })
        importResults.value.push({
          hole: item.holeName,
          type: '观测数据',
          ok: true,
          status: '成功',
          message: result.message,
          count: result.data?.imported_surveys || item.surveys.length,
        })
      } catch (error) {
        importResults.value.push({ hole: item.holeName, type: '观测数据', ok: false, status: '失败', message: error.message, count: 0 })
      }
    }

    await loadBaselineStatus()
  } catch (error) {
    ElMessage.error(error.message || '导入观测数据失败')
  } finally {
    uploadingSurveys.value = false
  }
}
</script>

<style scoped>
.inclinometer-import {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.import-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status-alert,
.baseline-desc,
.result-table {
  margin-top: 4px;
}

.current-data-card {
  margin-top: 4px;
}

.card-header,
.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.survey-table {
  margin-top: 12px;
}

.detail-desc {
  margin-bottom: 12px;
}
</style>
