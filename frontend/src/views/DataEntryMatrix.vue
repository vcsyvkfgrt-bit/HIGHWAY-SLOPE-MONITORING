<template>
  <div class="data-entry-page">
    <div class="entry-workspace">
      <header class="entry-page-header">
        <div>
          <h2>边坡监测数据录入</h2>
        </div>
        <el-button :icon="Download" @click="exportTemplate" :disabled="!pointsByType.length || selectedPointType === DEEP_POINT_TYPE">
          下载录入模板
        </el-button>
      </header>

      <section class="context-band" v-loading="slopeContextLoading">
        <div class="context-controls">
          <label class="field-block section-field">
            <span>所属标段</span>
            <el-select
              :model-value="selectedSection"
              placeholder="请选择标段"
              filterable
              clearable
              @change="onSectionChange"
            >
              <el-option
                v-for="section in sectionOptions"
                :key="section"
                :label="section"
                :value="section"
              />
            </el-select>
          </label>

          <label class="field-block slope-field">
            <span>监测边坡</span>
            <el-select
              v-model="selectedSlopeId"
              :placeholder="selectedSection ? '请选择边坡' : '请先选择标段'"
              filterable
              clearable
              :disabled="!selectedSection"
              @change="onSlopeChange"
            >
              <el-option
                v-for="s in filteredSlopes"
                :key="s.id"
                :label="s.slope_name"
                :value="String(s.id)"
              />
            </el-select>
          </label>

          <label class="field-block type-field">
            <span>监测类型</span>
            <el-select
              :model-value="selectedPointType"
              :placeholder="selectedSlopeId ? '请选择监测类型' : '请先选择边坡'"
              :disabled="!selectedSlopeId"
              @change="selectPointType"
            >
              <el-option
                v-for="t in POINT_TYPES"
                :key="t"
                :disabled="!selectedSlopeId || (typeCounts[t] ?? 0) === 0"
                :label="`${t}（${typeCounts[t] ?? 0} 个测点）`"
                :value="t"
              >
                <div class="type-option">
                  <span>{{ t }}</span>
                  <em>{{ typeCounts[t] ?? 0 }} 个测点</em>
                </div>
              </el-option>
            </el-select>
          </label>
        </div>

        <div v-if="selectedSlopeId" class="context-summary">
          <div><span>边坡类型</span><strong>{{ currentSlopeDetail?.slope_type || '-' }}</strong></div>
          <div><span>所在范围</span><strong>{{ currentSlopeDetail?.location || '-' }}</strong></div>
          <div><span>实体测点</span><strong>{{ allPointsOnSlopeCount }}</strong></div>
          <div><span>本类测点</span><strong>{{ pointsByType.length }}</strong></div>
          <div><span>本期可录</span><strong>{{ activePointCount }}</strong></div>
        </div>
        <div v-if="selectedSlopeId && selectedPointType !== DEEP_POINT_TYPE" class="existing-data-panel" v-loading="existingSummaryLoading">
          <div class="existing-data-head">
            <div>
              <strong>当前边坡已录入数据</strong>
              <span>{{ selectedPointType || '未选择监测类型' }}</span>
            </div>
            <div class="existing-data-actions">
              <el-button text type="primary" :icon="RefreshRight" @click="loadExistingSummary">刷新</el-button>
              <el-button text type="danger" :disabled="!selectedSlopeId" @click="clearSlopeData">清空该边坡数据</el-button>
            </div>
          </div>
          <div v-if="existingTypeSummary" class="existing-data-stats">
            <div><span>已录日期</span><strong>{{ existingTypeSummary.date_count }}</strong></div>
            <div><span>涉及测点</span><strong>{{ existingTypeSummary.point_count }}</strong></div>
            <div><span>数据条数</span><strong>{{ existingTypeSummary.data_count }}</strong></div>
            <div><span>日期范围</span><strong>{{ existingDateRange }}</strong></div>
            <div><span>最近上传</span><strong>{{ existingTypeSummary.latest_upload_time || '-' }}</strong></div>
          </div>
          <el-empty v-else-if="!existingSummaryLoading" description="当前边坡该类型暂无已录入数据" :image-size="56" />
          <div v-if="existingDateRows.length" class="existing-date-list">
            <div v-for="item in existingDateRows" :key="`${item.point_type}-${item.monitor_date}`" class="existing-date-item">
              <strong>{{ item.monitor_date }}</strong>
              <span>{{ item.point_count }} 个测点</span>
              <span>{{ item.data_count }} 条数据</span>
              <em>{{ item.latest_upload_time || '-' }}</em>
            </div>
          </div>
        </div>
      </section>

      <div v-if="selectedSlopeId && selectedPointType !== DEEP_POINT_TYPE" class="flow-indicator">
        <div class="flow-step active"><span>1</span><strong>录入数据</strong></div>
        <div class="flow-line"></div>
        <div class="flow-step" :class="{ active: previewResult }"><span>2</span><strong>校核问题</strong></div>
        <div class="flow-line"></div>
        <div class="flow-step" :class="{ active: commitResult }"><span>3</span><strong>保存批次</strong></div>
      </div>

      <el-empty
        v-if="!selectedSlopeId"
        :description="slopes.length ? '请先选择需要录入数据的边坡' : '当前暂无边坡，请先新建边坡'"
      >
        <el-button v-if="!slopes.length" type="primary" @click="openAddSlopeDialog">新建边坡</el-button>
      </el-empty>
      <el-empty
        v-else-if="!slopeContextLoading && allPointsOnSlopeCount === 0"
        description="当前边坡暂无监测点"
      >
        <el-button type="primary" @click="goPointManagement">去边坡与测点管理</el-button>
      </el-empty>
      <el-empty v-else-if="!selectedPointType" description="请选择监测类型" />

      <InclinometerDataImport
        v-else-if="selectedPointType === DEEP_POINT_TYPE"
        :points="pointsByType"
      />

      <template v-else>
        <section class="entry-mode-section">
          <el-tabs v-model="entryMode" class="entry-mode-tabs" :before-leave="beforeEntryModeLeave">
            <el-tab-pane label="Excel 批量导入" name="excel">
              <div class="excel-upload-shell">
              <div v-if="!importedFileName" class="excel-start" v-loading="uploadProcessing" :element-loading-text="uploadStatusText">
                <el-upload
                  drag
                  action=""
                  :auto-upload="false"
                  :on-change="handleExcelUpload"
                  :disabled="uploadProcessing"
                  :show-file-list="false"
                  accept=".xlsx,.xls"
                >
                  <el-icon class="upload-main-icon"><Upload /></el-icon>
                  <div class="upload-title">拖入监测数据 Excel，或点击选择文件</div>
                </el-upload>
                <div class="excel-tools">
                  <span>当前对象：{{ currentSlopeDetail?.slope_name || currentSlopeName }} · {{ selectedPointType }}</span>
                  <div class="excel-tool-actions">
                    <el-tag size="small" type="info">重复日期上传时确认</el-tag>
                    <el-button text type="primary" :icon="Download" @click="exportTemplate">下载标准模板</el-button>
                  </div>
                </div>
                <div class="import-rule-tip">发现数据库已有日期时，可选择覆盖已有数据，或跳过已有日期、只录入新数据。</div>
              </div>

              <div v-if="uploadProcessing" class="upload-progress">
                <el-progress :percentage="uploadProgress" :status="uploadProgress >= 100 ? 'success' : undefined" />
                <span>{{ uploadStatusText }}</span>
              </div>

              <div v-else-if="importedFileName" class="imported-file-panel" v-loading="uploadProcessing" :element-loading-text="uploadStatusText">
                <div class="file-summary-row">
                  <div class="file-identity">
                    <el-icon><Document /></el-icon>
                    <div>
                      <strong>{{ importedFileName }}</strong>
                      <span>{{ formatFileSize(importedFileSize) }} · {{ matrixRows.length }} 个观测日期</span>
                    </div>
                  </div>
                  <div class="file-actions">
                    <el-upload action="" :auto-upload="false" :on-change="handleExcelUpload" :show-file-list="false" accept=".xlsx,.xls">
                      <el-button>重新选择</el-button>
                    </el-upload>
                    <el-button :icon="RefreshRight" @click="resetMatrix">移除文件</el-button>
                  </div>
                </div>
                <div class="import-summary-strip">
                  <div><span>识别日期范围</span><strong>{{ importDateRange || '-' }}</strong></div>
                  <div><span>匹配测点</span><strong>{{ importedMatchedPointCount }}</strong></div>
                  <div><span>待校核日期</span><strong>{{ modifiedCount }}</strong></div>
                  <div v-if="importedSkippedDateCount"><span>已跳过日期</span><strong>{{ importedSkippedDateCount }}</strong></div>
                </div>

                <el-collapse v-model="importedDetailOpen" class="import-detail-collapse">
                  <el-collapse-item title="查看并修正导入数据" name="detail">
                    <div class="matrix-table-wrap">
                      <table class="matrix-table">
                        <thead>
                          <tr>
                            <th class="col-date">监测日期</th>
                            <th v-for="p in pointsByType" :key="p.id" class="col-point">
                              <div class="point-header">
                                <span class="point-name">{{ p.point_name }}</span>
                                <span class="point-location">{{ p.location || '-' }}</span>
                              </div>
                            </th>
                            <th class="col-remark">备注</th>
                            <th class="col-action">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(row, rowIndex) in matrixRows" :key="rowIndex" :class="{ 'row-modified': row._modified }">
                            <td class="col-date">
                              <el-date-picker v-model="row.monitor_date" type="date" size="small" value-format="YYYY-MM-DD" @change="markRowModified(rowIndex)" />
                            </td>
                            <td v-for="p in pointsByType" :key="p.id" class="col-value" :class="cellClass(row, rowIndex, p)">
                              <el-input-number v-model="row.values[p.id]" :precision="3" :controls="false" size="small" placeholder="数值" @change="markRowModified(rowIndex)" />
                              <el-select
                                v-if="isMissingCell(row, p) && !isNotStartedCell(row, p)"
                                v-model="row.missing_reasons[p.id]"
                                size="small"
                                placeholder="缺测原因"
                                class="missing-reason"
                                clearable
                              >
                                <el-option v-for="reason in MISSING_REASONS" :key="reason" :label="reason" :value="reason" />
                              </el-select>
                            </td>
                            <td class="col-remark"><el-input v-model="row.remark" size="small" placeholder="备注" @change="markRowModified(rowIndex)" /></td>
                            <td class="col-action"><el-button type="danger" text :icon="Delete" @click="removeRow(rowIndex)">删除</el-button></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="手工录入" name="manual">
              <div class="manual-toolbar">
                <div class="manual-primary-fields">
                  <label class="field-block compact-field">
                    <span>本次观测日期</span>
                    <el-date-picker v-model="observationDate" type="date" value-format="YYYY-MM-DD" @change="syncManualDate" />
                  </label>
                  <label class="field-block search-field">
                    <span>查找测点</span>
                    <el-input v-model="manualPointKeyword" :prefix-icon="Search" placeholder="输入测点名称或位置" clearable />
                  </label>
                </div>
                <el-checkbox v-model="showAllManualPoints">显示停测或尚未到期测点</el-checkbox>
              </div>

              <div v-for="(row, rowIndex) in matrixRows" :key="rowIndex" class="manual-observation">
                <div class="observation-heading">
                  <div>
                    <strong>观测日期 {{ row.monitor_date || observationDate }}</strong>
                    <span>{{ manualVisiblePoints.length }} 个测点</span>
                  </div>
                  <div class="observation-actions">
                    <el-input v-model="row.remark" placeholder="本期备注" clearable @change="markRowModified(rowIndex)" />
                    <el-button v-if="matrixRows.length > 1" type="danger" text :icon="Delete" @click="removeRow(rowIndex)">删除本期</el-button>
                  </div>
                </div>
                <div class="manual-point-table">
                  <div class="manual-table-head">
                    <span>测点</span><span>位置</span><span>监测值（mm）</span><span>数据状态</span>
                  </div>
                  <div v-for="point in manualVisiblePoints" :key="point.id" class="manual-point-row" :class="cellClass(row, rowIndex, point)">
                    <strong>{{ point.point_name }}</strong>
                    <span>{{ point.location || '-' }}</span>
                    <el-input-number
                      v-model="row.values[point.id]"
                      :precision="3"
                      :controls="false"
                      placeholder="请输入数值"
                      @change="markRowModified(rowIndex)"
                    />
                    <span v-if="isNotStartedCell(row, point)" class="status-text muted">未启测</span>
                    <el-select
                      v-else-if="isMissingCell(row, point)"
                      v-model="row.missing_reasons[point.id]"
                      placeholder="选择缺测原因"
                      clearable
                    >
                      <el-option v-for="reason in MISSING_REASONS" :key="reason" :label="reason" :value="reason" />
                    </el-select>
                    <span v-else class="status-text valid">已填写</span>
                  </div>
                </div>
              </div>
              <el-button class="add-period-button" :icon="Plus" @click="addRow">新增观测日期</el-button>
            </el-tab-pane>
          </el-tabs>
        </section>

        <section v-if="matrixRows.length" class="review-section">
          <div v-if="isFirstUploadForType" class="first-upload-options">
            <div>
              <strong>首次上传标记</strong>
              <span>选择开始前已经破坏的测点，校核时不计为缺测；保存后测点状态会标记为“已破坏”。</span>
            </div>
            <el-select
              v-model="damagedPointIds"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              placeholder="开始前已破坏测点"
              @change="invalidatePreview"
            >
              <el-option
                v-for="point in pointsByType"
                :key="point.id"
                :label="`${point.point_name}${point.location ? ` / ${point.location}` : ''}`"
                :value="Number(point.id)"
              />
            </el-select>
          </div>
          <div v-if="previewResult" class="point-review-panel">
            <div class="point-review-heading">
              <div>
                <h3>按测点校核</h3>
                <p>每个测点按自身启测日期和首次有效数据校核；展开后才加载该点的日期明细。</p>
              </div>
              <el-select v-model="pointReviewFilter" size="small" class="point-review-filter">
                <el-option label="全部测点" value="all" />
                <el-option label="仅看有问题" value="attention" />
                <el-option label="仅看错误" value="error" />
                <el-option label="仅看缺测" value="missing" />
                <el-option label="仅看未启测" value="not_started" />
              </el-select>
            </div>
            <el-table
              :data="filteredPointSummaries"
              border
              size="small"
              row-key="point_id"
              class="point-review-table"
              @expand-change="loadPointPreview"
            >
              <el-table-column type="expand" width="52">
                <template #default="{ row }">
                  <div class="point-detail-panel" v-loading="previewPointLoading[row.point_id]">
                    <div class="point-detail-head">
                      <strong>{{ row.point_name }} 校核明细</strong>
                      <span>仅显示本次导入涉及的日期</span>
                    </div>
                    <el-table v-if="previewPointDetails[row.point_id]" :data="previewPointDetails[row.point_id]" size="small" max-height="300">
                      <el-table-column prop="monitor_date" label="监测日期" width="150" />
                      <el-table-column label="本次值(mm)" width="150">
                        <template #default="{ row: detail }">{{ detail.value ?? '-' }}</template>
                      </el-table-column>
                      <el-table-column label="校核状态" width="120">
                        <template #default="{ row: detail }">
                          <el-tag :type="pointDetailTagType(detail.status)" size="small">{{ pointDetailStatusText(detail.status) }}</el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="说明" min-width="260">
                        <template #default="{ row: detail }">{{ detail.messages?.join('；') || '-' }}</template>
                      </el-table-column>
                    </el-table>
                    <el-empty v-else-if="!previewPointLoading[row.point_id]" description="暂无本次日期明细" :image-size="48" />
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="point_name" label="测点" min-width="130" />
              <el-table-column label="启测日期" width="160">
                <template #default="{ row }">{{ row.monitor_start_date || row.suggested_start_date || '待按首次有效数据设置' }}</template>
              </el-table-column>
              <el-table-column prop="data_dates" label="有效日期" width="95" />
              <el-table-column prop="data_rows" label="有效数据" width="95" />
              <el-table-column prop="missing_rows" label="缺测" width="75" />
              <el-table-column prop="not_started_rows" label="未启测" width="85" />
              <el-table-column prop="duplicate_rows" label="将覆盖" width="85" />
              <el-table-column prop="warning_rows" label="提示" width="75" />
              <el-table-column prop="error_rows" label="错误" width="75" />
              <el-table-column label="状态" width="95">
                <template #default="{ row }"><el-tag :type="pointSummaryTagType(row.status)" size="small">{{ pointSummaryStatusText(row.status) }}</el-tag></template>
              </el-table-column>
            </el-table>
          </div>
          <div class="section-title-row">
            <div>
              <h3>数据预览与校核</h3>
              <p>{{ previewResult ? '校核完成' : '尚未校核' }}</p>
            </div>
            <el-button type="primary" :loading="previewing" @click="previewMatrix">预览校核</el-button>
          </div>

          <div v-if="previewResult" class="review-summary">
            <button type="button" :class="{ active: issueFilter === 'all' }" @click="issueFilter = 'all'"><span>有效数据</span><strong>{{ previewResult.summary.data_rows }}</strong></button>
            <button type="button" :class="{ active: issueFilter === 'missing' }" @click="issueFilter = 'missing'"><span>缺测</span><strong>{{ previewResult.summary.missing_rows }}</strong></button>
            <button type="button" :class="{ active: issueFilter === 'not_started' }" @click="issueFilter = 'not_started'"><span>未启测</span><strong>{{ previewResult.summary.not_started_rows }}</strong></button>
            <button type="button" :class="{ active: issueFilter === 'duplicate' }" @click="issueFilter = 'duplicate'"><span>将覆盖</span><strong>{{ previewResult.summary.duplicate_rows }}</strong></button>
            <button type="button" :class="{ active: issueFilter === 'warning' }" @click="issueFilter = 'warning'"><span>异常提示</span><strong>{{ previewResult.summary.warning_rows }}</strong></button>
            <button type="button" :class="{ active: issueFilter === 'error' }" @click="issueFilter = 'error'"><span>错误</span><strong>{{ previewResult.summary.error_rows }}</strong></button>
          </div>

          <el-alert
            v-if="previewResult?.summary?.duplicate_rows"
            type="warning"
            :closable="false"
            show-icon
            :title="`保存时将自动覆盖 ${previewResult.summary.duplicate_rows} 条已有数据，请核对后提交。`"
          />
          <el-alert
            v-if="previewResult?.suggested_start_dates?.length"
            class="start-date-alert"
            type="info"
            :closable="false"
            show-icon
            :title="`检测到 ${previewResult.suggested_start_dates.length} 个测点可按首次有效数据设置启测日期，启测前空值不计为缺测。`"
          />

          <el-table v-if="false && previewResult && filteredPreviewIssues.length" :data="filteredPreviewIssues" border size="small" class="issue-table">
            <el-table-column prop="level" label="级别" width="90">
              <template #default="{ row }"><el-tag :type="row.level === 'error' ? 'danger' : 'warning'" size="small">{{ row.level === 'error' ? '错误' : '提示' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="point_name" label="测点" width="130" />
            <el-table-column prop="monitor_date" label="监测日期" width="150" />
            <el-table-column prop="message" label="问题说明" min-width="280" />
          </el-table>
          <el-empty v-else-if="previewResult" description="当前分类下没有问题" :image-size="64" />

          <div v-if="previewResult" class="batch-options">
            <el-checkbox v-model="autoSetStartDate">按首次有效数据自动设置启测日期</el-checkbox>
            <el-input v-model="batchRemark" placeholder="批次备注：异常、覆盖或缺测时填写" clearable />
            <el-input
              v-if="previewResult.summary.duplicate_rows > 0"
              v-model="overwriteReason"
              placeholder="覆盖历史数据时填写覆盖原因"
              clearable
            />
          </div>
        </section>

        <section v-if="commitResult" class="commit-result">
          <div>
            <div class="result-title"><el-icon><CircleCheck /></el-icon><strong>批次保存成功</strong><span>{{ commitResult.batch_no }}</span></div>
            <div class="result-counts">
              <span>新增 {{ commitResult.inserted }}</span><span>覆盖 {{ commitResult.overwritten }}</span><span>缺测 {{ commitResult.missing }}</span><span>跳过 {{ commitResult.skipped }}</span>
            </div>
          </div>
          <div class="result-actions">
            <el-button @click="startNextBatch">继续录入</el-button>
            <el-button type="primary" plain @click="goDataView">前往数据查看</el-button>
          </div>
        </section>

        <footer v-if="!commitResult" class="commit-bar">
          <div>
            <strong>{{ previewResult ? '校核已完成' : `当前有 ${matrixRows.length} 个观测日期待校核` }}</strong>
            <span v-if="previewResult">有效 {{ previewResult.summary.data_rows }}，将覆盖 {{ previewResult.summary.duplicate_rows }}，错误 {{ previewResult.summary.error_rows }}</span>
            <span v-else>校核通过后才能正式保存</span>
          </div>
          <div class="commit-actions">
            <el-button @click="resetMatrix">重置</el-button>
            <el-button type="success" :loading="saving" :disabled="!previewResult || previewResult.summary?.error_rows > 0" @click="commitMatrix">确认保存批次</el-button>
          </div>
        </footer>
      </template>
    </div>

    <el-row v-if="false" :gutter="16">
      <!-- 左侧：空间定位 + 类型定位 -->
      <el-col :xs="24" :md="8" :lg="7">
        <el-card class="side-card" shadow="never">
          <template #header>
            <span class="side-card-title">定位与类型选择</span>
          </template>

          <div class="side-section">
            <div class="side-label">选择边坡</div>
            <el-select
              v-model="selectedSlopeId"
              placeholder="请选择边坡"
              style="width: 100%"
              filterable
              clearable
              @change="onSlopeChange"
            >
              <el-option
                v-for="s in slopes"
                :key="s.id"
                :label="`${s.slope_name}（测点 ${s.point_count ?? 0}）`"
                :value="String(s.id)"
              />
            </el-select>
          </div>

          <template v-if="selectedSlopeId">
            <el-divider content-position="left">当前边坡概况</el-divider>
            <el-descriptions v-if="currentSlopeDetail" :column="1" size="small" border class="slope-desc">
              <el-descriptions-item label="类型">{{ currentSlopeDetail.slope_type || '-' }}</el-descriptions-item>
            <el-descriptions-item label="所在标段范围">{{ currentSlopeDetail.location || '-' }}</el-descriptions-item>
              <el-descriptions-item label="测点总数">{{ allPointsOnSlopeCount }}</el-descriptions-item>
            </el-descriptions>
            <el-skeleton v-else :rows="3" animated />

            <div class="side-label" style="margin-top: 12px">监测类型</div>

            <div v-if="!slopeContextLoading && (allPointsOnSlopeCount ?? 0) === 0" class="warn-text">
              该边坡暂无任何监测点，无法继续录入数据。
              <div style="margin-top: 8px">
                <el-link type="primary" @click="goPointManagement">去边坡与测点管理创建监测点</el-link>
              </div>
            </div>

            <div class="type-buttons">
              <el-button
                v-for="t in POINT_TYPES"
                :key="t"
                :type="selectedPointType === t ? 'primary' : 'default'"
                plain
                class="type-btn"
                @click="selectPointType(t)"
                :disabled="(typeCounts[t] ?? 0) === 0"
              >
                <span>{{ t }}</span>
                <el-tag size="small" effect="plain" class="type-count-tag">{{ typeCounts[t] ?? 0 }}</el-tag>
              </el-button>
            </div>

            <div v-if="selectedPointType && (typeCounts[selectedPointType] ?? 0) === 0" class="warn-text">
              该类型下暂无监测点。请前往「边坡与测点管理」维护后再录入数据。
              <div style="margin-top: 8px">
                <el-link type="primary" @click="goPointManagement">去边坡与测点管理</el-link>
              </div>
            </div>
          </template>

          <el-empty
            v-else
            :description="slopes.length === 0 ? '当前暂无边坡，请先新建边坡后再录入数据' : '请先选择边坡'"
            :image-size="72"
          >
            <el-button
              v-if="slopes.length === 0"
              type="primary"
              @click="openAddSlopeDialog"
            >
              新建边坡
            </el-button>
          </el-empty>
        </el-card>
      </el-col>

      <!-- 右侧：可编辑录入矩阵 -->
      <el-col :xs="24" :md="16" :lg="17">
        <el-card class="main-entry-card">
          <template #header>
            <div class="card-header">
              <el-icon><Edit /></el-icon>
              <span>边坡监测数据录入（矩阵式）</span>
            </div>
          </template>

          <!-- 空状态 -->
          <el-empty v-if="!selectedSlopeId" description="请先在左侧选择边坡" />
          <el-empty
            v-else-if="!slopeContextLoading && (allPointsOnSlopeCount ?? 0) === 0"
            description="当前边坡暂无测点，请先到边坡与测点管理创建监测点后再录入。"
          >
            <el-button type="primary" @click="goPointManagement">去边坡与测点管理</el-button>
          </el-empty>
          <el-empty v-else-if="!selectedPointType" description="请在左侧选择监测类型" />
          <el-empty
            v-else-if="pointsByType.length === 0"
            description="该类型下暂无监测点，请先到边坡与测点管理创建监测点后再录入。"
          >
            <el-button type="primary" @click="goPointManagement">去边坡与测点管理</el-button>
          </el-empty>

          <InclinometerDataImport
            v-else-if="selectedPointType === DEEP_POINT_TYPE"
            :points="pointsByType"
          />

          <!-- 矩阵录入区 -->
          <div v-else class="matrix-container">
            <div class="batch-bar">
              <el-form :inline="true" label-width="96px" class="batch-form">
                <el-form-item label="本次观测日期">
                  <el-date-picker
                    v-model="observationDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="选择日期"
                    style="width: 160px"
                    @change="syncManualDate"
                  />
                </el-form-item>
                <el-form-item label="批次备注">
                  <el-input v-model="batchRemark" placeholder="异常、覆盖、缺测时建议填写" style="width: 300px" clearable />
                </el-form-item>
                <el-form-item v-if="duplicateAction === 'overwrite'" label="覆盖原因">
                  <el-input v-model="overwriteReason" placeholder="覆盖历史数据时必填" style="width: 260px" clearable />
                </el-form-item>
                <el-form-item label="启测日期">
                  <el-checkbox v-model="autoSetStartDate">按首次有效数据自动设置</el-checkbox>
                </el-form-item>
              </el-form>
            </div>
            <div class="matrix-toolbar">
              <div class="toolbar-left">
                <el-button type="primary" @click="previewMatrix" :loading="previewing">
                  预览校核
                </el-button>
                <el-button type="success" @click="commitMatrix" :loading="saving" :disabled="!previewResult || previewResult.summary?.error_rows > 0">
                  确认保存批次
                </el-button>
                <el-button @click="resetMatrix">重置</el-button>
                <el-button v-if="isDemoMode" @click="fillDemo">填充示例数据</el-button>
              </div>
              <div class="toolbar-right">
                <el-upload
                  class="upload-excel"
                  action=""
                  :auto-upload="false"
                  :on-change="handleExcelUpload"
                  :show-file-list="false"
                  accept=".xlsx,.xls"
                >
                  <el-button type="success">
                    <el-icon><Upload /></el-icon>
                    导入Excel
                  </el-button>
                </el-upload>
                <el-button @click="exportTemplate">
                  <el-icon><Download /></el-icon>
                  下载模板
                </el-button>
              </div>
            </div>

            <el-alert
              v-if="importedFileName"
              :title="`已导入文件：${importedFileName}。请先预览校核，确认后再正式保存。`"
              type="success"
              :closable="false"
              show-icon
            />

            <!-- 可编辑表格 -->
            <div class="matrix-table-wrap">
              <table class="matrix-table">
                <thead>
                  <tr>
                    <th v-if="isImportedMultiDate" class="col-date">监测日期</th>
                    <th v-for="p in pointsByType" :key="p.id" class="col-point">
                      <div class="point-header">
                        <span class="point-name">{{ p.point_name }}</span>
                        <span class="point-location">{{ p.location || '-' }}</span>
                      </div>
                    </th>
                    <th class="col-remark">备注</th>
                    <th class="col-action">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in matrixRows" :key="rowIndex" :class="{ 'row-modified': row._modified }">
                    <td v-if="isImportedMultiDate" class="col-date">
                      <el-date-picker
                        v-model="row.monitor_date"
                        type="date"
                        placeholder="选择日期"
                        size="small"
                        style="width: 130px"
                        value-format="YYYY-MM-DD"
                        @change="markRowModified(rowIndex)"
                      />
                    </td>
                    <td
                      v-for="p in pointsByType"
                      :key="p.id"
                      class="col-value"
                      :class="cellClass(row, rowIndex, p)"
                    >
                      <el-input-number
                        v-model="row.values[p.id]"
                        :precision="3"
                        :controls="false"
                        size="small"
                        style="width: 100%"
                        placeholder="请输入数值"
                        @change="markRowModified(rowIndex)"
                      />
                      <el-select
                        v-if="isMissingCell(row, p) && !isNotStartedCell(row, p)"
                        v-model="row.missing_reasons[p.id]"
                        size="small"
                        placeholder="缺测原因"
                        class="missing-reason"
                        clearable
                      >
                        <el-option v-for="reason in MISSING_REASONS" :key="reason" :label="reason" :value="reason" />
                      </el-select>
                    </td>
                    <td class="col-remark">
                      <el-input
                        v-model="row.remark"
                        size="small"
                        placeholder="备注"
                        @change="markRowModified(rowIndex)"
                      />
                    </td>
                    <td class="col-action">
                      <el-button type="danger" size="small" @click="removeRow(rowIndex)">
                        删除
                      </el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 添加行按钮 -->
            <div class="add-row-area">
              <el-button type="primary" plain @click="addRow">
                <el-icon><Plus /></el-icon>
                添加一行
              </el-button>
            </div>

            <!-- 数据预览 -->
            <div v-if="matrixRows.length > 0" class="preview-section">
              <el-divider>数据预览与校核</el-divider>
              <el-alert
                v-if="!previewResult"
                :title="`当前已录入 ${matrixRows.length} 行观测数据，${modifiedCount} 行待校核`"
                type="info"
                :closable="false"
              />
              <div v-else class="preview-grid">
                <el-statistic title="有效数据" :value="previewResult.summary.data_rows" />
                <el-statistic title="缺测" :value="previewResult.summary.missing_rows" />
                <el-statistic title="未启测" :value="previewResult.summary.not_started_rows" />
                <el-statistic title="重复" :value="previewResult.summary.duplicate_rows" />
                <el-statistic title="异常/提示" :value="previewResult.summary.warning_rows" />
                <el-statistic title="错误" :value="previewResult.summary.error_rows" />
              </div>
              <el-alert
                v-if="previewResult?.suggested_start_dates?.length"
                class="start-date-alert"
                type="info"
                :closable="false"
                show-icon
                :title="`检测到 ${previewResult.suggested_start_dates.length} 个测点可按首次有效数据设置启测日期。未启测阶段空值不计为缺测。`"
              />
              <div v-if="previewResult?.summary?.duplicate_rows" class="duplicate-actions">
                <span>重复数据处理：</span>
                <el-radio-group v-model="duplicateAction">
                  <el-radio-button label="skip">跳过已有数据</el-radio-button>
                  <el-radio-button label="overwrite">覆盖已有数据</el-radio-button>
                </el-radio-group>
              </div>
              <el-table v-if="previewIssues.length" :data="previewIssues" border size="small" class="issue-table">
                <el-table-column prop="level" label="级别" width="90">
                  <template #default="{ row }">
                    <el-tag :type="row.level === 'error' ? 'danger' : 'warning'" size="small">
                      {{ row.level === 'error' ? '错误' : '提示' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="point_name" label="测点" width="120" />
                <el-table-column prop="monitor_date" label="日期" width="170" />
                <el-table-column prop="message" label="问题说明" min-width="260" show-overflow-tooltip />
              </el-table>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新建边坡弹窗 -->
    <el-dialog v-model="addSlopeDialogVisible" title="新建边坡" width="480px">
      <el-form :model="addSlopeForm" label-width="100px">
        <el-form-item label="边坡名称" required>
          <el-input v-model="addSlopeForm.slope_name" placeholder="请输入边坡名称" />
        </el-form-item>
        <el-form-item label="边坡类型">
          <el-select v-model="addSlopeForm.slope_type" placeholder="选择边坡类型" style="width: 100%">
            <el-option label="滑坡" value="滑坡" />
            <el-option label="崩塌" value="崩塌" />
            <el-option label="泥石流" value="泥石流" />
            <el-option label="深挖路堑" value="深挖路堑" />
            <el-option label="高填方" value="高填方" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="addSlopeForm.location" placeholder="请输入位置" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="addSlopeForm.description" type="textarea" :rows="2" placeholder="请输入描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addSlopeDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitAddSlope">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Delete, Document, Download, Edit, Plus, RefreshRight, Search, Upload } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import * as XLSX from 'xlsx'
import { API_DATA } from '../config/api'
import InclinometerDataImport from '../components/InclinometerDataImport.vue'

const router = useRouter()

/** 与基础数据模块（监测点管理）口径一致 */
const DEEP_POINT_TYPE = '深部位移测斜孔'
const POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔', '裂缝观测点', '锚索应力监测点']

const VALUE_RANGE_BY_TYPE = {
  '地表位移监测点': [-10000000, 10000000],
  '沉降监测点': [-10000000, 10000000],
  '深部位移测斜孔': [-10000000, 10000000],
}
const MISSING_REASONS = ['未施工到位', '点位损坏', '现场遮挡', '天气影响', '仪器故障', '人员未到场', '其他']

const selectedSlopeId = ref('')
const selectedPointType = ref('')
const selectedSection = ref('')
const slopes = ref([])

const currentSlopeDetail = ref(null)
const typeCounts = reactive({ 
  '地表位移监测点': 0, 
  '沉降监测点': 0, 
  '深部位移测斜孔': 0 
})
const allPointsOnSlopeCount = ref(0)

const pointsByType = ref([])

const me = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
})
const isAdmin = computed(() => me.value?.role === 'admin')

function getAuthToken() {
  return localStorage.getItem('token') || ''
}

function requireAuthOrRedirect() {
  const token = getAuthToken()
  if (!token) {
    ElMessage.error('请先登录后再提交录入数据')
    router.push('/login')
    return null
  }
  return token
}

function normalizeMonitorDate(input) {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') {
    const parsed = XLSX.SSF.parse_date_code(input)
    if (!parsed) return null
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  if (typeof input === 'string') {
    const s = input.trim()
    if (!s) return null
    // 尝试解析 yyyy-MM-dd 或 yyyy/MM/dd
    const d = new Date(s.replace(/\//g, '-'))
    if (isNaN(d.getTime())) return null
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null
    const yyyy = input.getFullYear()
    const mm = String(input.getMonth() + 1).padStart(2, '0')
    const dd = String(input.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

function pointNumberToken(name) {
  const match = String(name || '').trim().match(/(\d+)\D*$/)
  return match ? String(Number(match[1])) : ''
}

function findPointByImportedName(importedName) {
  const raw = String(importedName || '').trim()
  if (!raw) return null
  const exact = pointsByType.value.find((point) => String(point.point_name || '').trim() === raw)
  if (exact) return exact
  const importedNo = pointNumberToken(raw)
  if (!importedNo) return null
  return pointsByType.value.find((point) => pointNumberToken(point.point_name) === importedNo) || null
}

function parseNumberCell(value) {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(num) ? num : null
}

const slopeContextLoading = ref(false)

// 矩阵数据
const matrixRows = ref([])
const saving = ref(false)
const previewing = ref(false)
const observationDate = ref(new Date().toISOString().slice(0, 10))
const batchRemark = ref('')
const overwriteReason = ref('')
const duplicateAction = ref('skip')
const damagedPointIds = ref([])
const previewResult = ref(null)
const importedFileName = ref('')
const importedFileSize = ref(0)
const importedSkippedDateCount = ref(0)
const uploadProcessing = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const existingSummaryLoading = ref(false)
const existingSummary = ref({ by_type: [], by_date: [] })
const autoSetStartDate = ref(true)
const isDemoMode = import.meta.env.DEV
const entryMode = ref('excel')
const manualPointKeyword = ref('')
const showAllManualPoints = ref(false)
const importedDetailOpen = ref([])
const issueFilter = ref('all')
const pointReviewFilter = ref('all')
const previewPointDetails = ref({})
const previewPointLoading = ref({})
const commitResult = ref(null)
const lastSelectedSlopeId = ref('')
const lastSelectedSection = ref('')

const modifiedCount = computed(() => matrixRows.value.filter(r => r._modified).length)
const isImportedMultiDate = computed(() => matrixRows.value.some((row) => row._source === 'excel'))
const previewIssues = computed(() => previewResult.value?.issues || [])
const currentSlopeName = computed(() => slopes.value.find((item) => String(item.id) === String(selectedSlopeId.value))?.slope_name || '-')
const sectionOptions = computed(() => [...new Set(slopes.value.map((item) => item.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const filteredSlopes = computed(() => {
  if (!selectedSection.value) return []
  return slopes.value.filter((item) => item.section === selectedSection.value)
})
const activePointCount = computed(() => pointsByType.value.filter((point) => isPointAvailable(point, observationDate.value)).length)
const existingTypeSummary = computed(() => (
  existingSummary.value.by_type?.find((item) => item.point_type === selectedPointType.value) || null
))
const existingDateRows = computed(() => (
  existingSummary.value.by_date?.filter((item) => item.point_type === selectedPointType.value).slice(0, 12) || []
))
const existingDateRange = computed(() => {
  const item = existingTypeSummary.value
  if (!item?.first_date && !item?.latest_date) return '-'
  if (item.first_date === item.latest_date) return item.first_date || item.latest_date || '-'
  return `${item.first_date || '-'} 至 ${item.latest_date || '-'}`
})
const isFirstUploadForType = computed(() => {
  const summary = existingTypeSummary.value
  return selectedSlopeId.value && selectedPointType.value !== DEEP_POINT_TYPE && (!summary || Number(summary.data_count || 0) === 0)
})
const manualVisiblePoints = computed(() => {
  const keyword = manualPointKeyword.value.trim().toLowerCase()
  return pointsByType.value.filter((point) => {
    if (!showAllManualPoints.value && !isPointAvailable(point, observationDate.value)) return false
    if (!keyword) return true
    return `${point.point_name || ''} ${point.location || ''}`.toLowerCase().includes(keyword)
  })
})
const importDateRange = computed(() => {
  const dates = matrixRows.value.map((row) => String(row.monitor_date || '').slice(0, 10)).filter(Boolean).sort()
  if (!dates.length) return ''
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} 至 ${dates[dates.length - 1]}`
})
const importedMatchedPointCount = computed(() => pointsByType.value.filter((point) => (
  matrixRows.value.some((row) => !isEmptyValue(row.values?.[point.id]))
)).length)
const filteredPreviewIssues = computed(() => {
  if (issueFilter.value === 'all') return previewIssues.value
  if (issueFilter.value === 'error') return previewIssues.value.filter((item) => item.level === 'error')
  if (issueFilter.value === 'warning') return previewIssues.value.filter((item) => item.level !== 'error' && item.type !== 'duplicate_existing')
  if (issueFilter.value === 'duplicate') return previewIssues.value.filter((item) => item.type === 'duplicate_existing')
  if (issueFilter.value === 'not_started') return previewIssues.value.filter((item) => item.type === 'not_started')
  if (issueFilter.value === 'missing') return previewIssues.value.filter((item) => item.type === 'missing' || item.type === 'missing_reason')
  return previewIssues.value
})
const filteredPointSummaries = computed(() => {
  const summaries = previewResult.value?.point_summaries || []
  if (pointReviewFilter.value === 'attention') {
    return summaries.filter((item) => item.error_rows || item.warning_rows || item.missing_rows)
  }
  if (pointReviewFilter.value === 'error') return summaries.filter((item) => item.error_rows > 0)
  if (pointReviewFilter.value === 'missing') return summaries.filter((item) => item.missing_rows > 0)
  if (pointReviewFilter.value === 'not_started') return summaries.filter((item) => item.not_started_rows > 0)
  return summaries
})
const issueKeySet = computed(() => {
  const map = new Map()
  previewIssues.value.forEach((item) => {
    if (!item.point_id || !item.monitor_date) return
    map.set(`${item.point_id}|${String(item.monitor_date).slice(0, 10)}`, item)
  })
  return map
})
const notStartedKeySet = computed(() => {
  const set = new Set()
  ;(previewResult.value?.not_started || []).forEach((item) => {
    set.add(`${item.point_id}|${String(item.monitor_date || '').slice(0, 10)}`)
  })
  return set
})

function isEmptyValue(value) {
  return value === null || value === undefined || value === ''
}

function isPointAvailable(point, dateText) {
  const date = String(dateText || '').slice(0, 10)
  const start = String(point.monitor_start_date || '').slice(0, 10)
  const stop = String(point.monitor_stop_date || '').slice(0, 10)
  if (date && start && date < start) return false
  if (date && stop && date > stop) return false
  return !['停测', '已破坏'].includes(point.monitor_status)
}

function invalidatePreview() {
  previewResult.value = null
  previewPointDetails.value = {}
  previewPointLoading.value = {}
}

function formatFileSize(size) {
  const bytes = Number(size) || 0
  if (!bytes) return '文件大小未知'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function hasPendingInput() {
  if (commitResult.value) return false
  if (importedFileName.value) return true
  if (damagedPointIds.value.length) return true
  return matrixRows.value.some((row) => {
    if (row.remark?.trim()) return true
    return Object.values(row.values || {}).some((value) => !isEmptyValue(value))
      || Object.values(row.missing_reasons || {}).some(Boolean)
  })
}

function confirmDiscardPending() {
  if (!hasPendingInput()) return Promise.resolve()
  return ElMessageBox.confirm('当前批次尚未保存，切换后已录入内容将被清空。', '放弃本次录入？', {
    confirmButtonText: '放弃并切换',
    cancelButtonText: '继续编辑',
    type: 'warning',
  })
}

async function beforeEntryModeLeave(activeName, oldActiveName) {
  if (activeName === oldActiveName || !hasPendingInput()) return true
  try {
    await confirmDiscardPending()
    initMatrixRows()
    return true
  } catch {
    return false
  }
}

// 加载边坡列表
async function loadSlopes() {
  const token = getAuthToken()
  try {
    const res = await fetch(`${API_DATA}/api/slopes`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (!res.ok) {
      if (res.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error('网络请求失败')
    }
    
    const data = await res.json()
    if (data.success) {
      slopes.value = data.data || []
    } else {
      ElMessage.error(data.message || '加载边坡列表失败')
    }
  } catch (e) {
    ElMessage.error('加载边坡列表失败')
  }
}

// 加载边坡详情和测点统计
async function loadSlopeContext(slopeId) {
  const token = getAuthToken()
  if (!token) return

  slopeContextLoading.value = true
  try {
    // 加载边坡详情
    const detailRes = await fetch(`${API_DATA}/api/slopes/${slopeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (!detailRes.ok) {
      if (detailRes.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error('网络请求失败')
    }
    
    const detailData = await detailRes.json()
    if (detailData.success) {
      currentSlopeDetail.value = detailData.data
    }

    // 加载该边坡下所有测点（用于统计）
    const pointsRes = await fetch(`${API_DATA}/api/points?slope_id=${slopeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (!pointsRes.ok) {
      if (pointsRes.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error('网络请求失败')
    }
    
    const pointsData = await pointsRes.json()
    const allPoints = pointsData.success ? (pointsData.data || []) : []

    // 根据测点名称去重统计（同一测点可能有多个时间段的记录）
    const uniquePointNames = new Set(allPoints.map(p => p.point_name))
    allPointsOnSlopeCount.value = uniquePointNames.size

    // 按类型统计（根据名称去重）
    for (const t of POINT_TYPES) typeCounts[t] = 0
    const typePointNames = {}
    for (const p of allPoints) {
      const t = p.point_type
      if (POINT_TYPES.includes(t)) {
        if (!typePointNames[t]) typePointNames[t] = new Set()
        typePointNames[t].add(p.point_name)
      }
    }
    for (const t of POINT_TYPES) {
      typeCounts[t] = typePointNames[t] ? typePointNames[t].size : 0
    }
  } catch (e) {
    ElMessage.error('加载边坡信息失败')
  } finally {
    slopeContextLoading.value = false
  }
}

// 加载指定类型的测点列表
async function loadPointsByType(slopeId, pointType) {
  const token = getAuthToken()
  if (!token) return

  try {
    const res = await fetch(
      `${API_DATA}/api/points?slope_id=${slopeId}&point_type=${encodeURIComponent(pointType)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    
    if (!res.ok) {
      if (res.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error('网络请求失败')
    }
    
    const data = await res.json()
    if (data.success) {
      // 对测点列表进行排序，按照监测点名称中的数字部分排序
      pointsByType.value = (data.data || []).sort((a, b) => {
        const getPointNumber = (pointName) => {
          const match = pointName.match(/(\d+)$/)
          return match ? parseInt(match[1], 10) : 0
        }
        const numA = getPointNumber(a.point_name)
        const numB = getPointNumber(b.point_name)
        return numA - numB
      })
    } else {
      pointsByType.value = []
    }
  } catch (e) {
    pointsByType.value = []
  }
}

// 选择边坡
async function loadExistingSummary() {
  const token = getAuthToken()
  if (!token || !selectedSlopeId.value || !selectedPointType.value || selectedPointType.value === DEEP_POINT_TYPE) {
    existingSummary.value = { by_type: [], by_date: [] }
    return
  }

  existingSummaryLoading.value = true
  try {
    const params = new URLSearchParams({
      slope_id: selectedSlopeId.value,
      point_type: selectedPointType.value,
    })
    const res = await fetch(`${API_DATA}/api/monitoring-data/matrix/slope-summary?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.message || '加载已录入概况失败')
    existingSummary.value = data.data || { by_type: [], by_date: [] }
  } catch (e) {
    existingSummary.value = { by_type: [], by_date: [] }
    ElMessage.warning(e.message || '加载已录入概况失败')
  } finally {
    existingSummaryLoading.value = false
  }
}

async function onSlopeChange(val) {
  const previousSlopeId = lastSelectedSlopeId.value
  if (previousSlopeId && String(previousSlopeId) !== String(val || '') && hasPendingInput()) {
    try {
      await confirmDiscardPending()
    } catch {
      selectedSlopeId.value = previousSlopeId
      return
    }
  }
  lastSelectedSlopeId.value = String(val || '')
  selectedPointType.value = ''
  matrixRows.value = []
  damagedPointIds.value = []
  pointsByType.value = []
  existingSummary.value = { by_type: [], by_date: [] }
  if (!val) {
    currentSlopeDetail.value = null
    allPointsOnSlopeCount.value = 0
    for (const t of POINT_TYPES) typeCounts[t] = 0
    return
  }
  await loadSlopeContext(val)
  // 默认选中第一个有测点的类型
  const firstWithPoints = POINT_TYPES.find(t => (typeCounts[t] || 0) > 0)
  if (firstWithPoints) {
    selectedPointType.value = firstWithPoints
    await loadPointsByType(val, firstWithPoints)
    if (firstWithPoints !== DEEP_POINT_TYPE) initMatrixRows()
    // The batch is already committed at this point. A summary refresh failure
    // must never be presented to the user as a failed data save.
    try {
      await loadExistingSummary()
    } catch (summaryError) {
      console.warn('批次已保存，但已录入概况刷新失败:', summaryError)
      ElMessage.warning('数据已保存，已录入概况暂未刷新，可点击刷新按钮重试')
    }
  }
}

async function onSectionChange(val) {
  const nextSection = String(val || '')
  const previousSection = lastSelectedSection.value
  if (previousSection && previousSection !== nextSection && hasPendingInput()) {
    try {
      await confirmDiscardPending()
    } catch {
      selectedSection.value = previousSection
      return
    }
  }

  selectedSection.value = nextSection
  lastSelectedSection.value = nextSection
  selectedSlopeId.value = ''
  lastSelectedSlopeId.value = ''
  selectedPointType.value = ''
  currentSlopeDetail.value = null
  allPointsOnSlopeCount.value = 0
  matrixRows.value = []
  damagedPointIds.value = []
  pointsByType.value = []
  existingSummary.value = { by_type: [], by_date: [] }
  previewResult.value = null
  commitResult.value = null
  for (const t of POINT_TYPES) typeCounts[t] = 0
}

// 选择类型
async function selectPointType(t) {
  if (selectedPointType.value && selectedPointType.value !== t && hasPendingInput()) {
    try {
      await confirmDiscardPending()
    } catch {
      return
    }
  }
  selectedPointType.value = t
  matrixRows.value = []
  damagedPointIds.value = []
  if (selectedSlopeId.value && t) {
    await loadPointsByType(selectedSlopeId.value, t)
    if (t !== DEEP_POINT_TYPE) initMatrixRows()
    await loadExistingSummary()
  }
}

// 初始化矩阵行
function initMatrixRows() {
  matrixRows.value = []
  previewResult.value = null
  commitResult.value = null
  issueFilter.value = 'all'
  importedFileName.value = ''
  importedFileSize.value = 0
  importedSkippedDateCount.value = 0
  damagedPointIds.value = []
  if (pointsByType.value.length === 0) return
  // 默认添加一行
  addRow()
}

// 添加行
function addRow() {
  const row = {
    monitor_date: observationDate.value || new Date().toISOString().slice(0, 10),
    values: {},
    missing_reasons: {},
    remark: '',
    _modified: true
  }
  for (const p of pointsByType.value) {
    row.values[p.id] = null
  }
  matrixRows.value.push(row)
  previewResult.value = null
  commitResult.value = null
}

// 删除行
function removeRow(index) {
  matrixRows.value.splice(index, 1)
  previewResult.value = null
  commitResult.value = null
}

// 标记行已修改
function markRowModified(index) {
  if (matrixRows.value[index]) {
    matrixRows.value[index]._modified = true
    previewResult.value = null
    commitResult.value = null
  }
}

function syncManualDate() {
  matrixRows.value.forEach((row) => {
    if (row._source !== 'excel') {
      row.monitor_date = observationDate.value
      row._modified = true
    }
  })
  previewResult.value = null
  commitResult.value = null
}

function isMissingCell(row, point) {
  const value = row.values?.[point.id]
  return value === null || value === undefined || value === ''
}

function isNotStartedCell(row, point) {
  return notStartedKeySet.value.has(`${point.id}|${String(row.monitor_date || '').slice(0, 10)}`)
}

function cellClass(row, rowIndex, point) {
  const classes = []
  if (isMissingCell(row, point)) classes.push(isNotStartedCell(row, point) ? 'cell-not-started' : 'cell-missing')
  const issue = issueKeySet.value.get(`${point.id}|${String(row.monitor_date || '').slice(0, 10)}`)
  if (issue?.level === 'error') classes.push('cell-error')
  else if (issue) classes.push('cell-warning')
  return classes
}

// 重置矩阵
function resetMatrix() {
  ElMessageBox.confirm('确定要重置所有数据吗？未保存的数据将丢失。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    initMatrixRows()
    ElMessage.success('已重置')
  }).catch(() => {})
}

// 填充示例数据
function fillDemo() {
  if (pointsByType.value.length === 0) {
    ElMessage.warning('当前没有可用的监测点')
    return
  }
  const today = new Date().toISOString().slice(0, 10)
  const demoRows = []
  for (let i = 0; i < 3; i++) {
    const row = {
      monitor_date: today,
      values: {},
      missing_reasons: {},
      remark: `示例数据 ${i + 1}`,
      _modified: true
    }
    for (const p of pointsByType.value) {
      // 根据类型生成合理范围的示例值
      const range = VALUE_RANGE_BY_TYPE[selectedPointType.value] || [-100, 100]
      const min = range[0]
      const max = range[1]
      row.values[p.id] = parseFloat((Math.random() * (max - min) + min).toFixed(3))
    }
    demoRows.push(row)
  }
  matrixRows.value = demoRows
  ElMessage.success('已填充示例数据')
}

function buildSubmitRows() {
  return matrixRows.value.map((row) => ({
    monitor_date: row.monitor_date,
    values: row.values,
    missing_reasons: row.missing_reasons || {},
    remark: row.remark || ''
  }))
}

async function previewMatrix() {
  const token = requireAuthOrRedirect()
  if (!token) return

  if (matrixRows.value.length === 0) {
    ElMessage.warning('没有数据需要校核')
    return
  }

  if (!observationDate.value && !isImportedMultiDate.value) {
    ElMessage.error('请先选择本次观测日期')
    return
  }

  previewing.value = true
  try {
    const res = await fetch(`${API_DATA}/api/monitoring-data/matrix/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        slope_id: selectedSlopeId.value,
        point_type: selectedPointType.value,
        rows: buildSubmitRows(),
        damaged_point_ids: damagedPointIds.value,
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error(data.message || '网络请求失败')
    }

    if (data.success) {
      previewResult.value = data.data
      previewPointDetails.value = {}
      previewPointLoading.value = {}
      pointReviewFilter.value = data.data.summary.error_rows > 0 ? 'error' : 'all'
      issueFilter.value = data.data.summary.error_rows > 0 ? 'error' : 'all'
      if (data.data.summary.error_rows > 0) ElMessage.warning('预览完成，存在错误，请修正后再保存')
      else ElMessage.success('预览校核完成，可以确认保存批次')
    } else {
      ElMessage.error(data.message || '预览失败')
    }
  } catch (e) {
    ElMessage.error(e.message || '预览失败，请检查网络连接')
  } finally {
    previewing.value = false
  }
}

function pointSummaryTagType(status) {
  return ({ passed: 'success', warning: 'warning', error: 'danger', not_started: 'info' })[status] || 'info'
}

function pointSummaryStatusText(status) {
  return ({ passed: '通过', warning: '待关注', error: '错误', not_started: '未启测' })[status] || '待校核'
}

function pointDetailTagType(status) {
  return ({ valid: 'success', warning: 'warning', error: 'danger', missing: 'warning', not_started: 'info', stopped: 'info', damaged: 'danger' })[status] || 'info'
}

function pointDetailStatusText(status) {
  return ({ valid: '有效', warning: '提示', error: '错误', missing: '缺测', not_started: '未启测', stopped: '停测后', damaged: '已破坏' })[status] || '待校核'
}

async function loadPointPreview(row, expanded) {
  if (!expanded || !row?.point_id || previewPointDetails.value[row.point_id] || previewPointLoading.value[row.point_id]) return
  const token = requireAuthOrRedirect()
  if (!token) return

  previewPointLoading.value = { ...previewPointLoading.value, [row.point_id]: true }
  try {
    const res = await fetch(`${API_DATA}/api/monitoring-data/matrix/preview-point`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        slope_id: selectedSlopeId.value,
        point_type: selectedPointType.value,
        point_id: row.point_id,
        rows: buildSubmitRows(),
        damaged_point_ids: damagedPointIds.value,
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.message || '测点校核明细加载失败')
    previewPointDetails.value = { ...previewPointDetails.value, [row.point_id]: data.data?.point_detail || [] }
  } catch (error) {
    ElMessage.error(error.message || '测点校核明细加载失败')
  } finally {
    previewPointLoading.value = { ...previewPointLoading.value, [row.point_id]: false }
  }
}

async function commitMatrix() {
  const token = requireAuthOrRedirect()
  if (!token) return
  if (!previewResult.value) {
    ElMessage.warning('请先进行预览校核')
    return
  }
  if (previewResult.value.summary.error_rows > 0) {
    ElMessage.error('存在错误数据，请修正后重新预览')
    return
  }
  if ((previewResult.value.summary.warning_rows > 0 || previewResult.value.summary.missing_rows > 0) && !batchRemark.value.trim()) {
    ElMessage.warning('存在异常、重复或缺测，请填写批次备注')
    return
  }

  saving.value = true
  try {
    const res = await fetch(`${API_DATA}/api/monitoring-data/matrix/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        slope_id: selectedSlopeId.value,
        point_type: selectedPointType.value,
        rows: buildSubmitRows(),
        duplicate_action: duplicateAction.value,
        batch_remark: batchRemark.value,
        overwrite_reason: overwriteReason.value,
        source_file_name: importedFileName.value || '手工录入',
        source_file_size: importedFileSize.value || 0,
        auto_set_start_date: autoSetStartDate.value,
        damaged_point_ids: damagedPointIds.value,
      })
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      ElMessage.error(data.message || '保存失败')
      return
    }
    commitResult.value = data.data
    ElMessage.success(`批次已保存：新增${data.data.inserted}条，覆盖${data.data.overwritten}条，跳过${data.data.skipped}条，缺测${data.data.missing}条，启测${data.data.start_dates_updated}个`)
    matrixRows.value.forEach((row) => { row._modified = false })
    previewResult.value = null
    damagedPointIds.value = []
    await loadExistingSummary()
  } catch (e) {
    ElMessage.error('保存失败，请检查网络连接')
  } finally {
    saving.value = false
  }
}

function makeImportedRow(monitorDate, remark = '') {
  const row = {
    monitor_date: monitorDate,
    values: {},
    missing_reasons: {},
    remark,
    _modified: true,
    _source: 'excel'
  }
  for (const point of pointsByType.value) row.values[point.id] = null
  return row
}

async function applyImportedRows(newRows, file, messagePrefix = '成功导入') {
  const existingDates = new Set(
    (existingSummary.value.by_date || [])
      .filter(item => item.point_type === selectedPointType.value)
      .map(item => String(item.monitor_date || '').slice(0, 10))
      .filter(Boolean)
  )
  const duplicateDates = [...new Set(
    newRows
      .map(row => String(row.monitor_date || '').slice(0, 10))
      .filter(date => date && existingDates.has(date))
  )]
  let overwriteExisting = false
  if (duplicateDates.length) {
    try {
      await ElMessageBox.confirm(
        `检测到 ${duplicateDates.length} 个日期已存在。选择“覆盖已有数据”将进入覆盖校核；选择“只录入新日期”将跳过这些日期。`,
        '发现已录入日期',
        {
          confirmButtonText: '覆盖已有数据',
          cancelButtonText: '只录入新日期',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          type: 'warning',
        }
      )
      overwriteExisting = true
    } catch (action) {
      if (action === 'close') {
        ElMessage.info('已取消本次导入')
        return false
      }
    }
  }

  const rowsToImport = overwriteExisting
    ? newRows
    : newRows.filter(row => !existingDates.has(String(row.monitor_date || '').slice(0, 10)))
  duplicateAction.value = overwriteExisting ? 'overwrite' : 'skip'
  importedSkippedDateCount.value = overwriteExisting ? 0 : newRows.length - rowsToImport.length

  if (rowsToImport.length > 0) {
    matrixRows.value = rowsToImport
    entryMode.value = 'excel'
    importedFileName.value = file.name
    importedFileSize.value = file.size || 0
    previewResult.value = null
    commitResult.value = null
    damagedPointIds.value = []
    importedDetailOpen.value = []
    const skippedText = importedSkippedDateCount.value ? `，已跳过 ${importedSkippedDateCount.value} 个已录日期` : ''
    ElMessage.success(`${messagePrefix} ${rowsToImport.length} 行数据${skippedText}`)
  } else {
    importedFileName.value = file.name
    importedFileSize.value = file.size || 0
    matrixRows.value = []
    ElMessage.warning(importedSkippedDateCount.value ? `文件中的 ${importedSkippedDateCount.value} 个日期均已录入，无需重复录入` : '没有解析到有效的数据行')
  }
  return true
}

function setUploadProgress(percent, text) {
  uploadProgress.value = Math.max(0, Math.min(100, Math.round(percent)))
  uploadStatusText.value = text
}

function parseSummaryBlockExcel(jsonData) {
  if (jsonData.length < 6) return null
  const markerRow = jsonData[2] || []
  const titleText = jsonData.slice(0, 4).flat().map((cell) => String(cell || '')).join('|')
  const looksLikeSummary = titleText.includes('边坡位移数据汇总表') || markerRow.some((cell) => String(cell || '') === '测点编号')
  if (!looksLikeSummary) return null

  const valueOffset = selectedPointType.value === '沉降监测点' ? 12 : 7
  const blocks = []
  for (let col = 0; col < markerRow.length - valueOffset; col += 1) {
    if (String(markerRow[col] || '').trim() !== '测点编号') continue
    const importedPointName = String(markerRow[col + 1] || '').trim()
    const point = findPointByImportedName(importedPointName)
    if (!point) continue
    blocks.push({
      point,
      importedPointName,
      dateCol: col + 1,
      valueCol: col + valueOffset,
    })
  }

  if (!blocks.length) return null
  const rowMap = new Map()
  for (let rowIndex = 5; rowIndex < jsonData.length; rowIndex += 1) {
    const sourceRow = jsonData[rowIndex] || []
    blocks.forEach((block) => {
      const monitorDate = normalizeMonitorDate(sourceRow[block.dateCol])
      if (!monitorDate) return
      const value = parseNumberCell(sourceRow[block.valueCol])
      if (!rowMap.has(monitorDate)) rowMap.set(monitorDate, makeImportedRow(monitorDate, '汇总表导入'))
      rowMap.get(monitorDate).values[block.point.id] = value
    })
  }

  return {
    rows: Array.from(rowMap.values()),
    matchedPoints: blocks.length,
  }
}

function parseStandardMatrixExcel(jsonData) {
  if (jsonData.length < 2) throw new Error('Excel文件格式不正确，至少需要包含表头和一行数据')
  const normalizeHeader = (value) => String(value ?? '')
    .replace(/[\uFEFF\u200B\u00A0]/g, '')
    .replace(/[\s\r\n]/g, '')
    .trim()
  const headerRowIndex = jsonData.findIndex(row => row.some(value => /^(监测|量测|观测|测量|采集)?日期(?:[（(].*[）)])?$/.test(normalizeHeader(value))))
  if (headerRowIndex === -1) throw new Error('未找到日期表头，请确认工作表中有“监测日期”或“观测日期”等列')
  const headers = jsonData[headerRowIndex]
  const normalizedHeaders = headers.map(normalizeHeader)
  // 兼容“监测日期 / 量测日期 / 观测日期 / 日期”等常见表头写法。
  let dateIndex = normalizedHeaders.findIndex(h => /日期$/.test(h) || h.includes('监测日期') || h.includes('量测日期') || h.includes('观测日期'))
  // 某些由旧版脚本导出的文件首列表头可能被 Excel 保存为空，但首列数据仍是日期。
  const remarkIndex = normalizedHeaders.findIndex(h => h.includes('备注') || h.includes('说明'))
  if (dateIndex === -1) throw new Error(`Excel文件缺少“监测日期”列，识别到的表头：${normalizedHeaders.filter(Boolean).join('、') || '（空）'}`)

  const pointMapping = {}
  for (const p of pointsByType.value) {
    const index = headers.findIndex((h) => findPointByImportedName(h)?.id === p.id)
    if (index !== -1) pointMapping[p.id] = index
  }
  if (Object.keys(pointMapping).length === 0) {
    const importedPoints = normalizedHeaders.filter((_, index) => index !== dateIndex && index !== remarkIndex).filter(Boolean)
    const systemPoints = pointsByType.value.map(point => point.point_name)
    throw new Error(`Excel测点与当前边坡不匹配。Excel列：${importedPoints.join('、') || '（空）'}；系统测点：${systemPoints.join('、') || '（当前类型无测点）'}`)
  }

  const newRows = []
  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const rowData = jsonData[i]
    const monitorDate = normalizeMonitorDate(rowData[dateIndex])
    if (!monitorDate) continue
    const row = makeImportedRow(
      monitorDate,
      remarkIndex !== -1 ? (rowData[remarkIndex] || '') : ''
    )
    for (const [pointId, colIndex] of Object.entries(pointMapping)) {
      row.values[pointId] = parseNumberCell(rowData[colIndex])
    }
    newRows.push(row)
  }
  return newRows
}

// 处理Excel上传
async function handleExcelUpload(file) {
  if (uploadProcessing.value) return
  uploadProcessing.value = true
  setUploadProgress(0, '正在读取文件...')
  // 上传前刷新完整日期清单，避免用旧缓存判断重复日期。
  await loadExistingSummary()
  const reader = new FileReader()
  reader.onloadstart = () => setUploadProgress(5, '正在读取文件...')
  reader.onprogress = (event) => {
    if (!event.lengthComputable) {
      setUploadProgress(Math.max(uploadProgress.value, 20), '正在读取文件...')
      return
    }
    setUploadProgress(5 + (event.loaded / event.total) * 45, `正在读取文件 ${Math.round((event.loaded / event.total) * 100)}%`)
  }
  reader.onload = async (e) => {
    try {
      setUploadProgress(55, '正在解析 Excel...')
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      setUploadProgress(75, '正在识别监测日期和测点...')
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', blankrows: false })

      const summaryParsed = parseSummaryBlockExcel(jsonData)
      if (summaryParsed) {
        await applyImportedRows(summaryParsed.rows, file, `已识别汇总表格式，匹配 ${summaryParsed.matchedPoints} 个测点，导入`)
      } else {
        setUploadProgress(92, '正在生成录入矩阵...')
        await applyImportedRows(parseStandardMatrixExcel(jsonData), file)
      }
      setUploadProgress(100, '文件解析完成')
    } catch (err) {
      console.error(err)
      ElMessage.error(err.message || 'Excel解析失败，请检查文件格式')
    } finally {
      setTimeout(() => {
        uploadProcessing.value = false
        uploadProgress.value = 0
        uploadStatusText.value = ''
      }, 500)
    }
  }
  reader.onerror = () => {
    ElMessage.error('文件读取失败，请重新选择文件')
    uploadProcessing.value = false
    uploadProgress.value = 0
    uploadStatusText.value = ''
  }
  reader.readAsArrayBuffer(file.raw)
}

// 导出模板
function exportTemplate() {
  if (pointsByType.value.length === 0) {
    ElMessage.warning('当前没有可用的监测点，无法生成模板')
    return
  }

  const headers = ['监测日期']
  for (const p of pointsByType.value) {
    headers.push(p.point_name)
  }
  headers.push('备注')

  const ws = XLSX.utils.aoa_to_sheet([headers])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '录入模板')

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `监测数据录入模板_${selectedPointType.value}_${today}.xlsx`)
}

// 跳转测点管理
function goPointManagement() {
  router.push({ path: '/slope-management', query: { slope_id: selectedSlopeId.value } })
}

function startNextBatch() {
  initMatrixRows()
  batchRemark.value = ''
  overwriteReason.value = ''
  damagedPointIds.value = []
}

async function clearSlopeData() {
  const token = requireAuthOrRedirect()
  if (!token || !selectedSlopeId.value) return
  const slopeName = currentSlopeDetail.value?.slope_name || currentSlopeName.value

  try {
    const { value: password } = await ElMessageBox.prompt(
      `该操作会清空“${slopeName}”下所有监测数据和缺测记录，边坡与测点不会删除。请输入清空密码继续。`,
      '清空该边坡数据',
      {
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '请输入清空密码',
        type: 'warning',
        distinguishCancelAndClose: true,
      }
    )

    const res = await fetch(`${API_DATA}/api/monitoring-data/matrix/slope/${selectedSlopeId.value}/all-data`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.message || '清空失败')

    resetMatrixAfterClear()
    await loadExistingSummary()
    ElMessage.success(`已清空：监测数据 ${data.data?.deleted_data || 0} 条，缺测记录 ${data.data?.deleted_missing || 0} 条`)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error.message || '清空失败')
  }
}

function resetMatrixAfterClear() {
  matrixRows.value = []
  damagedPointIds.value = []
  batchRemark.value = ''
  overwriteReason.value = ''
  previewResult.value = null
  commitResult.value = null
  initMatrixRows()
}

function goDataView() {
  router.push({
    path: '/data-view',
    query: { slopeId: selectedSlopeId.value, monitoringType: selectedPointType.value },
  })
}

// 新建边坡弹窗
const addSlopeDialogVisible = ref(false)
const addSlopeForm = reactive({
  slope_name: '',
  slope_type: '滑坡',
  location: '',
  description: ''
})

function openAddSlopeDialog() {
  addSlopeForm.slope_name = ''
  addSlopeForm.slope_type = '滑坡'
  addSlopeForm.location = ''
  addSlopeForm.description = ''
  addSlopeDialogVisible.value = true
}

async function submitAddSlope() {
  if (!addSlopeForm.slope_name) {
    ElMessage.warning('请输入边坡名称')
    return
  }

  const token = requireAuthOrRedirect()
  if (!token) return

  try {
    const res = await fetch(`${API_DATA}/api/slopes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(addSlopeForm)
    })

    if (!res.ok) {
      if (res.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        return
      }
      throw new Error('网络请求失败')
    }

    const data = await res.json()
    if (data.success) {
      ElMessage.success('边坡创建成功')
      addSlopeDialogVisible.value = false
      await loadSlopes()
      // 自动选中新创建的边坡
      if (data.data && data.data.id) {
        selectedSlopeId.value = String(data.data.id)
        await onSlopeChange(data.data.id)
      }
    } else {
      ElMessage.error(data.message || '创建失败')
    }
  } catch (e) {
    ElMessage.error('创建失败')
  }
}

onMounted(() => {
  loadSlopes()
})
</script>

<style scoped>
.data-entry-page {
  padding: 18px 20px 92px;
}

.entry-workspace {
  width: 100%;
  min-width: 0;
  background: #fff;
  border: 1px solid #e4e7ed;
}

.entry-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
  padding: 0 22px;
  border-bottom: 1px solid #e4e7ed;
}

.entry-page-header h2,
.section-title-row h3 {
  margin: 0;
  color: #1f2937;
  letter-spacing: 0;
}

.entry-page-header h2 {
  font-size: 19px;
}

.context-band {
  padding: 14px 22px 0;
  background: #f7f9fc;
  border-bottom: 1px solid #e4e7ed;
}

.context-controls {
  display: grid;
  grid-template-columns: minmax(180px, 0.72fr) minmax(260px, 1.3fr) minmax(260px, 1fr);
  gap: 14px;
  align-items: end;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.field-block > span {
  color: #606266;
  font-size: 12px;
  font-weight: 600;
}

.type-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
}

.type-option em {
  color: #909399;
  font-size: 12px;
  font-style: normal;
}

.context-summary {
  display: grid;
  grid-template-columns: 1.1fr 1.6fr repeat(3, minmax(90px, 0.7fr));
  margin-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.context-summary > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 11px 14px 12px 0;
}

.context-summary span {
  flex: none;
  color: #909399;
  font-size: 11px;
}

.context-summary strong {
  overflow: hidden;
  color: #303133;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.existing-data-panel {
  margin-top: 14px;
  border: 1px solid #dcdfe6;
  background: #fff;
}

.existing-data-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid #ebeef5;
}

.existing-data-head > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.existing-data-actions {
  align-items: center !important;
  gap: 8px !important;
}

.existing-data-head strong {
  color: #303133;
  font-size: 14px;
}

.existing-data-head span {
  color: #909399;
  font-size: 12px;
}

.existing-data-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(110px, 0.8fr)) minmax(180px, 1.4fr) minmax(150px, 1fr);
  border-bottom: 1px solid #ebeef5;
}

.existing-data-stats > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 14px;
}

.existing-data-stats > div + div {
  border-left: 1px solid #ebeef5;
}

.existing-data-stats span,
.existing-date-item span,
.existing-date-item em {
  color: #909399;
  font-size: 11px;
  font-style: normal;
}

.existing-data-stats strong {
  overflow: hidden;
  color: #303133;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.existing-date-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
  padding: 12px 14px;
}

.existing-date-item {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  gap: 8px;
  align-items: center;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid #ebeef5;
  background: #fafbfd;
}

.existing-date-item strong {
  color: #303133;
  font-size: 12px;
}

.flow-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 22px 4px;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #909399;
  font-size: 12px;
}

.flow-step span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid #c0c4cc;
  border-radius: 50%;
  font-weight: 600;
}

.flow-step.active {
  color: #409eff;
}

.flow-step.active span {
  border-color: #409eff;
  background: #409eff;
  color: #fff;
}

.flow-line {
  width: clamp(54px, 8vw, 120px);
  height: 1px;
  margin: 0 12px;
  background: #dcdfe6;
}

.entry-mode-section,
.review-section,
.commit-result {
  margin: 14px 22px 0;
}

.entry-mode-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.entry-mode-tabs :deep(.el-tabs__item) {
  height: 42px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 600;
}

.excel-start {
  border: 1px solid #dcdfe6;
  background: #fafbfd;
}

.excel-start :deep(.el-upload),
.excel-start :deep(.el-upload-dragger) {
  width: 100%;
}

.excel-start :deep(.el-upload-dragger) {
  min-height: 230px;
  padding: 58px 20px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.excel-upload-shell {
  min-width: 0;
}

.upload-progress {
  padding: 12px 16px;
  border: 1px solid #dcdfe6;
  border-top: 0;
  background: #f7f9fc;
}

.upload-progress.compact {
  border-right: 0;
  border-left: 0;
}

.upload-progress span {
  display: block;
  margin-top: 6px;
  color: #606266;
  font-size: 12px;
}

.upload-main-icon {
  color: #409eff;
  font-size: 42px;
}

.upload-title {
  margin-top: 14px;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.excel-tools,
.file-summary-row,
.manual-toolbar,
.observation-heading,
.section-title-row,
.commit-bar,
.result-title,
.result-counts {
  display: flex;
  align-items: center;
}

.excel-tools {
  justify-content: space-between;
  min-height: 48px;
  padding: 0 16px;
  border-top: 1px solid #ebeef5;
  color: #606266;
  font-size: 12px;
}

.excel-tool-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.import-rule-tip {
  padding: 8px 16px;
  border-top: 1px solid #ebeef5;
  background: #f5f9ff;
  color: #66798a;
  font-size: 12px;
}

.imported-file-panel {
  border: 1px solid #dcdfe6;
}

.file-summary-row {
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.file-identity,
.file-actions,
.observation-actions,
.commit-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-identity > .el-icon {
  color: #409eff;
  font-size: 30px;
}

.file-identity > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-identity span {
  color: #909399;
  font-size: 11px;
}

.import-summary-strip {
  display: grid;
  grid-template-columns: 1.5fr repeat(3, 1fr);
  border-top: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
  background: #f7f9fc;
}

.import-summary-strip > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 16px;
}

.import-summary-strip > div + div {
  border-left: 1px solid #e4e7ed;
}

.import-summary-strip span {
  color: #909399;
  font-size: 11px;
}

.import-summary-strip strong {
  font-size: 14px;
}

.import-detail-collapse {
  border: 0;
}

.import-detail-collapse :deep(.el-collapse-item__header) {
  padding: 0 16px;
  border-bottom: 0;
}

.import-detail-collapse :deep(.el-collapse-item__content) {
  padding: 0 16px 16px;
}

.manual-toolbar {
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid #e4e7ed;
  background: #f7f9fc;
}

.manual-primary-fields {
  display: grid;
  grid-template-columns: 210px minmax(240px, 360px);
  gap: 16px;
}

.manual-observation {
  margin-top: 12px;
  border: 1px solid #e4e7ed;
}

.observation-heading {
  justify-content: space-between;
  gap: 16px;
  min-height: 54px;
  padding: 0 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #fafbfd;
}

.observation-heading > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.observation-heading span {
  color: #909399;
  font-size: 11px;
}

.observation-actions .el-input {
  width: 260px;
}

.manual-point-table {
  width: 100%;
}

.manual-table-head,
.manual-point-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(150px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 14px;
  align-items: center;
  min-height: 50px;
  padding: 7px 16px;
}

.manual-table-head {
  min-height: 38px;
  background: #f5f7fa;
  color: #606266;
  font-size: 12px;
  font-weight: 600;
}

.manual-point-row + .manual-point-row {
  border-top: 1px solid #ebeef5;
}

.manual-point-row > span {
  overflow: hidden;
  color: #606266;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manual-point-row .el-input-number,
.manual-point-row .el-select {
  width: 100%;
}

.status-text.valid {
  color: #529b2e;
  font-weight: 600;
}

.status-text.muted {
  color: #909399;
}

.add-period-button {
  width: 100%;
  height: 42px;
  margin-top: 12px;
  border-style: dashed;
}

.review-section {
  padding-top: 18px;
  border-top: 1px solid #e4e7ed;
}

.section-title-row {
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-title-row h3 {
  font-size: 16px;
}

.section-title-row p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 11px;
}

.review-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(100px, 1fr));
  margin-bottom: 14px;
  border: 1px solid #e4e7ed;
}

.review-summary button {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 66px;
  padding: 10px 14px;
  border: 0;
  background: #fff;
  color: #606266;
  text-align: left;
  cursor: pointer;
}

.review-summary button + button {
  border-left: 1px solid #e4e7ed;
}

.review-summary button.active {
  box-shadow: inset 0 -2px #409eff;
  color: #409eff;
}

.review-summary button span {
  font-size: 11px;
}

.review-summary button strong {
  color: #303133;
  font-size: 19px;
}

.batch-options {
  display: grid;
  grid-template-columns: auto minmax(260px, 1fr) minmax(260px, 1fr);
  gap: 14px;
  align-items: center;
  margin-top: 14px;
  padding: 14px 16px;
  background: #f7f9fc;
  border: 1px solid #e4e7ed;
}

.first-upload-options {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(280px, 420px);
  gap: 16px;
  align-items: center;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #f3d19e;
  background: #fdf6ec;
}

.first-upload-options > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.first-upload-options strong {
  color: #303133;
  font-size: 14px;
}

.first-upload-options span {
  color: #606266;
  font-size: 12px;
}

.commit-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid #b3e19d;
  background: #f0f9eb;
}

.result-title {
  gap: 8px;
  color: #529b2e;
}

.result-title span {
  margin-left: 8px;
  color: #606266;
  font-size: 12px;
}

.result-counts {
  gap: 22px;
  margin-top: 8px;
  color: #606266;
  font-size: 12px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.commit-bar {
  position: sticky;
  z-index: 8;
  bottom: 0;
  justify-content: space-between;
  gap: 18px;
  min-height: 68px;
  margin-top: 22px;
  padding: 10px 22px;
  border-top: 1px solid #dcdfe6;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -4px 14px rgba(31, 41, 55, 0.08);
  backdrop-filter: blur(6px);
}

.commit-bar > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.commit-bar span {
  color: #909399;
  font-size: 11px;
}

@media (max-width: 1180px) {
  .context-controls {
    grid-template-columns: minmax(160px, 0.75fr) minmax(220px, 1.25fr) minmax(220px, 1fr);
  }

  .context-summary {
    grid-template-columns: repeat(3, 1fr);
  }

  .review-summary {
    grid-template-columns: repeat(3, 1fr);
  }

  .review-summary button:nth-child(4) {
    border-left: 0;
  }

  .batch-options,
  .first-upload-options {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .data-entry-page {
    padding: 10px 10px 84px;
  }

  .entry-page-header,
  .context-band,
  .entry-mode-section,
  .review-section,
  .commit-result {
    margin-right: 0;
    margin-left: 0;
  }

  .entry-page-header,
  .context-band {
    padding-right: 14px;
    padding-left: 14px;
  }

  .context-controls,
  .context-summary,
  .manual-primary-fields,
  .review-summary,
  .batch-options,
  .first-upload-options,
  .import-summary-strip {
    grid-template-columns: 1fr;
  }

  .context-summary > div,
  .review-summary button,
  .import-summary-strip > div {
    border-left: 0 !important;
    border-top: 1px solid #e4e7ed;
  }

  .manual-toolbar,
  .observation-heading,
  .commit-result,
  .commit-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .manual-table-head {
    display: none;
  }

  .manual-point-row {
    grid-template-columns: 1fr;
  }

  .observation-actions,
  .observation-actions .el-input,
  .result-actions,
  .result-actions .el-button,
  .commit-actions,
  .commit-actions .el-button {
    width: 100%;
  }
}
.side-card {
  height: 100%;
}
.side-card-title {
  font-weight: 600;
}
.side-section {
  margin-bottom: 12px;
}
.side-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}
.slope-desc {
  margin-top: 8px;
}
.type-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.type-btn {
  justify-content: space-between;
  width: 100%;
}
.type-count-tag {
  margin-left: 8px;
}
.warn-text {
  color: #e6a23c;
  font-size: 13px;
  margin: 12px 0;
  padding: 8px;
  background: #fdf6ec;
  border-radius: 4px;
}
.main-entry-card {
  min-height: 600px;
}
.matrix-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.batch-bar {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
.batch-form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.matrix-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.matrix-table-wrap {
  overflow-x: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.matrix-table th,
.matrix-table td {
  border: 1px solid #e4e7ed;
  padding: 8px;
  text-align: center;
}
.matrix-table th {
  background: #f5f7fa;
  font-weight: 600;
}
.matrix-table .col-date {
  min-width: 150px;
}
.matrix-table .col-point {
  min-width: 120px;
}
.matrix-table .col-value {
  min-width: 100px;
}
.matrix-table .col-remark {
  min-width: 150px;
}
.matrix-table .col-action {
  min-width: 80px;
}
.point-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.point-name {
  font-weight: 600;
}
.point-location {
  font-size: 11px;
  color: #909399;
}
.row-modified {
  background: #f0f9ff;
}
.cell-missing {
  background: #fff7e6;
}
.cell-not-started {
  background: #f3f4f6;
}
.cell-warning {
  background: #fff7e6;
}
.cell-error {
  background: #fff1f0;
}
.missing-reason {
  margin-top: 6px;
  width: 100%;
}
.add-row-area {
  text-align: center;
  padding: 16px;
  border: 2px dashed #d9d9d9;
  border-radius: 4px;
}
.preview-section {
  margin-top: 16px;
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(110px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.duplicate-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  color: #606266;
}
.issue-table {
  margin-top: 12px;
}
.start-date-alert {
  margin: 12px 0;
}
.point-review-panel {
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid #dbe5f1;
  border-radius: 6px;
  background: #fbfdff;
}
.point-review-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.point-review-heading h3 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}
.point-review-heading p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.point-review-filter {
  width: 150px;
  flex: 0 0 auto;
}
.point-review-table {
  width: 100%;
}
.point-detail-panel {
  padding: 12px 18px 16px;
  background: #f8fafc;
}
.point-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #374151;
}
.point-detail-head span {
  color: #909399;
  font-size: 12px;
}
@media (max-width: 768px) {
  .point-review-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .point-review-filter {
    width: 100%;
  }
}
</style>
