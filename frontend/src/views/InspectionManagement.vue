<template>
  <div class="inspection-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">边坡巡查台账</span>
        <h1>边坡巡查管理</h1>
        <p>按“计划—巡查—整改—复核”闭环管理现场工作。</p>
      </div>
      <div class="heading-actions">
        <el-button @click="openPlans">巡查计划</el-button>
        <el-button @click="openAnalytics">统计分析</el-button>
        <el-button @click="openReport">生成报告</el-button>
        <el-button type="primary" :icon="Plus" @click="openAddDialog">新增巡查记录</el-button>
      </div>
    </header>

    <section class="workflow-strip" v-loading="dashboardLoading">
      <button class="workflow-item" type="button" @click="openPlans">
        <span>本周应巡查</span><strong>{{ dashboard.week_required_slopes }}</strong><small>{{ dashboard.week_start }} 至 {{ dashboard.week_end }}</small>
      </button>
      <div class="workflow-arrow">→</div>
      <div class="workflow-item"><span>本周已完成</span><strong>{{ dashboard.week_completed_slopes }}</strong><small>未完成 {{ dashboard.week_pending_slopes }} 个边坡</small></div>
      <div class="workflow-arrow">→</div>
      <button class="workflow-item" type="button" @click="filterOpenRectifications">
        <span>本周异常</span><strong>{{ dashboard.week_problem_records }}</strong><small>待闭环 {{ dashboard.open_rectifications }} 项</small>
      </button>
      <div class="workflow-arrow">→</div>
      <div class="workflow-item workflow-end"><span>计划预警</span><strong>{{ dashboard.due_plans }}</strong><small>逾期计划 {{ dashboard.overdue_plans }} 项</small></div>
    </section>

    <nav class="layer-tabs">
      <button v-for="item in layerOptions" :key="item.value" type="button" :class="{active:activeLayer===item.value}" @click="switchLayer(item.value)">
        <strong>{{ item.label }}</strong>
        <span>{{ item.note }}</span>
      </button>
    </nav>

    <section v-if="activeLayer==='weekly'" class="weekly-panel" v-loading="weeklyLoading">
      <div class="weekly-heading">
        <div>
          <h2>本周巡查任务</h2>
          <p>按边坡生成任务，完成后自动归入巡查台账和问题闭环。</p>
        </div>
        <div class="weekly-summary">
          <span>应巡 {{ weeklySummary.total }}</span>
          <span>已巡 {{ weeklySummary.completed }}</span>
          <span>未巡 {{ weeklySummary.pending }}</span>
          <span>异常 {{ weeklySummary.problem }}</span>
        </div>
      </div>
      <el-table :data="weeklyTasks.slice(0, weeklyExpanded ? weeklyTasks.length : 8)" empty-text="当前标段暂无巡查任务">
        <el-table-column prop="section" label="标段" width="110" show-overflow-tooltip />
        <el-table-column prop="slope_name" label="边坡" min-width="190" show-overflow-tooltip />
        <el-table-column label="任务状态" width="105">
          <template #default="scope"><el-tag :type="taskStatusType(scope.row.task_status)" effect="plain">{{ taskStatusText(scope.row.task_status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="计划日期" width="120"><template #default="scope">{{ dateOnly(scope.row.next_due_date) }}</template></el-table-column>
        <el-table-column prop="responsible_person" label="负责人" width="110" show-overflow-tooltip />
        <el-table-column label="本周记录" min-width="190" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.inspection_id">{{ formatDate(scope.row.inspection_date) }}，照片 {{ scope.row.image_count }} 张</span>
            <span v-else class="muted">尚未上传本周巡查照片</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button v-if="scope.row.inspection_id" link type="primary" @click="openDetail({ id: scope.row.inspection_id })">查看</el-button>
            <el-button link type="primary" @click="openAddFromTask(scope.row)">记录巡查</el-button>
          </template>
        </el-table-column>
      </el-table>
      <button v-if="weeklyTasks.length > 8" class="plain-toggle" type="button" @click="weeklyExpanded=!weeklyExpanded">{{ weeklyExpanded ? '收起任务' : `展开全部 ${weeklyTasks.length} 个任务` }}</button>
    </section>

    <section v-if="activeLayer==='summary'" class="summary-panel" v-loading="summaryLoading">
      <div class="summary-toolbar">
        <label><span>统计层级</span><el-radio-group v-model="summaryForm.period_type" @change="handleSummaryTypeChange"><el-radio-button label="month">月巡查</el-radio-button><el-radio-button label="year">年巡查</el-radio-button></el-radio-group></label>
        <label><span>统计周期</span><el-date-picker v-if="summaryForm.period_type==='month'" v-model="summaryForm.period" type="month" value-format="YYYY-MM" placeholder="选择月份" /><el-date-picker v-else v-model="summaryForm.period" type="year" value-format="YYYY" placeholder="选择年份" /></label>
        <label><span>标段</span><el-select v-model="summaryForm.section" clearable filterable placeholder="全部标段"><el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" /></el-select></label>
        <el-button type="primary" :icon="Search" @click="getPeriodSummary">查询汇总</el-button>
      </div>
      <div class="summary-metrics">
        <div><span>边坡数量</span><strong>{{ periodSummary.slope_count }}</strong></div>
        <div><span>应巡次数</span><strong>{{ periodSummary.expected_times }}</strong></div>
        <div><span>实际巡查</span><strong>{{ periodSummary.actual_times }}</strong></div>
        <div><span>完成率</span><strong>{{ periodSummary.completion_rate }}%</strong></div>
        <div><span>异常次数</span><strong>{{ periodSummary.problem_times }}</strong></div>
        <div><span>未闭环</span><strong>{{ periodSummary.open_problem_times }}</strong></div>
      </div>
      <el-table :data="periodRows" class="inspection-table" empty-text="当前周期暂无巡查汇总">
        <el-table-column prop="section" label="标段" width="120" show-overflow-tooltip />
        <el-table-column prop="slope_name" label="边坡名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="slope_type" label="边坡类型" width="110" show-overflow-tooltip />
        <el-table-column prop="expected_times" label="应巡次数" width="95" align="center" />
        <el-table-column prop="actual_times" label="已巡次数" width="95" align="center" />
        <el-table-column label="完成率" width="120" align="center"><template #default="scope"><el-progress :percentage="scope.row.completion_rate" :stroke-width="8" /></template></el-table-column>
        <el-table-column prop="problem_times" label="异常次数" width="95" align="center" />
        <el-table-column prop="open_problem_times" label="未闭环" width="90" align="center" />
        <el-table-column prop="photo_count" label="照片数" width="90" align="center" />
        <el-table-column label="最近巡查" width="140"><template #default="scope">{{ formatDate(scope.row.last_inspection_date) }}</template></el-table-column>
        <el-table-column label="操作" width="120" fixed="right"><template #default="scope"><el-button link type="primary" @click="openSlopeLedger(scope.row)">查看台账</el-button></template></el-table-column>
      </el-table>
    </section>

    <section v-if="activeLayer==='ledger'||activeLayer==='issues'" class="filter-rail">
      <label class="filter-field"><span>标段</span>
        <el-select v-model="searchForm.section" clearable filterable placeholder="全部标段" @change="handleSearchSectionChange">
          <el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" />
        </el-select>
      </label>
      <label class="filter-field"><span>边坡</span>
        <el-select v-model="searchForm.slope_id" clearable filterable :disabled="!searchForm.section" :placeholder="searchForm.section ? '全部边坡' : '请先选择标段'">
          <el-option v-for="slope in filteredSearchSlopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" />
        </el-select>
      </label>
      <label class="filter-field date-filter"><span>巡查日期</span>
        <el-date-picker v-model="searchForm.date_range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" />
      </label>
      <label class="filter-field"><span>整改状态</span>
        <el-select v-model="searchForm.rectification_status" clearable placeholder="全部状态">
          <el-option v-for="item in rectificationOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </label>
      <label class="problem-filter"><span>仅看问题</span><el-switch v-model="searchForm.only_problems" /></label>
      <div class="filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="resetSearch">重置</el-button></div>
    </section>

    <section v-if="activeLayer==='ledger'||activeLayer==='issues'" class="register-panel" v-loading="loading">
      <div class="register-heading"><div><h2>{{ activeLayer==='issues'?'问题闭环台账':'边坡巡查台账' }}</h2><p>{{ activeLayer==='issues'?'集中跟踪异常巡查和整改复核':'按边坡、周/月/年筛选历史巡查资料' }}，共 {{ pagination.total }} 条记录</p></div></div>
      <el-table :data="inspections" class="inspection-table" empty-text="当前条件下暂无巡查记录">
        <el-table-column label="序号" width="66" align="center"><template #default="scope">{{ rowNumber(scope.$index) }}</template></el-table-column>
        <el-table-column prop="section" label="标段" min-width="118" show-overflow-tooltip />
        <el-table-column prop="slope_name" label="边坡名称" min-width="170" show-overflow-tooltip />
        <el-table-column label="巡查日期" width="145"><template #default="scope">{{ formatDate(scope.row.inspection_date) }}</template></el-table-column>
        <el-table-column prop="inspector" label="巡查人员" width="100" show-overflow-tooltip />
        <el-table-column prop="inspection_type" label="巡查场景" width="120" show-overflow-tooltip />
        <el-table-column label="巡查结论" width="112"><template #default="scope"><el-tag :type="conclusionType(scope.row)" effect="plain">{{ conclusionText(scope.row) }}</el-tag></template></el-table-column>
        <el-table-column label="整改状态" width="112"><template #default="scope"><el-tag v-if="Number(scope.row.has_problem)" :type="rectificationType(scope.row.rectification_status)" effect="plain">{{ rectificationText(scope.row.rectification_status) }}</el-tag><span v-else class="muted">无需整改</span></template></el-table-column>
        <el-table-column label="问题摘要" min-width="200" show-overflow-tooltip><template #default="scope"><span :class="['problem-summary',{muted:!Number(scope.row.has_problem)}]">{{ problemSummary(scope.row) }}</span></template></el-table-column>
        <el-table-column label="操作" width="220" fixed="right"><template #default="scope">
          <el-button link type="primary" @click="openDetail(scope.row)">查看</el-button>
          <el-button v-if="Number(scope.row.has_problem)" link type="warning" @click="openRectification(scope.row)">整改</el-button>
          <el-button link type="primary" @click="openEditDialog(scope.row)">编辑</el-button>
          <el-button link type="danger" @click="voidInspection(scope.row)">作废</el-button>
          <el-button v-if="isAdmin" link type="danger" @click="deleteInspection(scope.row)">删除</el-button>
        </template></el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.limit" :page-sizes="[10,20,50,100]" layout="total, sizes, prev, pager, next, jumper" :total="pagination.total" @size-change="handleSizeChange" @current-change="handleCurrentChange" /></div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogType==='add'?'新增巡查记录':'编辑巡查记录'" width="940px" top="4vh" destroy-on-close>
      <el-form :model="inspectionForm" label-position="top" class="inspection-form">
        <section class="form-section"><div class="form-section-title"><strong>巡查对象</strong><small>确定标段、边坡、时间和责任人员</small></div>
          <div class="form-grid four-columns">
            <el-form-item label="所属标段" required><el-select v-model="formSection" filterable placeholder="选择标段" @change="handleFormSectionChange"><el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" /></el-select></el-form-item>
            <el-form-item label="边坡" required><el-select v-model="inspectionForm.slope_id" filterable :disabled="!formSection" placeholder="选择边坡"><el-option v-for="slope in filteredFormSlopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" /></el-select></el-form-item>
            <el-form-item label="巡查日期" required><el-date-picker v-model="inspectionForm.inspection_date" type="datetime" placeholder="选择日期时间" /></el-form-item>
            <el-form-item label="巡查人员" required><el-input v-model="inspectionForm.inspector" placeholder="填写巡查人员" /></el-form-item>
          </div>
          <el-form-item label="巡查场景"><el-radio-group v-model="inspectionForm.inspection_type"><el-radio-button v-for="item in inspectionTypes" :key="item" :label="item" /></el-radio-group></el-form-item>
        </section>

        <section class="form-section"><div class="form-section-title"><strong>标准巡查项目</strong><small>问题项会自动纳入巡查结论</small></div>
          <div class="checklist-table"><div class="checklist-head"><span>巡查项目</span><span>检查结果</span><span>现场说明</span></div>
            <div v-for="item in inspectionForm.checklist" :key="item.key" class="checklist-row"><strong>{{ item.label }}</strong><el-radio-group v-model="item.status" size="small" @change="handleChecklistChange"><el-radio-button label="normal">正常</el-radio-button><el-radio-button label="problem">有问题</el-radio-button><el-radio-button label="unchecked">未检查</el-radio-button></el-radio-group><el-input v-model="item.note" :placeholder="item.status==='problem'?'说明异常现象':'可补充现场情况'" /></div>
          </div>
        </section>

        <section class="form-section"><div class="form-section-title"><strong>问题与整改安排</strong><small>发现问题时直接明确负责人和期限</small></div>
          <div class="conclusion-switch"><div><strong>本次是否发现问题</strong><span>有问题记录将进入整改闭环</span></div><el-radio-group v-model="inspectionForm.has_problem"><el-radio-button :label="false">未发现明显异常</el-radio-button><el-radio-button :label="true">发现问题</el-radio-button></el-radio-group></div>
          <div v-if="inspectionForm.has_problem" class="problem-fields">
            <div class="form-grid four-columns">
              <el-form-item label="问题等级" required><el-select v-model="inspectionForm.problem_level" placeholder="选择等级"><el-option label="一般问题" value="general" /><el-option label="重要问题" value="important" /><el-option label="紧急问题" value="urgent" /></el-select></el-form-item>
              <el-form-item label="问题部位"><el-input v-model="inspectionForm.problem_location" placeholder="如：三级平台" /></el-form-item>
              <el-form-item label="整改负责人"><el-input v-model="inspectionForm.responsible_person" placeholder="填写负责人" /></el-form-item>
              <el-form-item label="整改期限"><el-date-picker v-model="inspectionForm.rectification_deadline" type="date" value-format="YYYY-MM-DD" placeholder="选择期限" /></el-form-item>
            </div>
            <el-form-item label="问题描述" required><el-input v-model="inspectionForm.problems" type="textarea" :rows="3" placeholder="描述问题形态、范围和发展情况" /></el-form-item>
            <div class="form-grid two-columns"><el-form-item label="建议措施"><el-input v-model="inspectionForm.suggestions" type="textarea" :rows="2" /></el-form-item><el-form-item label="现场处理结果"><el-input v-model="inspectionForm.result" type="textarea" :rows="2" /></el-form-item></div>
          </div>
        </section>

        <section class="form-section"><div class="form-section-title"><strong>位置与环境</strong><small>坐标由现场人员主动获取；天气与雨量在保存时自动关联</small></div>
          <div class="form-grid location-grid"><el-form-item label="现场位置描述"><el-input v-model="inspectionForm.location_description" placeholder="如：坡脚右侧排水沟" /></el-form-item><el-form-item label="经度"><el-input-number v-model="inspectionForm.longitude" :precision="8" :controls="false" placeholder="经度" /></el-form-item><el-form-item label="纬度"><el-input-number v-model="inspectionForm.latitude" :precision="8" :controls="false" placeholder="纬度" /></el-form-item><el-form-item label="定位"><el-button :loading="locating" @click="getCurrentLocation">获取当前位置</el-button></el-form-item></div>
          <el-alert title="保存后将按标段和巡查日期关联系统内已有的天气、日雨量数据。" type="info" :closable="false" show-icon />
          <el-form-item label="巡查补充说明"><el-input v-model="inspectionForm.content" type="textarea" :rows="2" placeholder="记录施工扰动、异常水情等补充情况" /></el-form-item>
        </section>

        <section class="form-section photo-section"><div class="form-section-title"><strong>现场影像</strong><small>按全景、坡面、排水、防护、异常、监测点分类归档，便于后续报告直接取图</small></div>
          <div class="photo-toolbar"><el-switch v-model="inspectionForm.apply_watermark" active-text="保存时添加时间、边坡与坐标水印" /><el-select v-model="defaultPhotoCategory" class="category-select" placeholder="默认照片类型"><el-option v-for="item in photoCategories" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-tag type="info" effect="plain">单张 ≤ 5MB</el-tag></div>
          <el-upload v-model:file-list="inspectionForm.images" action="#" list-type="picture-card" :auto-upload="false" :on-change="handleImageChange" multiple accept="image/jpeg,image/png,image/webp"><el-icon><Plus /></el-icon></el-upload>
          <div v-if="inspectionForm.images.length" class="photo-category-list">
            <div v-for="item in inspectionForm.images" :key="item.uid || item.name" class="photo-category-row">
              <span>{{ item.name }}</span>
              <el-select v-model="item.category" size="small" placeholder="照片类型">
                <el-option v-for="option in photoCategories" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </div>
          </div>
          <div v-if="inspectionForm.image_assist.length" class="assist-list"><span v-for="(item,index) in inspectionForm.image_assist" :key="index" :class="item.level">{{ item.name }}：{{ item.message }}</span></div>
        </section>
      </el-form>
      <template #footer><el-button @click="saveLocalDraft">保存本地草稿</el-button><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveInspection">保存巡查记录</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="巡查记录详情" size="720px">
      <div v-if="detailRecord" class="detail-sheet" v-loading="detailLoading">
        <div class="detail-identity"><div><span>{{ detailRecord.section||'未填写标段' }}</span><h2>{{ detailRecord.slope_name }}</h2><p>{{ formatDate(detailRecord.inspection_date) }}</p></div><el-tag :type="conclusionType(detailRecord)" effect="plain" size="large">{{ conclusionText(detailRecord) }}</el-tag></div>
        <el-descriptions :column="2" border><el-descriptions-item label="巡查人员">{{ detailRecord.inspector }}</el-descriptions-item><el-descriptions-item label="巡查场景">{{ detailRecord.inspection_type }}</el-descriptions-item><el-descriptions-item label="现场位置">{{ detailRecord.location_description||detailRecord.problem_location||'—' }}</el-descriptions-item><el-descriptions-item label="当日雨量">{{ detailRecord.rainfall_mm==null?'未关联':`${detailRecord.rainfall_mm} mm` }}</el-descriptions-item></el-descriptions>
        <section class="detail-section"><h3>标准巡查项目</h3><div v-for="item in normalizedChecklist(detailRecord.checklist)" :key="item.key" class="detail-check-item"><strong>{{ item.label }}</strong><el-tag :type="checkStatusType(item.status)" size="small" effect="plain">{{ checkStatusText(item.status) }}</el-tag><span>{{ item.note||'—' }}</span></div></section>
        <section v-if="Number(detailRecord.has_problem)" class="detail-section problem-detail"><div class="section-heading"><h3>问题整改</h3><el-button type="primary" link @click="openRectification(detailRecord)">更新整改状态</el-button></div><dl><div><dt>问题等级</dt><dd>{{ problemLevelText(detailRecord.problem_level) }}</dd></div><div><dt>问题描述</dt><dd>{{ detailRecord.problems||'—' }}</dd></div><div><dt>整改状态</dt><dd>{{ rectificationText(detailRecord.rectification_status) }}</dd></div><div><dt>负责人/期限</dt><dd>{{ detailRecord.responsible_person||'未指定' }} / {{ dateOnly(detailRecord.rectification_deadline) }}</dd></div><div><dt>整改结果</dt><dd>{{ detailRecord.rectification_result||'—' }}</dd></div></dl><el-timeline v-if="rectificationEvents.length" class="event-line"><el-timeline-item v-for="event in rectificationEvents" :key="event.id" :timestamp="formatDate(event.created_at)" placement="top"><strong>{{ rectificationText(event.to_status) }}</strong><p>{{ event.action_note||'状态已更新' }} · {{ event.operator_name }}</p></el-timeline-item></el-timeline></section>
        <section class="detail-section"><h3>现场影像</h3><div v-if="detailImages.length" class="detail-photo-groups"><div v-for="group in detailPhotoGroups" :key="group.category" class="detail-photo-group"><strong>{{ photoCategoryText(group.category) }}</strong><div class="detail-gallery"><el-image v-for="image in group.images" :key="image.url" :src="image.url" :preview-src-list="detailImages" fit="cover" /></div></div></div><el-empty v-else description="本次巡查未上传照片" :image-size="70" /></section>
      </div>
    </el-drawer>

    <el-dialog v-model="rectificationVisible" title="更新整改闭环" width="620px">
      <el-form :model="rectificationForm" label-position="top"><div class="form-grid two-columns"><el-form-item label="整改状态" required><el-select v-model="rectificationForm.status"><el-option v-for="item in rectificationOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="整改负责人"><el-input v-model="rectificationForm.responsible_person" /></el-form-item><el-form-item label="整改期限"><el-date-picker v-model="rectificationForm.rectification_deadline" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="复核人" :required="rectificationForm.status==='closed'"><el-input v-model="rectificationForm.reviewer" /></el-form-item></div><el-form-item label="整改结果"><el-input v-model="rectificationForm.rectification_result" type="textarea" :rows="3" /></el-form-item><el-form-item label="复核意见"><el-input v-model="rectificationForm.review_comment" type="textarea" :rows="2" /></el-form-item><el-form-item label="本次流转说明"><el-input v-model="rectificationForm.action_note" placeholder="说明本次采取的措施或复核结论" /></el-form-item><el-upload v-model:file-list="rectificationForm.images" action="#" list-type="picture-card" :auto-upload="false" multiple accept="image/jpeg,image/png,image/webp"><el-icon><Plus /></el-icon></el-upload></el-form>
      <template #footer><el-button @click="rectificationVisible=false">取消</el-button><el-button type="primary" :loading="rectificationSaving" @click="saveRectification">保存状态</el-button></template>
    </el-dialog>

    <el-dialog v-model="plansVisible" title="巡查计划" width="900px">
      <div class="dialog-tools"><el-select v-model="planSection" clearable placeholder="全部标段" @change="getPlans"><el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" /></el-select><el-button type="primary" @click="openPlanEditor()">新增计划</el-button></div>
      <el-table :data="plans" v-loading="plansLoading"><el-table-column prop="section" label="标段" width="130" /><el-table-column prop="slope_name" label="边坡" min-width="180" /><el-table-column prop="responsible_person" label="负责人" width="100" /><el-table-column label="周期" width="90"><template #default="scope">{{ scope.row.interval_days }} 天</template></el-table-column><el-table-column label="下次巡查" width="130"><template #default="scope">{{ dateOnly(scope.row.next_due_date) }}</template></el-table-column><el-table-column label="状态" width="90"><template #default="scope"><el-tag :type="planStatusType(scope.row.plan_status)" effect="plain">{{ planStatusText(scope.row.plan_status) }}</el-tag></template></el-table-column><el-table-column label="操作" width="130"><template #default="scope"><el-button link type="primary" @click="openPlanEditor(scope.row)">编辑</el-button><el-button v-if="isAdmin" link type="danger" @click="deletePlan(scope.row)">删除</el-button></template></el-table-column></el-table>
    </el-dialog>

    <el-dialog v-model="planEditorVisible" :title="planForm.id?'编辑巡查计划':'新增巡查计划'" width="600px">
      <el-form :model="planForm" label-position="top"><div class="form-grid two-columns"><el-form-item label="标段" required><el-select v-model="planForm.section" @change="planForm.slope_id=''" placeholder="选择标段"><el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" /></el-select></el-form-item><el-form-item label="边坡" required><el-select v-model="planForm.slope_id" filterable placeholder="选择边坡"><el-option v-for="slope in planSlopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" /></el-select></el-form-item><el-form-item label="计划名称"><el-input v-model="planForm.plan_name" /></el-form-item><el-form-item label="负责人"><el-input v-model="planForm.responsible_person" /></el-form-item><el-form-item label="巡查间隔（天）"><el-input-number v-model="planForm.interval_days" :min="1" /></el-form-item><el-form-item label="提前提醒（天）"><el-input-number v-model="planForm.advance_notice_days" :min="0" /></el-form-item><el-form-item label="下次巡查日期" required><el-date-picker v-model="planForm.next_due_date" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="启用"><el-switch v-model="planForm.enabled" /></el-form-item></div></el-form>
      <template #footer><el-button @click="planEditorVisible=false">取消</el-button><el-button type="primary" :loading="planSaving" @click="savePlan">保存计划</el-button></template>
    </el-dialog>

    <el-drawer v-model="analyticsVisible" title="巡查统计分析" size="760px"><div v-loading="analyticsLoading" class="analytics-sheet"><div class="metric-grid"><div><span>巡查总数</span><strong>{{ analytics.summary.total }}</strong></div><div><span>发现问题</span><strong>{{ analytics.summary.problem_count }}</strong></div><div><span>未闭环</span><strong>{{ analytics.summary.open_count }}</strong></div><div><span>超期整改</span><strong>{{ analytics.summary.overdue_count }}</strong></div><div><span>平均闭环时间</span><strong>{{ analytics.summary.avg_rectification_days??'—' }}</strong><small>天</small></div></div><h3>问题等级分布</h3><div class="level-bars"><div v-for="item in analytics.levels" :key="item.label"><span>{{ problemLevelText(item.label) }}</span><div><i :style="{width:levelPercent(item.value)}" /></div><strong>{{ item.value }}</strong></div></div><h3>问题高频边坡</h3><el-table :data="analytics.slopes"><el-table-column prop="section" label="标段" /><el-table-column prop="slope_name" label="边坡" /><el-table-column prop="problem_count" label="问题数" width="80" /><el-table-column prop="open_count" label="未闭环" width="80" /></el-table><p class="analysis-note">统计结果用于管理研判，问题性质和处置结论仍需专业人员复核。</p></div></el-drawer>

    <el-dialog v-model="reportVisible" title="生成巡查报告草稿" width="560px"><el-form :model="reportForm" label-position="top"><el-form-item label="标段"><el-select v-model="reportForm.section" clearable placeholder="全部标段"><el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" /></el-select></el-form-item><el-form-item label="统计周期" required><el-date-picker v-model="reportForm.date_range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" /></el-form-item><el-form-item label="报告类型"><el-radio-group v-model="reportForm.report_type"><el-radio-button label="weekly">周报</el-radio-button><el-radio-button label="monthly">月报</el-radio-button></el-radio-group></el-form-item><el-alert title="系统会汇总巡查次数、问题清单、整改状态和高频问题边坡，生成可继续编辑的报告草稿。" type="info" :closable="false" /></el-form><template #footer><el-button @click="reportVisible=false">取消</el-button><el-button type="primary" :loading="reportSaving" @click="generateReport">生成草稿</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import axios from 'axios'
import { useRoute } from 'vue-router'
import { API_DATA } from '../config/api'

const checklistDefinitions=[{key:'slope_top',label:'坡顶裂缝与变形'},{key:'slope_surface',label:'坡面开裂、鼓胀与掉块'},{key:'slope_toe',label:'坡脚隆起、冲刷与堆积'},{key:'drainage',label:'截排水设施运行情况'},{key:'support',label:'挡墙、锚杆及防护结构'},{key:'seepage',label:'渗水、积水与冲沟情况'},{key:'construction',label:'施工扰动、堆载与开挖'},{key:'monitoring_assets',label:'监测点及保护设施状态'}]
const inspectionTypes=['日常巡查','雨后巡查','强降雨专项巡查','施工影响巡查','异常复核','应急巡查']
const rectificationOptions=[{label:'待整改',value:'pending'},{label:'整改中',value:'processing'},{label:'待复核',value:'pending_review'},{label:'已闭环',value:'closed'}]
const photoCategories=[{label:'边坡全景',value:'overview'},{label:'坡面局部',value:'slope_surface'},{label:'截排水设施',value:'drainage'},{label:'防护工程',value:'support'},{label:'异常照片',value:'problem'},{label:'监测点位',value:'monitoring_point'},{label:'其他',value:'other'}]
const layerOptions=[{label:'周巡查任务',value:'weekly',note:'现场执行'},{label:'边坡巡查台账',value:'ledger',note:'历史查询'},{label:'月/年统计汇总',value:'summary',note:'报告基础'},{label:'问题整改闭环',value:'issues',note:'异常跟踪'}]
const route=useRoute(), inspections=ref([]), slopes=ref([]), plans=ref([]), rectificationEvents=ref([]), weeklyTasks=ref([]), periodRows=ref([])
const loading=ref(false), saving=ref(false), dashboardLoading=ref(false), weeklyLoading=ref(false), summaryLoading=ref(false), dialogVisible=ref(false), detailVisible=ref(false), detailLoading=ref(false), locating=ref(false)
const plansVisible=ref(false), planEditorVisible=ref(false), plansLoading=ref(false), planSaving=ref(false), analyticsVisible=ref(false), analyticsLoading=ref(false), reportVisible=ref(false), reportSaving=ref(false), rectificationVisible=ref(false), rectificationSaving=ref(false)
const activeLayer=ref('weekly'), dialogType=ref('add'), currentInspectionId=ref(null), formSection=ref(''), detailRecord=ref(null), planSection=ref(''), weeklyExpanded=ref(false), defaultPhotoCategory=ref('overview')
const currentUser=computed(()=>{try{return JSON.parse(localStorage.getItem('user')||'{}')}catch{return {}}}), isAdmin=computed(()=>currentUser.value?.role==='admin')
const token=()=>localStorage.getItem('token')||'', authConfig=()=>({headers:{Authorization:`Bearer ${token()}`}})
const sectionOptions=computed(()=>[...new Set(slopes.value.map(i=>i.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN')))
const filteredSearchSlopes=computed(()=>slopes.value.filter(i=>i.section===searchForm.section)), filteredFormSlopes=computed(()=>slopes.value.filter(i=>i.section===formSection.value)), planSlopes=computed(()=>slopes.value.filter(i=>i.section===planForm.section))
const dashboard=reactive({due_plans:0,overdue_plans:0,month_inspections:0,open_rectifications:0,overdue_rectifications:0,week_required_slopes:0,week_completed_slopes:0,week_pending_slopes:0,week_problem_records:0,week_start:'',week_end:''})
const weeklySummary=reactive({total:0,completed:0,pending:0,overdue:0,problem:0})
const searchForm=reactive({section:'',slope_id:'',date_range:[],only_problems:false,rectification_status:''}), pagination=reactive({page:1,limit:10,total:0})
const closedCount=computed(()=>inspections.value.filter(i=>i.rectification_status==='closed').length)
const createChecklist=()=>checklistDefinitions.map(i=>({...i,status:'normal',note:''}))
const inspectionForm=reactive({slope_id:'',inspection_date:new Date(),inspector:'',inspection_type:'日常巡查',content:'',has_problem:false,problem_level:'',problem_location:'',problems:'',suggestions:'',result:'',responsible_person:'',rectification_deadline:'',longitude:null,latitude:null,location_description:'',checklist:createChecklist(),images:[],apply_watermark:true,image_assist:[]})
const rectificationForm=reactive({id:null,status:'pending',responsible_person:'',rectification_deadline:'',rectification_result:'',reviewer:'',review_comment:'',action_note:'',images:[]})
const planForm=reactive({id:null,section:'',slope_id:'',plan_name:'',responsible_person:'',interval_days:7,advance_notice_days:2,next_due_date:'',enabled:true})
const analytics=reactive({summary:{total:0,problem_count:0,open_count:0,overdue_count:0,avg_rectification_days:null},levels:[],slopes:[],trend:[]})
const reportForm=reactive({section:'',date_range:[],report_type:'weekly'})
const summaryForm=reactive({period_type:'month',period:'',section:''})
const periodSummary=reactive({slope_count:0,expected_times:0,actual_times:0,completion_rate:0,problem_times:0,open_problem_times:0,photo_count:0})

function parseJson(v,fallback=[]){if(v==null||v==='')return fallback;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return fallback}}
function normalizedChecklist(value){const map=new Map((Array.isArray(parseJson(value,[]))?parseJson(value,[]):[]).map(i=>[i.key,i]));return checklistDefinitions.map(d=>({...d,status:'unchecked',note:'',...(map.get(d.key)||{})}))}
function parseImages(v){const p=parseJson(v,[]);return Array.isArray(p)?p:[]}
function resolveImageUrl(image){if(!image)return '';return /^(data:|blob:|https?:)/.test(image)?image:`${API_DATA}${image}`}
function photoMetadataList(value){const list=parseJson(value,[]);return Array.isArray(list)?list:[]}
function photoMetadataMap(value){const map=new Map();photoMetadataList(value).forEach(item=>{if(item?.path)map.set(item.path,item);if(item?.name)map.set(item.name,item)});return map}
function buildPhotoMetadata(){return inspectionForm.images.map((item,index)=>({name:item.name,path:item.storedPath||'',category:item.category||defaultPhotoCategory.value||'other',category_label:photoCategoryText(item.category||defaultPhotoCategory.value||'other'),sort:index+1}))}
function formatDateValue(v){const d=v instanceof Date?v:new Date(v);if(Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`}
function formatDate(v){const t=formatDateValue(v);return t?t.slice(0,16):'—'}
function dateOnly(v){if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,10);return formatDateValue(d).slice(0,10)}
function problemLevelText(v){return({general:'一般问题',important:'重要问题',urgent:'紧急问题',none:'未分级'})[v]||'未分级'}
function conclusionText(r){return !Number(r.has_problem)?'未见异常':problemLevelText(r.problem_level)}
function conclusionType(r){if(!Number(r.has_problem))return 'success';return r.problem_level==='general'?'warning':'danger'}
function problemSummary(r){return !Number(r.has_problem)?'本次巡查未发现明显异常':[r.problem_location,r.problems].filter(Boolean).join('：')||'发现问题'}
function rectificationText(v){return({not_required:'无需整改',pending:'待整改',processing:'整改中',pending_review:'待复核',closed:'已闭环'})[v]||'待整改'}
function rectificationType(v){return({pending:'danger',processing:'warning',pending_review:'primary',closed:'success'})[v]||'info'}
function checkStatusText(v){return({normal:'正常',problem:'有问题',unchecked:'未检查'})[v]||'未检查'}
function checkStatusType(v){return({normal:'success',problem:'danger',unchecked:'info'})[v]||'info'}
function planStatusText(v){return({normal:'正常',due:'临近',overdue:'逾期',disabled:'停用'})[v]||'正常'}
function planStatusType(v){return({normal:'success',due:'warning',overdue:'danger',disabled:'info'})[v]||'info'}
function taskStatusText(v){return({completed:'已巡查',overdue:'逾期未巡',due:'临近应巡',pending:'待巡查'})[v]||'待巡查'}
function taskStatusType(v){return({completed:'success',overdue:'danger',due:'warning',pending:'info'})[v]||'info'}
function photoCategoryText(v){return photoCategories.find(item=>item.value===v)?.label||'其他'}
function rowNumber(i){return(pagination.page-1)*pagination.limit+i+1}
function currentMonth(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}`}
function currentYear(){return String(new Date().getFullYear())}

function switchLayer(layer){
  activeLayer.value=layer
  if(layer==='issues'){
    searchForm.only_problems=true
    searchForm.rectification_status=searchForm.rectification_status||''
    pagination.page=1
    getInspections()
  }else if(layer==='ledger'){
    searchForm.only_problems=false
    pagination.page=1
    getInspections()
  }else if(layer==='summary'&&!summaryForm.period){
    summaryForm.period=currentMonth()
    getPeriodSummary()
  }
}

async function getSlopes(){try{const r=await axios.get(`${API_DATA}/api/slopes`,authConfig());if(r.data.success)slopes.value=r.data.data||[]}catch(e){ElMessage.error(e.response?.data?.message||'获取边坡列表失败')}}
async function getDashboard(){dashboardLoading.value=true;try{const r=await axios.get(`${API_DATA}/api/inspections/dashboard`,{...authConfig(),params:{section:searchForm.section}});Object.assign(dashboard,r.data.data||{})}catch(e){console.warn(e)}finally{dashboardLoading.value=false}}
async function getWeeklyTasks(){weeklyLoading.value=true;try{const r=await axios.get(`${API_DATA}/api/inspections/weekly-tasks`,{...authConfig(),params:{section:searchForm.section}});weeklyTasks.value=r.data.data||[];Object.assign(weeklySummary,r.data.summary||{})}catch(e){ElMessage.error(e.response?.data?.message||'获取本周巡查任务失败')}finally{weeklyLoading.value=false}}
async function getInspections(){loading.value=true;try{const params={section:searchForm.section,slope_id:searchForm.slope_id,only_problems:searchForm.only_problems?1:'',rectification_status:searchForm.rectification_status,page:pagination.page,limit:pagination.limit};if(searchForm.date_range?.length===2)[params.start_date,params.end_date]=searchForm.date_range;const r=await axios.get(`${API_DATA}/api/inspections`,{...authConfig(),params});inspections.value=r.data.data||[];pagination.total=Number(r.data.total||0)}catch(e){ElMessage.error(e.response?.data?.message||'获取巡查记录失败')}finally{loading.value=false}}
async function getPeriodSummary(){if(!summaryForm.period)summaryForm.period=summaryForm.period_type==='year'?currentYear():currentMonth();summaryLoading.value=true;try{const r=await axios.get(`${API_DATA}/api/inspections/period-summary`,{...authConfig(),params:{period_type:summaryForm.period_type,period:summaryForm.period,section:summaryForm.section}});periodRows.value=r.data.data||[];Object.assign(periodSummary,r.data.summary||{})}catch(e){ElMessage.error(e.response?.data?.message||'获取巡查周期汇总失败')}finally{summaryLoading.value=false}}
async function refresh(){await Promise.all([getInspections(),getDashboard(),getWeeklyTasks()])}
function handleSearchSectionChange(){searchForm.slope_id=''}
function search(){pagination.page=1;refresh()}
function resetSearch(){Object.assign(searchForm,{section:'',slope_id:'',date_range:[],only_problems:false,rectification_status:''});pagination.page=1;refresh()}
function filterOpenRectifications(){activeLayer.value='issues';searchForm.only_problems=true;searchForm.rectification_status='';search()}
function handleSummaryTypeChange(){summaryForm.period=summaryForm.period_type==='year'?currentYear():currentMonth();getPeriodSummary()}
function openSlopeLedger(row){
  activeLayer.value='ledger'
  searchForm.section=row.section||''
  searchForm.slope_id=row.slope_id
  searchForm.only_problems=false
  searchForm.rectification_status=''
  searchForm.date_range=[row.period_start, row.period_end ? dateOnly(new Date(new Date(row.period_end).getTime()-24*60*60*1000)) : row.period_start]
  pagination.page=1
  getInspections()
}
function handleSizeChange(v){pagination.limit=v;pagination.page=1;getInspections()}
function handleCurrentChange(v){pagination.page=v;getInspections()}

function resetForm(){defaultPhotoCategory.value='overview';Object.assign(inspectionForm,{slope_id:'',inspection_date:new Date(),inspector:currentUser.value?.real_name||currentUser.value?.username||'',inspection_type:'日常巡查',content:'',has_problem:false,problem_level:'',problem_location:'',problems:'',suggestions:'',result:'',responsible_person:'',rectification_deadline:'',longitude:null,latitude:null,location_description:'',checklist:createChecklist(),images:[],apply_watermark:true,image_assist:[]});formSection.value=searchForm.section||''}
async function openAddDialog(){dialogType.value='add';currentInspectionId.value=null;resetForm();const draft=localStorage.getItem('inspectionDraft');if(draft){try{await ElMessageBox.confirm('检测到未提交的本地巡查草稿，是否恢复？','恢复草稿',{confirmButtonText:'恢复',cancelButtonText:'忽略'});const d=JSON.parse(draft);Object.assign(inspectionForm,d,{inspection_date:new Date(d.inspection_date),images:[],checklist:normalizedChecklist(d.checklist)});formSection.value=d.section||formSection.value}catch{}}dialogVisible.value=true}
function openAddFromTask(task){dialogType.value='add';currentInspectionId.value=null;resetForm();formSection.value=task.section||'';inspectionForm.slope_id=task.slope_id;inspectionForm.inspector=task.responsible_person||inspectionForm.inspector;inspectionForm.content=`本周对${task.slope_name}进行现场巡查。`;dialogVisible.value=true}
function handleFormSectionChange(){inspectionForm.slope_id=''}
function handleChecklistChange(){if(inspectionForm.checklist.some(i=>i.status==='problem'))inspectionForm.has_problem=true}
function openEditDialog(r){dialogType.value='edit';currentInspectionId.value=r.id;formSection.value=r.section||'';const meta=photoMetadataMap(r.photo_metadata),metaList=photoMetadataList(r.photo_metadata);Object.assign(inspectionForm,{slope_id:r.slope_id,inspection_date:new Date(r.inspection_date),inspector:r.inspector||'',inspection_type:r.inspection_type||'日常巡查',content:r.content||'',has_problem:Boolean(Number(r.has_problem)),problem_level:r.problem_level||'',problem_location:r.problem_location||'',problems:r.problems||'',suggestions:r.suggestions||'',result:r.result||'',responsible_person:r.responsible_person||'',rectification_deadline:dateOnly(r.rectification_deadline)==='—'?'':dateOnly(r.rectification_deadline),longitude:r.longitude==null?null:Number(r.longitude),latitude:r.latitude==null?null:Number(r.latitude),location_description:r.location_description||'',checklist:normalizedChecklist(r.checklist),images:parseImages(r.images).map((p,i)=>({name:meta.get(p)?.name||metaList[i]?.name||`现场照片${i+1}`,url:resolveImageUrl(p),storedPath:p,status:'success',category:meta.get(p)?.category||metaList[i]?.category||'other'})),apply_watermark:true,image_assist:parseJson(r.image_assist,[])});dialogVisible.value=true}
function saveLocalDraft(){const d={...inspectionForm,section:formSection.value,inspection_date:formatDateValue(inspectionForm.inspection_date),images:[]};localStorage.setItem('inspectionDraft',JSON.stringify(d));ElMessage.success('巡查草稿已保存在当前设备')}
function getCurrentLocation(){if(!navigator.geolocation)return ElMessage.warning('当前浏览器不支持定位');locating.value=true;navigator.geolocation.getCurrentPosition(p=>{inspectionForm.longitude=Number(p.coords.longitude.toFixed(8));inspectionForm.latitude=Number(p.coords.latitude.toFixed(8));locating.value=false;ElMessage.success('已获取当前位置')},()=>{locating.value=false;ElMessage.error('无法获取位置，请检查浏览器定位权限')},{enableHighAccuracy:true,timeout:10000})}
async function inspectImage(file){return new Promise(resolve=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const short=Math.min(img.width,img.height),message=short<1080?`分辨率 ${img.width}×${img.height}，建议补拍高清图`:`分辨率 ${img.width}×${img.height}，可用于归档`;URL.revokeObjectURL(url);resolve({name:file.name,width:img.width,height:img.height,level:short<1080?'warning':'good',message,captured_at:new Date().toISOString()})};img.onerror=()=>{URL.revokeObjectURL(url);resolve({name:file.name,level:'warning',message:'无法读取影像信息'})};img.src=url})}
async function handleImageChange(file,fileList){if(!file.category)file.category=defaultPhotoCategory.value;if(file.raw?.size>5*1024*1024){fileList.splice(fileList.indexOf(file),1);return ElMessage.error('单张照片不能超过 5MB')}if(file.raw){const result=await inspectImage(file.raw);inspectionForm.image_assist.push({...result,category:file.category,category_label:photoCategoryText(file.category)})}}
async function watermarkFile(file,text){return new Promise(resolve=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const size=Math.max(18,Math.round(img.width/55));ctx.font=`${size}px sans-serif`;const pad=size*.7,w=ctx.measureText(text).width+pad*2,h=size*2;ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(0,canvas.height-h,w,h);ctx.fillStyle='#fff';ctx.fillText(text,pad,canvas.height-size*.55);canvas.toBlob(blob=>{URL.revokeObjectURL(url);resolve(blob?new File([blob],file.name,{type:'image/jpeg'}):file)},'image/jpeg',.9)};img.onerror=()=>{URL.revokeObjectURL(url);resolve(file)};img.src=url})}
async function saveInspection(){if(inspectionForm.checklist.some(i=>i.status==='problem'))inspectionForm.has_problem=true;if(!formSection.value)return ElMessage.warning('请选择所属标段');if(!inspectionForm.slope_id)return ElMessage.warning('请选择边坡');if(!inspectionForm.inspector.trim())return ElMessage.warning('请填写巡查人员');if(!inspectionForm.images.length)return ElMessage.warning('请至少上传一张边坡巡查照片');if(inspectionForm.has_problem&&!inspectionForm.problem_level)return ElMessage.warning('请选择问题等级');if(inspectionForm.has_problem&&!inspectionForm.problems.trim())return ElMessage.warning('请填写问题描述');const fd=new FormData();['slope_id','inspector','inspection_type','content','problem_level','problem_location','problems','suggestions','result','responsible_person','rectification_deadline','longitude','latitude','location_description'].forEach(k=>fd.append(k,inspectionForm[k]??''));fd.append('inspection_date',formatDateValue(inspectionForm.inspection_date));fd.append('has_problem',inspectionForm.has_problem?'1':'0');fd.append('checklist',JSON.stringify(inspectionForm.checklist));fd.append('existing_images',JSON.stringify(inspectionForm.images.filter(i=>i.storedPath).map(i=>i.storedPath)));fd.append('photo_metadata',JSON.stringify(buildPhotoMetadata()));fd.append('image_assist',JSON.stringify(inspectionForm.image_assist));const slope=slopes.value.find(i=>Number(i.id)===Number(inspectionForm.slope_id));for(const item of inspectionForm.images.filter(i=>i.raw)){let file=item.raw;if(inspectionForm.apply_watermark){const text=`${formatDateValue(inspectionForm.inspection_date)} | ${slope?.slope_name||''} | ${photoCategoryText(item.category)} | ${inspectionForm.longitude??'未定位'},${inspectionForm.latitude??'未定位'}`;file=await watermarkFile(file,text)}fd.append('images',file,item.name)}saving.value=true;try{const r=dialogType.value==='add'?await axios.post(`${API_DATA}/api/inspections`,fd,authConfig()):await axios.put(`${API_DATA}/api/inspections/${currentInspectionId.value}`,fd,authConfig());ElMessage.success(r.data.message||'巡查记录已保存');localStorage.removeItem('inspectionDraft');dialogVisible.value=false;await refresh()}catch(e){saveLocalDraft();ElMessage.error(e.response?.data?.message||'保存失败，已保留本地草稿')}finally{saving.value=false}}
async function voidInspection(r){try{const {value}=await ElMessageBox.prompt(`作废“${r.slope_name}”在 ${formatDate(r.inspection_date)} 的巡查记录。作废后默认不再参与周/月/年统计。`,'作废巡查记录',{confirmButtonText:'确认作废',cancelButtonText:'取消',inputPlaceholder:'请填写作废原因',inputPattern:/\S+/,inputErrorMessage:'请填写作废原因',type:'warning'});await axios.put(`${API_DATA}/api/inspections/${r.id}/void`,{reason:value},authConfig());ElMessage.success('巡查记录已作废');await refresh();if(activeLayer.value==='summary')await getPeriodSummary()}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.response?.data?.message||'作废失败')}}
async function deleteInspection(r){try{await ElMessageBox.confirm(`确认删除“${r.slope_name}”的这条巡查记录及影像？`,'删除巡查记录',{type:'warning'});await axios.delete(`${API_DATA}/api/inspections/${r.id}`,authConfig());ElMessage.success('巡查记录已删除');await refresh()}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.response?.data?.message||'删除失败')}}

const detailImages=computed(()=>parseImages(detailRecord.value?.images).map(resolveImageUrl))
const detailPhotoGroups=computed(()=>{const images=parseImages(detailRecord.value?.images),meta=photoMetadataMap(detailRecord.value?.photo_metadata),metaList=photoMetadataList(detailRecord.value?.photo_metadata),groups=new Map();images.forEach((path,index)=>{const item=meta.get(path)||metaList[index]||{},category=item.category||'other';if(!groups.has(category))groups.set(category,[]);groups.get(category).push({url:resolveImageUrl(path),path})});return [...groups.entries()].map(([category,images])=>({category,images}))})
async function openDetail(r){detailVisible.value=true;detailLoading.value=true;try{const [record,events]=await Promise.all([axios.get(`${API_DATA}/api/inspections/${r.id}`,authConfig()),axios.get(`${API_DATA}/api/inspections/${r.id}/rectification-events`,authConfig())]);detailRecord.value=record.data.data;rectificationEvents.value=events.data.data||[]}catch(e){ElMessage.error(e.response?.data?.message||'获取详情失败')}finally{detailLoading.value=false}}
function openRectification(r){Object.assign(rectificationForm,{id:r.id,status:r.rectification_status==='not_required'?'pending':r.rectification_status||'pending',responsible_person:r.responsible_person||'',rectification_deadline:dateOnly(r.rectification_deadline)==='—'?'':dateOnly(r.rectification_deadline),rectification_result:r.rectification_result||'',reviewer:r.reviewer||'',review_comment:r.review_comment||'',action_note:'',images:parseImages(r.rectification_images).map((p,i)=>({name:`整改照片${i+1}`,url:resolveImageUrl(p),storedPath:p,status:'success'}))});rectificationVisible.value=true}
async function saveRectification(){if(rectificationForm.status==='closed'&&!rectificationForm.reviewer.trim())return ElMessage.warning('关闭问题前请填写复核人');const fd=new FormData();['status','responsible_person','rectification_deadline','rectification_result','reviewer','review_comment','action_note'].forEach(k=>fd.append(k,rectificationForm[k]||''));fd.append('existing_images',JSON.stringify(rectificationForm.images.filter(i=>i.storedPath).map(i=>i.storedPath)));rectificationForm.images.filter(i=>i.raw).forEach(i=>fd.append('images',i.raw,i.name));rectificationSaving.value=true;try{await axios.put(`${API_DATA}/api/inspections/${rectificationForm.id}/rectification`,fd,authConfig());ElMessage.success('整改状态已更新');rectificationVisible.value=false;await refresh();if(detailVisible.value)await openDetail({id:rectificationForm.id})}catch(e){ElMessage.error(e.response?.data?.message||'更新整改状态失败')}finally{rectificationSaving.value=false}}

async function openPlans(){plansVisible.value=true;planSection.value=searchForm.section;await getPlans()}
async function getPlans(){plansLoading.value=true;try{const r=await axios.get(`${API_DATA}/api/inspections/plans`,{...authConfig(),params:{section:planSection.value}});plans.value=r.data.data||[]}catch(e){ElMessage.error(e.response?.data?.message||'获取巡查计划失败')}finally{plansLoading.value=false}}
function openPlanEditor(r=null){Object.assign(planForm,r?{id:r.id,section:r.section,slope_id:r.slope_id,plan_name:r.plan_name||'',responsible_person:r.responsible_person||'',interval_days:Number(r.interval_days||7),advance_notice_days:Number(r.advance_notice_days||2),next_due_date:dateOnly(r.next_due_date),enabled:Boolean(Number(r.enabled))}:{id:null,section:planSection.value||searchForm.section||'',slope_id:'',plan_name:'',responsible_person:'',interval_days:7,advance_notice_days:2,next_due_date:'',enabled:true});planEditorVisible.value=true}
async function savePlan(){if(!planForm.slope_id||!planForm.next_due_date)return ElMessage.warning('请选择边坡和下次巡查日期');planSaving.value=true;try{const payload={...planForm};if(planForm.id)await axios.put(`${API_DATA}/api/inspections/plans/${planForm.id}`,payload,authConfig());else await axios.post(`${API_DATA}/api/inspections/plans`,payload,authConfig());ElMessage.success('巡查计划已保存');planEditorVisible.value=false;await Promise.all([getPlans(),getDashboard(),getWeeklyTasks()])}catch(e){ElMessage.error(e.response?.data?.message||'保存巡查计划失败')}finally{planSaving.value=false}}
async function deletePlan(r){try{await ElMessageBox.confirm(`确认删除“${r.plan_name}”？`,'删除巡查计划',{type:'warning'});await axios.delete(`${API_DATA}/api/inspections/plans/${r.id}`,authConfig());await getPlans()}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.response?.data?.message||'删除失败')}}
async function openAnalytics(){analyticsVisible.value=true;analyticsLoading.value=true;try{const params={section:searchForm.section};if(searchForm.date_range?.length===2)[params.start_date,params.end_date]=searchForm.date_range;const r=await axios.get(`${API_DATA}/api/inspections/analytics`,{...authConfig(),params});Object.assign(analytics,r.data.data||{})}catch(e){ElMessage.error(e.response?.data?.message||'获取统计分析失败')}finally{analyticsLoading.value=false}}
function levelPercent(v){const max=Math.max(1,...analytics.levels.map(i=>Number(i.value||0)));return `${Math.round(Number(v||0)/max*100)}%`}
function openReport(){reportForm.section=searchForm.section;reportForm.date_range=searchForm.date_range?.length===2?[...searchForm.date_range]:[];reportVisible.value=true}
async function generateReport(){if(reportForm.date_range.length!==2)return ElMessage.warning('请选择统计周期');reportSaving.value=true;try{const r=await axios.post(`${API_DATA}/api/inspections/report-draft`,{section:reportForm.section,start_date:reportForm.date_range[0],end_date:reportForm.date_range[1],report_type:reportForm.report_type},authConfig());ElMessage.success(`${r.data.message}：${r.data.data.title}`);reportVisible.value=false}catch(e){ElMessage.error(e.response?.data?.message||'生成报告草稿失败')}finally{reportSaving.value=false}}

onMounted(async()=>{await getSlopes();await refresh();if(route.query.inspection_id)await openDetail({id:route.query.inspection_id})})
</script>

<style scoped>
.inspection-page{--ink:#26343c;--muted:#718089;--line:#dce3e7;--blue:#245b7c;--paper:#fff;min-height:calc(100vh - 52px);padding:22px 28px 48px;background:#f3f6f7;color:var(--ink);font-family:inherit}.page-heading,.workflow-strip,.filter-rail,.register-panel{max-width:1580px;margin-right:auto;margin-left:auto}.page-heading{display:flex;align-items:end;justify-content:space-between;margin-bottom:14px}.eyebrow{color:var(--blue);font-size:12px;font-weight:700}.page-heading h1{margin:4px 0;font-size:27px;font-weight:650}.page-heading p,.register-heading p{margin:0;color:var(--muted);font-size:13px}.heading-actions{display:flex;flex-wrap:wrap;gap:8px}.workflow-strip{display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr 34px 1fr;align-items:stretch;margin-bottom:12px;border:1px solid #cfdbe1;background:#fff}.workflow-item{display:flex;min-height:82px;flex-direction:column;justify-content:center;padding:11px 18px;border:0;background:transparent;color:inherit;text-align:left}.workflow-item[type=button]{cursor:pointer}.workflow-item[type=button]:hover{background:#f2f7f9}.workflow-item span{color:#60727c;font-size:12px}.workflow-item strong{margin:2px 0;color:var(--blue);font-size:24px}.workflow-item small{color:#8b979d}.workflow-arrow{display:grid;place-items:center;color:#9babb3;font-size:18px}.workflow-end{border-right:4px solid var(--blue)}.filter-rail{display:grid;grid-template-columns:.8fr 1.1fr 1.25fr .75fr auto auto;gap:11px;align-items:end;padding:13px 15px;border:1px solid var(--line);background:#fff}.filter-field{display:flex;min-width:0;flex-direction:column;gap:6px}.filter-field>span,.problem-filter>span{color:#5e6d75;font-size:12px;font-weight:600}.date-filter :deep(.el-date-editor),.form-grid :deep(.el-select),.form-grid :deep(.el-date-editor),.form-grid :deep(.el-input-number){width:100%}.problem-filter{display:flex;min-width:90px;align-items:center;justify-content:space-between;gap:8px;height:32px}.filter-actions{display:flex;gap:7px}.register-panel{margin-top:12px;padding:0 18px 18px;border:1px solid var(--line);background:#fff}.register-heading{padding:14px 0 11px}.register-heading h2{margin:0 0 3px;font-size:18px;font-weight:650}.inspection-table{border-top:2px solid var(--blue)}.problem-summary{color:#9b3a32}.muted{color:#909da4}.pagination{display:flex;justify-content:flex-end;margin-top:16px}.inspection-form{max-height:74vh;padding-right:5px;overflow:auto}.form-section{padding:2px 2px 20px}.form-section+.form-section{padding-top:18px;border-top:1px solid var(--line)}.form-section-title{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}.form-section-title strong{font-size:16px}.form-section-title small{color:var(--muted);font-size:12px}.form-grid{display:grid;gap:0 14px}.four-columns{grid-template-columns:repeat(4,minmax(0,1fr))}.two-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.location-grid{grid-template-columns:1.6fr .8fr .8fr auto}.checklist-table{border-top:1px solid #afbbc2;border-bottom:1px solid #afbbc2}.checklist-head,.checklist-row{display:grid;grid-template-columns:minmax(180px,.9fr) minmax(245px,1.1fr) minmax(250px,1.4fr);gap:14px;align-items:center;padding:9px 12px}.checklist-head{background:#eef3f5;color:#586871;font-size:12px;font-weight:700}.checklist-row+.checklist-row{border-top:1px solid #e4e9ec}.checklist-row>strong{font-size:13px}.conclusion-switch{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 15px;background:#eef3f5}.conclusion-switch>div{display:flex;flex-direction:column}.conclusion-switch span{margin-top:3px;color:var(--muted);font-size:11px}.problem-fields{margin-top:14px;padding:14px 15px 2px;border-left:3px solid #b54b42;background:#fbf7f6}.photo-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.photo-section :deep(.el-upload--picture-card),.photo-section :deep(.el-upload-list__item){width:112px;height:112px}.assist-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px}.assist-list .warning{color:#b26718}.assist-list .good{color:#31704a}.detail-identity{display:flex;align-items:start;justify-content:space-between;margin-bottom:18px;padding-bottom:15px;border-bottom:2px solid var(--blue)}.detail-identity span{color:var(--blue);font-size:12px;font-weight:700}.detail-identity h2{margin:4px 0;font-size:22px}.detail-identity p{margin:0;color:var(--muted)}.detail-section{margin-top:22px}.detail-section h3{margin:0 0 9px;font-size:16px}.section-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.detail-check-item{display:grid;grid-template-columns:190px 74px 1fr;gap:10px;align-items:center;padding:8px 4px;border-bottom:1px solid #edf0f2;font-size:13px}.detail-check-item>span{color:#5d6b72}.problem-detail{padding:14px 16px;background:#fbf7f6}.problem-detail dl{margin:0}.problem-detail dl>div{display:grid;grid-template-columns:92px 1fr;gap:12px;padding:7px 0}.problem-detail dt{color:var(--muted)}.problem-detail dd{margin:0;white-space:pre-wrap}.event-line{margin-top:18px}.event-line p{margin:5px 0;color:var(--muted)}.detail-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.detail-gallery :deep(.el-image){width:100%;height:145px;border:1px solid var(--line)}.dialog-tools{display:flex;justify-content:space-between;margin-bottom:12px}.dialog-tools :deep(.el-select){width:220px}.metric-grid{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--line)}.metric-grid>div{padding:15px 12px;border-right:1px solid var(--line)}.metric-grid>div:last-child{border:0}.metric-grid span{display:block;color:var(--muted);font-size:12px}.metric-grid strong{font-size:25px;color:var(--blue)}.analytics-sheet h3{margin:26px 0 10px;font-size:16px}.level-bars>div{display:grid;grid-template-columns:90px 1fr 40px;gap:10px;align-items:center;margin:10px 0}.level-bars>div>div{height:8px;background:#e7edf0}.level-bars i{display:block;height:100%;background:var(--blue)}.analysis-note{margin-top:18px;color:var(--muted);font-size:12px}
.weekly-panel{max-width:1580px;margin:0 auto 12px;padding:0 18px 14px;border:1px solid var(--line);background:#fff}.weekly-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0 10px}.weekly-heading h2{margin:0 0 3px;font-size:18px;font-weight:650}.weekly-heading p{margin:0;color:var(--muted);font-size:13px}.weekly-summary{display:flex;flex-wrap:wrap;gap:8px}.weekly-summary span{padding:5px 10px;border:1px solid #d9e5ea;background:#f5f8fa;color:#40545f;font-size:12px}.plain-toggle{display:block;margin:12px auto 0;padding:5px 12px;border:1px solid var(--line);background:#fff;color:var(--blue);cursor:pointer}.category-select{width:160px}.photo-toolbar{gap:12px}.photo-category-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.photo-category-row{display:grid;grid-template-columns:1fr 150px;gap:10px;align-items:center;padding:8px 10px;background:#f6f8f9;border:1px solid #e1e8ec}.photo-category-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#55656d;font-size:12px}.detail-photo-group+.detail-photo-group{margin-top:14px}.detail-photo-group>strong{display:block;margin-bottom:7px;color:var(--blue);font-size:13px}
.layer-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:1580px;margin:0 auto 12px}.layer-tabs button{display:flex;min-height:64px;flex-direction:column;justify-content:center;gap:3px;padding:10px 14px;border:1px solid var(--line);background:#fff;color:var(--ink);text-align:left;cursor:pointer}.layer-tabs button.active{border-color:#2d7fb5;background:#eef7fc;box-shadow:inset 0 -3px 0 #2d7fb5}.layer-tabs strong{font-size:15px}.layer-tabs span{color:var(--muted);font-size:12px}.summary-panel{max-width:1580px;margin:0 auto 12px;padding:14px 18px 18px;border:1px solid var(--line);background:#fff}.summary-toolbar{display:grid;grid-template-columns:1.1fr .9fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.summary-toolbar label{display:flex;min-width:0;flex-direction:column;gap:6px}.summary-toolbar label>span{color:#5e6d75;font-size:12px;font-weight:600}.summary-toolbar :deep(.el-date-editor),.summary-toolbar :deep(.el-select){width:100%}.summary-metrics{display:grid;grid-template-columns:repeat(6,1fr);margin-bottom:14px;border:1px solid #dce3e7;background:#f7fafb}.summary-metrics>div{padding:12px 14px;border-right:1px solid #dce3e7}.summary-metrics>div:last-child{border-right:0}.summary-metrics span{display:block;color:var(--muted);font-size:12px}.summary-metrics strong{display:block;margin-top:3px;color:var(--blue);font-size:22px}
@media(max-width:1250px){.filter-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.four-columns{grid-template-columns:repeat(2,1fr)}.location-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.inspection-page{padding:14px}.page-heading{align-items:start;flex-direction:column;gap:12px}.workflow-strip,.layer-tabs,.summary-metrics{grid-template-columns:1fr 1fr}.workflow-arrow{display:none}.workflow-item{border-bottom:1px solid var(--line)}.filter-rail,.summary-toolbar,.four-columns,.two-columns,.location-grid,.photo-category-list{grid-template-columns:1fr}.checklist-head{display:none}.checklist-row{grid-template-columns:1fr}.conclusion-switch{align-items:stretch;flex-direction:column}.metric-grid{grid-template-columns:repeat(2,1fr)}.detail-gallery{grid-template-columns:repeat(2,1fr)}}
</style>
