<template>
  <div class="compliance-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">ENGINEERING STANDARD CONTROL</p>
        <h1>规范与合规</h1>
        <p>查清依据、留下证据、关闭问题。所有正式结论均由专业人员确认。</p>
      </div>
      <div class="heading-actions">
        <el-button @click="refreshCurrent"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button v-if="can('standards.manage')" type="primary" @click="uploadVisible = true">
          <el-icon><Upload /></el-icon>上传规范
        </el-button>
      </div>
    </header>

    <nav class="module-nav" aria-label="规范与合规功能">
      <button v-for="item in navItems" :key="item.key" :class="{ active: activeTab === item.key }" @click="switchTab(item.key)">
        <span>{{ item.label }}</span><small>{{ item.caption }}</small>
      </button>
    </nav>

    <section v-if="activeTab === 'dashboard'" v-loading="loading.dashboard" class="dashboard-section">
      <div class="metric-strip">
        <article><span>现行规范</span><strong>{{ dashboard.active_count || 0 }}</strong><small>已审核发布</small></article>
        <article><span>待审核规范</span><strong>{{ dashboard.pending_standard_count || 0 }}</strong><small>需要管理员确认</small></article>
        <article><span>进行中核查</span><strong>{{ dashboard.active_task_count || 0 }}</strong><small>未关闭任务</small></article>
        <article class="alert"><span>待整改问题</span><strong>{{ dashboard.open_rectification_count || 0 }}</strong><small>{{ dashboard.overdue_count || 0 }} 项已逾期</small></article>
      </div>
      <div class="dashboard-grid">
        <article class="panel category-panel">
          <div class="panel-title"><div><h2>规范覆盖</h2><p>按监测专业检查规范储备</p></div></div>
          <div v-if="dashboard.categories?.length" class="category-list">
            <button v-for="item in dashboard.categories" :key="item.category" @click="openCategory(item.category)">
              <span>{{ categoryText(item.category) }}</span><strong>{{ item.count }}</strong><i :style="{ width: `${Math.min(Number(item.count) * 12, 100)}%` }" />
            </button>
          </div>
          <el-empty v-else description="尚未发布规范，先上传第一份正式文件" :image-size="74" />
        </article>
        <article class="panel task-panel">
          <div class="panel-title"><div><h2>最近核查</h2><p>优先处理待审核与整改任务</p></div><el-button text type="primary" @click="switchTab('tasks')">查看全部</el-button></div>
          <div v-if="dashboard.recent_tasks?.length" class="recent-list">
            <button v-for="task in dashboard.recent_tasks" :key="task.id" @click="openTask(task)">
              <span class="task-code">{{ task.task_no }}</span>
              <strong>{{ task.title }}</strong>
              <small>{{ task.section || '未指定标段' }} · {{ categoryText(task.monitor_type) }}</small>
              <el-tag :type="taskStatusType(task.status)" effect="plain">{{ taskStatusText(task.status) }}</el-tag>
            </button>
          </div>
          <el-empty v-else description="暂无核查任务" :image-size="74" />
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'library'" class="workspace-section">
      <div class="filter-bar">
        <el-input v-model="libraryFilters.q" clearable placeholder="搜索规范名称、编号、发布单位或正文" @keyup.enter="loadLibrary">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="libraryFilters.category" clearable placeholder="监测类型"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select v-model="libraryFilters.status" clearable placeholder="规范状态"><el-option v-for="item in standardStatuses" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-button type="primary" @click="loadLibrary">查询</el-button>
        <el-button @click="resetLibrary">重置</el-button>
      </div>
      <div class="section-title"><div><h2>规范库</h2><p>正文搜索结果保留原始页码，历史核查固定引用当时版本。</p></div><span>共 {{ libraryTotal }} 份</span></div>
      <el-table v-loading="loading.library" :data="standards" row-key="id" class="data-table">
        <el-table-column label="规范依据" min-width="330">
          <template #default="{ row }"><div class="standard-cell"><span class="document-mark">PDF</span><div><strong>{{ row.name }}</strong><small>{{ row.code }} · {{ row.version_label }}</small></div></div></template>
        </el-table-column>
        <el-table-column label="监测类型" width="140"><template #default="{ row }">{{ categoryText(row.category) }}</template></el-table-column>
        <el-table-column prop="publisher" label="发布单位" min-width="180" show-overflow-tooltip />
        <el-table-column label="实施日期" width="120"><template #default="{ row }">{{ dateText(row.effective_date) }}</template></el-table-column>
        <el-table-column label="索引" width="100"><template #default="{ row }"><span :class="row.page_count ? 'indexed' : 'scan-only'">{{ row.page_count ? `${row.page_count} 页` : '待 OCR' }}</span></template></el-table-column>
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="standardStatusType(row.status)" effect="plain">{{ standardStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" fixed="right" width="250">
          <template #default="{ row }">
            <el-button link type="primary" @click="openReader(row)">阅读</el-button>
            <el-button v-if="row.status === 'draft' && can('standards.manage')" link @click="changeStandardStatus(row, 'pending_review')">提交审核</el-button>
            <el-button v-if="row.status === 'pending_review' && can('standards.review')" link type="success" @click="changeStandardStatus(row, 'published')">发布</el-button>
            <el-dropdown v-if="can('standards.manage')" trigger="click">
              <el-button link>更多</el-button>
              <template #dropdown><el-dropdown-menu>
                <el-dropdown-item v-if="row.status === 'published' && can('standards.review')" @click="changeStandardStatus(row, 'deprecated')">标记废止</el-dropdown-item>
                <el-dropdown-item v-if="row.status !== 'archived' && can('standards.review')" @click="changeStandardStatus(row, 'archived')">归档</el-dropdown-item>
                <el-dropdown-item v-if="row.status === 'draft'" divided @click="deleteStandard(row)">删除草稿</el-dropdown-item>
              </el-dropdown-menu></template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="libraryTotal > libraryFilters.limit" v-model:current-page="libraryFilters.page" :page-size="libraryFilters.limit" :total="libraryTotal" layout="prev, pager, next" @current-change="loadLibrary" />
    </section>

    <section v-else-if="activeTab === 'checklists'" class="workspace-section">
      <div class="section-title"><div><h2>核查清单</h2><p>把规范条文转成现场可执行的检查项，发布后用于创建核查任务。</p></div><el-button v-if="can('standards.manage')" type="primary" @click="openChecklistCreate">新建清单</el-button></div>
      <el-table v-loading="loading.checklists" :data="checklists" class="data-table">
        <el-table-column prop="name" label="清单名称" min-width="260" />
        <el-table-column label="监测类型" width="150"><template #default="{ row }">{{ categoryText(row.category) }}</template></el-table-column>
        <el-table-column prop="applicable_stage" label="适用阶段" width="150" />
        <el-table-column prop="item_count" label="检查项" width="100" />
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'published' ? 'success' : 'info'" effect="plain">{{ checklistStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="更新日期" width="130"><template #default="{ row }">{{ dateText(row.updated_at) }}</template></el-table-column>
        <el-table-column label="操作" width="210"><template #default="{ row }"><el-button link type="primary" @click="viewChecklist(row)">查看</el-button><el-button v-if="row.status === 'draft' && can('standards.review')" link type="success" @click="publishChecklist(row)">发布</el-button><el-button v-if="row.status === 'published'" link @click="createTaskFrom(row)">发起核查</el-button></template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="activeTab === 'tasks'" class="workspace-section">
      <div class="filter-bar task-filters">
        <el-select v-model="taskFilters.status" clearable placeholder="任务状态"><el-option v-for="item in taskStatuses" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select v-model="taskFilters.monitor_type" clearable placeholder="监测类型"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-input v-model="taskFilters.section" clearable placeholder="标段" />
        <el-button type="primary" @click="loadTasks">查询</el-button>
      </div>
      <div class="section-title"><div><h2>符合性核查</h2><p>每条结论都必须有明确条文依据，正式关闭前由复核人员确认。</p></div><el-button type="primary" @click="taskCreateVisible = true">新建核查</el-button></div>
      <el-table v-loading="loading.tasks" :data="tasks" class="data-table">
        <el-table-column label="任务" min-width="300"><template #default="{ row }"><div class="task-name"><small>{{ row.task_no }}</small><strong>{{ row.title }}</strong></div></template></el-table-column>
        <el-table-column prop="section" label="标段" width="130" />
        <el-table-column prop="slope_name" label="边坡" min-width="150" />
        <el-table-column label="监测类型" width="130"><template #default="{ row }">{{ categoryText(row.monitor_type) }}</template></el-table-column>
        <el-table-column label="进度" width="140"><template #default="{ row }"><span>{{ Number(row.item_count || 0) - Number(row.pending_item_count || 0) }}/{{ row.item_count || 0 }}</span><span v-if="row.non_compliant_count" class="issue-count">{{ row.non_compliant_count }} 项不符合</span></template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="taskStatusType(row.status)" effect="plain">{{ taskStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="190"><template #default="{ row }"><el-button link type="primary" @click="openTask(row)">核查详情</el-button><el-button link @click="exportTask(row, 'word')">导出 Word</el-button></template></el-table-column>
      </el-table>
    </section>

    <section v-else class="workspace-section">
      <div class="filter-bar compact"><el-select v-model="rectificationFilter" clearable placeholder="整改状态" @change="loadRectifications"><el-option v-for="item in rectificationStatuses" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
      <div class="section-title"><div><h2>整改台账</h2><p>按期限跟踪不符合项，整改材料提交后必须经过复核。</p></div></div>
      <el-table v-loading="loading.rectifications" :data="rectifications" class="data-table">
        <el-table-column label="问题与依据" min-width="360"><template #default="{ row }"><div class="finding-cell"><strong>{{ row.item_text }}</strong><small>{{ row.basis_text || '未填写条文摘要' }}<template v-if="row.page_no"> · 第 {{ row.page_no }} 页</template></small></div></template></el-table-column>
        <el-table-column label="核查任务" min-width="230"><template #default="{ row }">{{ row.task_no }}<br><small>{{ row.title }}</small></template></el-table-column>
        <el-table-column prop="responsible_person" label="责任人" width="110" />
        <el-table-column label="期限" width="120"><template #default="{ row }"><span :class="{ overdue: row.status === 'overdue' }">{{ dateText(row.due_date) }}</span></template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="rectificationStatusType(row.status)" effect="plain">{{ rectificationStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" @click="editRectification(row)">处理整改</el-button></template></el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="uploadVisible" title="上传正式规范" width="720px" destroy-on-close>
      <el-alert title="上传后先进入草稿。管理员审核发布后，才会作为现行核查依据。" type="info" :closable="false" show-icon />
      <el-form :model="uploadForm" label-width="100px" class="dialog-form">
        <div class="form-grid"><el-form-item label="规范名称" required><el-input v-model="uploadForm.name" /></el-form-item><el-form-item label="规范编号" required><el-input v-model="uploadForm.code" placeholder="如 JTG/T 3650—2020" /></el-form-item></div>
        <div class="form-grid"><el-form-item label="监测类型" required><el-select v-model="uploadForm.category"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="规范级别" required><el-select v-model="uploadForm.standard_level"><el-option label="国家标准" value="national" /><el-option label="行业标准" value="industry" /><el-option label="地方标准" value="local" /><el-option label="项目规定" value="project" /></el-select></el-form-item></div>
        <div class="form-grid"><el-form-item label="发布单位" required><el-input v-model="uploadForm.publisher" /></el-form-item><el-form-item label="版本标识" required><el-input v-model="uploadForm.version_label" placeholder="如 2020版" /></el-form-item></div>
        <div class="form-grid"><el-form-item label="发布日期"><el-date-picker v-model="uploadForm.publish_date" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="实施日期" required><el-date-picker v-model="uploadForm.effective_date" type="date" value-format="YYYY-MM-DD" /></el-form-item></div>
        <el-form-item label="适用范围" required><el-input v-model="uploadForm.applicable_scope" type="textarea" :rows="3" placeholder="说明适用的监测对象、工程阶段和限制条件" /></el-form-item>
        <el-form-item label="PDF 文件" required><input class="native-file" type="file" accept="application/pdf,.pdf" @change="selectStandardFile"><small class="field-note">不超过 100MB。文字版自动建立逐页索引；扫描版可查看，暂不可检索。</small></el-form-item>
        <el-progress v-if="uploadProgress > 0" :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : undefined" />
      </el-form>
      <template #footer><el-button @click="uploadVisible = false">取消</el-button><el-button type="primary" :loading="uploading" @click="submitStandard">保存草稿</el-button></template>
    </el-dialog>

    <el-dialog v-model="readerVisible" fullscreen destroy-on-close class="reader-dialog" :show-close="false">
      <template #header>
        <div class="reader-heading"><button class="back-button" @click="closeReader">← 返回规范库</button><div><strong>{{ readerData.standard?.name }}</strong><small>{{ readerData.standard?.code }} · {{ readerData.standard?.version_label }} · {{ standardStatusText(readerData.standard?.status) }}</small></div></div>
      </template>
      <div class="reader-layout">
        <aside class="reader-index">
          <h3>页码与检索</h3>
          <el-input v-model="readerSearch" clearable placeholder="搜索当前规范正文"><template #prefix><el-icon><Search /></el-icon></template></el-input>
          <p v-if="!readerData.standard?.page_count" class="scan-note">该文件可能是扫描版，第一阶段暂不支持全文检索。</p>
          <div class="page-results">
            <button v-for="result in readerPageResults" :key="result.page" :class="{ active: readerPage === result.page }" @click="readerPage = result.page">
              <b>第 {{ result.page }} 页</b><span>{{ result.excerpt }}</span>
            </button>
          </div>
        </aside>
        <StandardPdfReader v-if="readerData.standard" v-model="readerPage" :standard-id="readerData.standard.id" />
        <aside class="citation-rail">
          <el-tabs v-model="readerSideTab">
            <el-tab-pane label="条文" name="clauses"><div class="rail-actions"><span>第 {{ readerPage }} 页</span><el-button v-if="can('standards.manage')" link type="primary" @click="clauseEditorOpen = !clauseEditorOpen">整理条文</el-button></div>
              <div v-if="clauseEditorOpen" class="inline-editor"><el-input v-model="clauseForm.clause_no" placeholder="条文号" /><el-input v-model="clauseForm.title" placeholder="条文标题" /><el-input v-model="clauseForm.content" type="textarea" :rows="4" placeholder="条文内容或核查所需摘要" /><el-button type="primary" @click="saveClause">保存条文</el-button></div>
              <article v-for="clause in pageClauses" :key="clause.id" class="citation-card"><span>{{ clause.clause_no || `第 ${clause.page_no} 页` }}</span><strong>{{ clause.title || '规范条文' }}</strong><p>{{ clause.content }}</p><button @click="useClauseInChecklist(clause)">加入核查清单</button></article>
              <el-empty v-if="!pageClauses.length && !clauseEditorOpen" description="本页尚未整理条文" :image-size="62" />
            </el-tab-pane>
            <el-tab-pane label="批注" name="notes"><div class="inline-editor"><el-input v-model="annotationForm.note" type="textarea" :rows="3" placeholder="记录对本页内容的理解或使用提示" /><el-radio-group v-if="can('standards.review')" v-model="annotationForm.visibility"><el-radio-button value="private">个人批注</el-radio-button><el-radio-button value="project">项目解读</el-radio-button></el-radio-group><el-button type="primary" @click="saveAnnotation">保存批注</el-button></div><article v-for="note in pageAnnotations" :key="note.id" class="note-card"><span>{{ note.visibility === 'project' ? '项目解读' : '个人批注' }} · {{ note.author_name }}</span><p>{{ note.note }}</p></article></el-tab-pane>
            <el-tab-pane label="版本" name="versions"><article v-for="version in readerData.versions" :key="version.id" class="version-card"><strong>{{ version.version_label }}</strong><span>第 {{ version.version_no }} 版 · {{ version.page_count || '待 OCR' }} 页</span><small>{{ dateText(version.created_at) }} · {{ version.change_note || '首次入库' }}</small></article></el-tab-pane>
          </el-tabs>
        </aside>
      </div>
    </el-dialog>

    <el-dialog v-model="checklistCreateVisible" title="新建核查清单" width="850px" destroy-on-close>
      <el-form :model="checklistForm" label-width="90px"><div class="form-grid"><el-form-item label="清单名称" required><el-input v-model="checklistForm.name" /></el-form-item><el-form-item label="监测类型" required><el-select v-model="checklistForm.category"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div><el-form-item label="适用阶段"><el-input v-model="checklistForm.applicable_stage" placeholder="如测点布设、数据采集、成果报告" /></el-form-item><el-form-item label="说明"><el-input v-model="checklistForm.description" type="textarea" :rows="2" /></el-form-item></el-form>
      <div class="item-editor-head"><strong>检查项</strong><el-button @click="addChecklistItem">添加检查项</el-button></div>
      <div class="check-item-edit" v-for="(item, index) in checklistForm.items" :key="index"><span>{{ index + 1 }}</span><div><el-input v-model="item.item_text" placeholder="要检查的具体要求" /><div class="item-basis"><el-input v-model="item.basis_text" placeholder="规范依据摘要" /><el-input-number v-model="item.page_no" :min="1" placeholder="页码" /></div></div><el-button text type="danger" @click="checklistForm.items.splice(index, 1)">移除</el-button></div>
      <template #footer><el-button @click="checklistCreateVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveChecklist">保存草稿</el-button></template>
    </el-dialog>

    <el-dialog v-model="checklistViewVisible" title="核查清单详情" width="760px"><div v-if="selectedChecklist.template"><el-descriptions :column="2" border><el-descriptions-item label="名称">{{ selectedChecklist.template.name }}</el-descriptions-item><el-descriptions-item label="类型">{{ categoryText(selectedChecklist.template.category) }}</el-descriptions-item><el-descriptions-item label="适用阶段">{{ selectedChecklist.template.applicable_stage || '—' }}</el-descriptions-item><el-descriptions-item label="状态">{{ checklistStatusText(selectedChecklist.template.status) }}</el-descriptions-item></el-descriptions><div class="readonly-items"><article v-for="(item, index) in selectedChecklist.items" :key="item.id"><b>{{ index + 1 }}</b><div><strong>{{ item.item_text }}</strong><p>{{ item.basis_text || '未填写依据摘要' }}<span v-if="item.standard_code"> · {{ item.standard_code }}</span><span v-if="item.page_no"> · 第 {{ item.page_no }} 页</span></p></div></article></div></div></el-dialog>

    <el-dialog v-model="taskCreateVisible" title="新建符合性核查" width="700px"><el-form :model="taskForm" label-width="100px"><el-form-item label="任务名称" required><el-input v-model="taskForm.title" /></el-form-item><div class="form-grid"><el-form-item label="核查清单" required><el-select v-model="taskForm.checklist_template_id" @change="syncTaskCategory"><el-option v-for="item in publishedChecklists" :key="item.id" :label="`${item.name}（${item.item_count}项）`" :value="item.id" /></el-select></el-form-item><el-form-item label="监测类型" required><el-select v-model="taskForm.monitor_type"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div><div class="form-grid"><el-form-item label="项目"><el-select v-model="taskForm.project_id" clearable><el-option v-for="item in projects" :key="item.id" :label="item.project_name" :value="item.id" /></el-select></el-form-item><el-form-item label="标段"><el-input v-model="taskForm.section" /></el-form-item></div><div class="form-grid"><el-form-item label="边坡"><el-select v-model="taskForm.slope_id" clearable filterable><el-option v-for="item in filteredSlopes" :key="item.id" :label="item.slope_name" :value="item.id" /></el-select></el-form-item><el-form-item label="实施阶段"><el-input v-model="taskForm.implementation_stage" placeholder="如测点布设" /></el-form-item></div></el-form><template #footer><el-button @click="taskCreateVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTask">创建任务</el-button></template></el-dialog>

    <el-dialog v-model="taskDetailVisible" width="1000px" destroy-on-close class="task-dialog"><template #header><div class="task-dialog-head"><div><span>{{ taskDetail.task?.task_no }}</span><h2>{{ taskDetail.task?.title }}</h2></div><el-tag :type="taskStatusType(taskDetail.task?.status)" effect="plain">{{ taskStatusText(taskDetail.task?.status) }}</el-tag></div></template>
      <div v-if="taskDetail.task"><div class="task-context"><span>{{ taskDetail.task.project_name || '未指定项目' }}</span><span>{{ taskDetail.task.section || '未指定标段' }}</span><span>{{ taskDetail.task.slope_name || '未指定边坡' }}</span><span>{{ categoryText(taskDetail.task.monitor_type) }}</span></div>
        <article v-for="(item, index) in taskDetail.items" :key="item.id" class="review-item"><header><b>{{ index + 1 }}</b><div><strong>{{ item.item_text }}</strong><p>{{ item.basis_text || '未填写条文摘要' }}<span v-if="item.standard_code"> · {{ item.standard_code }} {{ item.version_label }}</span><button v-if="item.standard_id" @click="jumpToStandard(item)">查看第 {{ item.page_no || 1 }} 页</button></p></div><el-select v-model="item.result" :disabled="!taskEditable" placeholder="核查结论"><el-option v-for="option in resultOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></header><el-input v-model="item.finding" :disabled="!taskEditable" type="textarea" :rows="2" placeholder="记录事实、测量情况及判断理由" /><div class="evidence-row"><div><el-tag v-for="file in item.evidence" :key="file.file_name || file.name" closable :disable-transitions="true" @close="removeEvidence(item, file)">{{ file.name }}</el-tag></div><label v-if="taskEditable" class="file-action">上传照片或附件<input type="file" multiple @change="event => uploadEvidence(item, event)" /></label></div></article>
        <div class="dialog-actions"><el-button @click="exportTask(taskDetail.task, 'word')">导出 Word</el-button><el-button v-if="taskEditable" :loading="saving" @click="saveTaskItems">保存核查记录</el-button><el-button v-if="taskDetail.task.status === 'draft'" type="primary" @click="transitionTask('submit')">提交审核</el-button><el-button v-if="taskDetail.task.status === 'pending_review' && can('compliance.review') && nonCompliantItems.length" type="warning" @click="openRectificationCreate">下发整改</el-button><el-button v-if="taskDetail.task.status === 'pending_review' && can('compliance.review') && !nonCompliantItems.length" type="success" @click="transitionTask('close')">审核并关闭</el-button><el-button v-if="taskDetail.task.status === 'pending_recheck' && can('compliance.review')" type="success" @click="transitionTask('close')">复核关闭</el-button></div>
      </div>
    </el-dialog>

    <el-dialog v-model="rectificationCreateVisible" title="建立整改任务" width="650px"><el-form :model="rectificationCreateForm" label-width="100px"><el-form-item label="不符合项" required><el-select v-model="rectificationCreateForm.task_item_id"><el-option v-for="item in nonCompliantItems" :key="item.id" :label="item.item_text" :value="item.id" /></el-select></el-form-item><el-form-item label="责任人" required><el-input v-model="rectificationCreateForm.responsible_person" /></el-form-item><el-form-item label="整改期限" required><el-date-picker v-model="rectificationCreateForm.due_date" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="整改要求"><el-input v-model="rectificationCreateForm.action_plan" type="textarea" :rows="3" /></el-form-item></el-form><template #footer><el-button @click="rectificationCreateVisible = false">取消</el-button><el-button type="primary" @click="saveRectificationCreate">下发整改</el-button></template></el-dialog>

    <el-dialog v-model="rectificationEditVisible" title="处理整改" width="650px"><el-form :model="rectificationEditForm" label-width="100px"><el-form-item label="当前问题"><p>{{ rectificationEditForm.item_text }}</p></el-form-item><el-form-item label="处理状态"><el-select v-model="rectificationEditForm.status"><el-option label="整改中" value="in_progress" /><el-option label="提交复核" value="pending_recheck" /><el-option v-if="can('compliance.review')" label="复核关闭" value="closed" /></el-select></el-form-item><el-form-item label="整改结果"><el-input v-model="rectificationEditForm.rectification_result" type="textarea" :rows="3" /></el-form-item><el-form-item v-if="rectificationEditForm.status === 'closed'" label="复核意见"><el-input v-model="rectificationEditForm.review_comment" type="textarea" :rows="2" /></el-form-item></el-form><template #footer><el-button @click="rectificationEditVisible = false">取消</el-button><el-button type="primary" @click="saveRectificationEdit">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, Upload } from '@element-plus/icons-vue'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import StandardPdfReader from '../components/StandardPdfReader.vue'
import { API_DATA } from '../config/api'
import { apiRequest, dataRequest } from '../utils/request'

const categories = [
  ['surface_displacement', '地表位移'], ['settlement', '沉降监测'], ['deep_inclinometer', '深部测斜'],
  ['crack', '裂缝观测'], ['anchor_stress', '锚索应力'], ['rainfall', '天气与雨量'],
  ['inspection', '边坡巡检'], ['data_processing', '数据处理'], ['reporting', '报告编制'], ['general', '通用要求'],
].map(([value, label]) => ({ value, label }))
const standardStatuses = [['draft', '草稿'], ['pending_review', '待审核'], ['published', '现行'], ['deprecated', '已废止'], ['archived', '已归档']].map(([value, label]) => ({ value, label }))
const taskStatuses = [['draft', '草稿'], ['pending_review', '待审核'], ['pending_rectification', '待整改'], ['pending_recheck', '待复核'], ['closed', '已关闭'], ['archived', '已归档']].map(([value, label]) => ({ value, label }))
const rectificationStatuses = [['pending', '待整改'], ['in_progress', '整改中'], ['pending_recheck', '待复核'], ['closed', '已关闭'], ['overdue', '已逾期']].map(([value, label]) => ({ value, label }))
const resultOptions = [['compliant', '符合'], ['basically_compliant', '基本符合'], ['non_compliant', '不符合'], ['not_applicable', '不适用'], ['to_confirm', '待确认']].map(([value, label]) => ({ value, label }))
const navItems = [
  { key: 'dashboard', label: '工作概览', caption: '风险与待办' }, { key: 'library', label: '规范库', caption: '查阅与引用' },
  { key: 'checklists', label: '核查清单', caption: '条文转检查项' }, { key: 'tasks', label: '符合性核查', caption: '人工检查记录' },
  { key: 'rectifications', label: '整改台账', caption: '闭环与复核' },
]

const activeTab = ref('dashboard')
const loading = reactive({ dashboard: false, library: false, checklists: false, tasks: false, rectifications: false })
const permissions = reactive({})
const dashboard = reactive({})
const standards = ref([]), libraryTotal = ref(0), checklists = ref([]), tasks = ref([]), rectifications = ref([]), projects = ref([]), slopes = ref([])
const libraryFilters = reactive({ q: '', category: '', status: '', page: 1, limit: 20 })
const taskFilters = reactive({ status: '', monitor_type: '', section: '' })
const rectificationFilter = ref('')

const uploadVisible = ref(false), uploading = ref(false), uploadProgress = ref(0), standardFile = ref(null)
const uploadForm = reactive({ name: '', code: '', category: '', standard_level: 'industry', publisher: '', publish_date: '', effective_date: '', applicable_scope: '', version_label: '', change_note: '' })
const readerVisible = ref(false), readerPage = ref(1), readerSearch = ref(''), readerSideTab = ref('clauses'), readerData = reactive({ standard: null, clauses: [], annotations: [], versions: [] })
const clauseEditorOpen = ref(false), clauseForm = reactive({ clause_no: '', title: '', content: '' }), annotationForm = reactive({ note: '', visibility: 'private' })
const checklistCreateVisible = ref(false), checklistViewVisible = ref(false), saving = ref(false), selectedChecklist = reactive({ template: null, items: [] })
const checklistForm = reactive({ name: '', category: '', applicable_stage: '', description: '', items: [] })
const taskCreateVisible = ref(false), taskDetailVisible = ref(false), taskDetail = reactive({ task: null, items: [], rectifications: [] })
const taskForm = reactive({ title: '', checklist_template_id: null, project_id: null, section: '', slope_id: null, monitor_type: '', implementation_stage: '' })
const rectificationCreateVisible = ref(false), rectificationEditVisible = ref(false)
const rectificationCreateForm = reactive({ task_item_id: null, responsible_person: '', due_date: '', action_plan: '' })
const rectificationEditForm = reactive({ id: null, item_text: '', status: 'in_progress', rectification_result: '', review_comment: '' })

const categoryText = value => categories.find(item => item.value === value)?.label || value || '—'
const standardStatusText = value => standardStatuses.find(item => item.value === value)?.label || value || '—'
const taskStatusText = value => taskStatuses.find(item => item.value === value)?.label || value || '—'
const rectificationStatusText = value => rectificationStatuses.find(item => item.value === value)?.label || value || '—'
const checklistStatusText = value => ({ draft: '草稿', published: '已发布', archived: '已归档' }[value] || value)
const standardStatusType = value => ({ published: 'success', pending_review: 'warning', deprecated: 'danger', archived: 'info' }[value] || 'info')
const taskStatusType = value => ({ closed: 'success', pending_review: 'warning', pending_rectification: 'danger', pending_recheck: 'warning', archived: 'info' }[value] || 'info')
const rectificationStatusType = value => ({ closed: 'success', overdue: 'danger', pending_recheck: 'warning', in_progress: 'primary' }[value] || 'info')
const dateText = value => value ? String(value).slice(0, 10) : '—'
const can = code => Boolean(permissions[code])
const publishedChecklists = computed(() => checklists.value.filter(item => item.status === 'published'))
const filteredSlopes = computed(() => slopes.value.filter(item => !taskForm.section || item.section === taskForm.section))
const pageClauses = computed(() => readerData.clauses.filter(item => Number(item.page_no) === readerPage.value))
const pageAnnotations = computed(() => readerData.annotations.filter(item => Number(item.page_no) === readerPage.value))
const nonCompliantItems = computed(() => taskDetail.items.filter(item => item.result === 'non_compliant'))
const taskEditable = computed(() => taskDetail.task?.status === 'draft')
const readerPageResults = computed(() => {
  const pages = readerData.standard?.page_text || []
  const query = readerSearch.value.trim().toLowerCase()
  return pages.map((page, index) => ({ page: index + 1, text: typeof page === 'string' ? page : page?.text || '' }))
    .filter(item => !query || item.text.toLowerCase().includes(query))
    .slice(0, query ? 100 : 40)
    .map(item => { const at = query ? item.text.toLowerCase().indexOf(query) : 0; return { page: item.page, excerpt: item.text.slice(Math.max(at - 34, 0), Math.max(at - 34, 0) + 92).replace(/\s+/g, ' ') || '本页无可提取文字' } })
})

function switchTab(tab) { activeTab.value = tab; refreshCurrent() }
async function refreshCurrent() { if (activeTab.value === 'dashboard') await loadDashboard(); else if (activeTab.value === 'library') await loadLibrary(); else if (activeTab.value === 'checklists') await loadChecklists(); else if (activeTab.value === 'tasks') await loadTasks(); else await loadRectifications() }
async function loadPermissions() { const data = await dataRequest('/api/standards/permissions/me'); Object.assign(permissions, data.data || {}) }
async function loadDashboard() { loading.dashboard = true; try { Object.assign(dashboard, (await dataRequest('/api/standards/dashboard')).data || {}) } catch (e) { ElMessage.error(e.message) } finally { loading.dashboard = false } }
async function loadLibrary() { loading.library = true; try { const query = new URLSearchParams(Object.entries(libraryFilters).filter(([, value]) => value !== '')); const data = await dataRequest(`/api/standards/library?${query}`); standards.value = data.data || []; libraryTotal.value = data.total || 0 } catch (e) { ElMessage.error(e.message) } finally { loading.library = false } }
async function loadChecklists() { loading.checklists = true; try { checklists.value = (await dataRequest('/api/standards/checklists')).data || [] } catch (e) { ElMessage.error(e.message) } finally { loading.checklists = false } }
async function loadTasks() { loading.tasks = true; try { const query = new URLSearchParams(Object.entries(taskFilters).filter(([, value]) => value)); tasks.value = (await dataRequest(`/api/standards/tasks?${query}`)).data || [] } catch (e) { ElMessage.error(e.message) } finally { loading.tasks = false } }
async function loadRectifications() { loading.rectifications = true; try { rectifications.value = (await dataRequest(`/api/standards/rectifications${rectificationFilter.value ? `?status=${rectificationFilter.value}` : ''}`)).data || [] } catch (e) { ElMessage.error(e.message) } finally { loading.rectifications = false } }
async function loadScopes() { try { const [projectData, slopeData] = await Promise.all([dataRequest('/api/projects'), dataRequest('/api/slopes')]); projects.value = projectData.data || []; slopes.value = slopeData.data || [] } catch (e) { console.warn(e) } }
function openCategory(category) { libraryFilters.category = category; activeTab.value = 'library'; loadLibrary() }
function resetLibrary() { Object.assign(libraryFilters, { q: '', category: '', status: '', page: 1 }); loadLibrary() }
function selectStandardFile(event) { standardFile.value = event.target.files?.[0] || null }

async function extractPdfPages(file) {
  uploadProgress.value = 2
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number), content = await page.getTextContent()
      let line = '', lines = []
      for (const item of content.items) { if (!item.str) continue; line += `${line ? ' ' : ''}${item.str}`; if (item.hasEOL) { lines.push(line); line = '' } }
      if (line) lines.push(line)
      pages.push(lines.join('\n'))
      uploadProgress.value = Math.max(5, Math.round(number / pdf.numPages * 78))
    }
  } finally { await pdf.destroy() }
  return pages.some(page => page.trim()) ? pages : []
}
async function submitStandard() {
  const required = ['name', 'code', 'category', 'publisher', 'effective_date', 'applicable_scope', 'version_label']
  if (required.some(key => !uploadForm[key]) || !standardFile.value) return ElMessage.warning('请完整填写必填信息并选择 PDF 文件')
  if (standardFile.value.size > 100 * 1024 * 1024) return ElMessage.error('规范文件不能超过 100MB')
  uploading.value = true
  try {
    let pages = []
    try { pages = await extractPdfPages(standardFile.value) } catch (e) { console.warn('PDF text extraction skipped', e) }
    const body = new FormData()
    Object.entries(uploadForm).forEach(([key, value]) => body.append(key, value || ''))
    body.append('page_text', JSON.stringify(pages)); body.append('file', standardFile.value)
    uploadProgress.value = 84
    const data = await dataRequest('/api/standards/library', { method: 'POST', body })
    uploadProgress.value = 100; ElMessage.success(data.message); uploadVisible.value = false
    Object.assign(uploadForm, { name: '', code: '', category: '', standard_level: 'industry', publisher: '', publish_date: '', effective_date: '', applicable_scope: '', version_label: '', change_note: '' }); standardFile.value = null
    activeTab.value = 'library'; await loadLibrary(); await loadDashboard()
  } catch (e) { ElMessage.error(e.message) } finally { uploading.value = false; setTimeout(() => { uploadProgress.value = 0 }, 800) }
}
async function changeStandardStatus(row, status) { try { await dataRequest(`/api/standards/library/${row.id}/status`, { method: 'PUT', body: { status } }); ElMessage.success('规范状态已更新'); await loadLibrary() } catch (e) { ElMessage.error(e.message) } }
async function deleteStandard(row) { try { await ElMessageBox.confirm(`确认删除草稿“${row.name}”？`, '删除草稿', { type: 'warning' }); await dataRequest(`/api/standards/library/${row.id}`, { method: 'DELETE' }); ElMessage.success('草稿规范已删除'); await loadLibrary() } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message) } }
async function openReader(row, page = 1) { try { const data = await dataRequest(`/api/standards/library/${row.id}`); Object.assign(readerData, data.data); readerPage.value = page; readerSearch.value = ''; readerVisible.value = true } catch (e) { ElMessage.error(e.message) } }
function closeReader() { readerVisible.value = false; clauseEditorOpen.value = false }
async function saveClause() { if (!clauseForm.content) return ElMessage.warning('请填写条文内容'); try { await dataRequest(`/api/standards/library/${readerData.standard.id}/clauses`, { method: 'POST', body: { ...clauseForm, page_no: readerPage.value } }); Object.assign(clauseForm, { clause_no: '', title: '', content: '' }); clauseEditorOpen.value = false; await openReader(readerData.standard, readerPage.value); ElMessage.success('条文已保存') } catch (e) { ElMessage.error(e.message) } }
async function saveAnnotation() { if (!annotationForm.note) return ElMessage.warning('请填写批注内容'); try { await dataRequest(`/api/standards/library/${readerData.standard.id}/annotations`, { method: 'POST', body: { ...annotationForm, page_no: readerPage.value } }); annotationForm.note = ''; await openReader(readerData.standard, readerPage.value); readerSideTab.value = 'notes'; ElMessage.success('批注已保存') } catch (e) { ElMessage.error(e.message) } }
function openChecklistCreate() { Object.assign(checklistForm, { name: '', category: '', applicable_stage: '', description: '', items: [{ item_text: '', basis_text: '', page_no: 1 }] }); checklistCreateVisible.value = true }
function addChecklistItem() { checklistForm.items.push({ item_text: '', basis_text: '', page_no: 1 }) }
function useClauseInChecklist(clause) { Object.assign(checklistForm, { name: `${categoryText(readerData.standard.category)}规范核查清单`, category: readerData.standard.category }); checklistForm.items = [{ item_text: clause.title || clause.content.slice(0, 80), basis_text: clause.content, page_no: clause.page_no, standard_id: clause.standard_id, version_id: clause.version_id, clause_id: clause.id }]; checklistCreateVisible.value = true }
async function saveChecklist() { if (!checklistForm.name || !checklistForm.category || !checklistForm.items.some(item => item.item_text)) return ElMessage.warning('请填写清单名称、监测类型和检查项'); saving.value = true; try { await dataRequest('/api/standards/checklists', { method: 'POST', body: checklistForm }); ElMessage.success('核查清单草稿已保存'); checklistCreateVisible.value = false; await loadChecklists() } catch (e) { ElMessage.error(e.message) } finally { saving.value = false } }
async function viewChecklist(row) { try { Object.assign(selectedChecklist, (await dataRequest(`/api/standards/checklists/${row.id}`)).data); checklistViewVisible.value = true } catch (e) { ElMessage.error(e.message) } }
async function publishChecklist(row) { try { await dataRequest(`/api/standards/checklists/${row.id}/status`, { method: 'PUT', body: { status: 'published' } }); ElMessage.success('清单已发布'); await loadChecklists() } catch (e) { ElMessage.error(e.message) } }
function createTaskFrom(row) { Object.assign(taskForm, { title: `${row.name}核查`, checklist_template_id: row.id, monitor_type: row.category, project_id: null, section: '', slope_id: null, implementation_stage: row.applicable_stage || '' }); taskCreateVisible.value = true }
function syncTaskCategory(id) { const item = checklists.value.find(row => row.id === id); if (item) taskForm.monitor_type = item.category }
async function saveTask() { if (!taskForm.title || !taskForm.checklist_template_id || !taskForm.monitor_type) return ElMessage.warning('请填写任务名称并选择核查清单'); saving.value = true; try { const data = await dataRequest('/api/standards/tasks', { method: 'POST', body: taskForm }); ElMessage.success(data.message); taskCreateVisible.value = false; activeTab.value = 'tasks'; await loadTasks(); await openTask({ id: data.data.id }) } catch (e) { ElMessage.error(e.message) } finally { saving.value = false } }
async function openTask(row) { try { Object.assign(taskDetail, (await dataRequest(`/api/standards/tasks/${row.id}`)).data); taskDetailVisible.value = true } catch (e) { ElMessage.error(e.message) } }
async function saveTaskItems() { saving.value = true; try { await dataRequest(`/api/standards/tasks/${taskDetail.task.id}/items`, { method: 'PUT', body: { items: taskDetail.items } }); ElMessage.success('核查记录已保存'); await openTask(taskDetail.task) } catch (e) { ElMessage.error(e.message) } finally { saving.value = false } }
async function transitionTask(action) { try { if (taskEditable.value) await saveTaskItems(); await dataRequest(`/api/standards/tasks/${taskDetail.task.id}/transition`, { method: 'POST', body: { action } }); ElMessage.success('任务状态已更新'); await openTask(taskDetail.task); await loadTasks(); await loadDashboard() } catch (e) { ElMessage.error(e.message) } }
async function uploadEvidence(item, event) { const files = [...(event.target.files || [])]; event.target.value = ''; if (!files.length) return; try { const body = new FormData(); files.forEach(file => body.append('files', file)); const data = await dataRequest(`/api/standards/tasks/${taskDetail.task.id}/evidence`, { method: 'POST', body }); item.evidence = [...(item.evidence || []), ...(data.data || [])]; ElMessage.success('证据材料已上传，请保存核查记录') } catch (e) { ElMessage.error(e.message) } }
function removeEvidence(item, file) { item.evidence = item.evidence.filter(entry => entry !== file) }
function jumpToStandard(item) { taskDetailVisible.value = false; openReader({ id: item.standard_id }, Number(item.page_no || 1)) }
function openRectificationCreate() { Object.assign(rectificationCreateForm, { task_item_id: nonCompliantItems.value[0]?.id || null, responsible_person: '', due_date: '', action_plan: '' }); rectificationCreateVisible.value = true }
async function saveRectificationCreate() { if (!rectificationCreateForm.task_item_id || !rectificationCreateForm.responsible_person || !rectificationCreateForm.due_date) return ElMessage.warning('请填写责任人和整改期限'); try { await dataRequest(`/api/standards/tasks/${taskDetail.task.id}/rectifications`, { method: 'POST', body: rectificationCreateForm }); ElMessage.success('整改任务已下发'); rectificationCreateVisible.value = false; await openTask(taskDetail.task); await loadDashboard() } catch (e) { ElMessage.error(e.message) } }
function editRectification(row) { Object.assign(rectificationEditForm, { id: row.id, item_text: row.item_text, status: row.status === 'overdue' ? 'in_progress' : row.status, rectification_result: row.rectification_result || '', review_comment: row.review_comment || '' }); rectificationEditVisible.value = true }
async function saveRectificationEdit() { try { await dataRequest(`/api/standards/rectifications/${rectificationEditForm.id}`, { method: 'PUT', body: rectificationEditForm }); ElMessage.success('整改状态已更新'); rectificationEditVisible.value = false; await loadRectifications(); await loadDashboard() } catch (e) { ElMessage.error(e.message) } }

async function exportTask(row) {
  try {
    const detail = row.id === taskDetail.task?.id ? taskDetail : (await dataRequest(`/api/standards/tasks/${row.id}`)).data
    const resultText = value => resultOptions.find(item => item.value === value)?.label || '未填写'
    const items = detail.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.item_text)}</td><td>${escapeHtml(item.basis_text || '')}${item.page_no ? `（第${item.page_no}页）` : ''}</td><td>${resultText(item.result)}</td><td>${escapeHtml(item.finding || '')}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"SimSun",serif;margin:34px;color:#111}h1{text-align:center;font-size:22px}p{font-size:12pt}table{width:100%;border-collapse:collapse;font-size:10.5pt}th,td{border:1px solid #222;padding:7px;vertical-align:top}th{background:#eee}</style></head><body><h1>规范符合性核查表</h1><p>任务编号：${escapeHtml(detail.task.task_no)}　任务名称：${escapeHtml(detail.task.title)}</p><p>项目：${escapeHtml(detail.task.project_name || '')}　标段：${escapeHtml(detail.task.section || '')}　边坡：${escapeHtml(detail.task.slope_name || '')}</p><table><thead><tr><th>序号</th><th>检查事项</th><th>规范依据</th><th>结论</th><th>事实与说明</th></tr></thead><tbody>${items}</tbody></table><p>核查人员：${escapeHtml(detail.task.inspector_name || '')}　　　　复核人员：${escapeHtml(detail.task.reviewer_name || '')}</p></body></html>`
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `${detail.task.task_no}-${detail.task.title}.doc`; link.click(); URL.revokeObjectURL(url)
  } catch (e) { ElMessage.error(e.message) }
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

onMounted(async () => { try { await Promise.all([loadPermissions(), loadScopes(), loadDashboard(), loadChecklists()]) } catch (e) { ElMessage.error(e.message) } })
</script>

<style scoped>
.compliance-page{--ink:#183247;--muted:#6e8192;--line:#dce5eb;--paper:#fff;--wash:#f4f8fa;--blue:#176b9b;--cyan:#20a5b5;min-height:calc(100vh - 84px);color:var(--ink);font-family:"Microsoft YaHei","PingFang SC",sans-serif}.page-heading{display:flex;align-items:flex-end;justify-content:space-between;padding:24px 28px;background:linear-gradient(112deg,#f9fcfd 0%,#edf6f8 58%,#e8f2f5 100%);border:1px solid #d7e4e9;border-bottom:3px solid #2d879c}.eyebrow{margin:0 0 7px!important;color:#36778d!important;font:600 11px/1.2 Arial,sans-serif;letter-spacing:.16em}.page-heading h1{margin:0;font-size:28px;letter-spacing:.04em}.page-heading p{margin:8px 0 0;color:var(--muted);font-size:13px}.heading-actions{display:flex;gap:10px}.module-nav{display:grid;grid-template-columns:repeat(5,1fr);margin:14px 0;background:#fff;border:1px solid var(--line)}.module-nav button{position:relative;padding:13px 18px;text-align:left;border:0;border-right:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}.module-nav button:last-child{border-right:0}.module-nav button span,.module-nav button small{display:block}.module-nav button span{font-weight:700}.module-nav button small{margin-top:3px;color:#8a99a5}.module-nav button.active{background:#edf7f8;color:#075d73}.module-nav button.active:after{content:"";position:absolute;left:18px;right:18px;bottom:-1px;height:3px;background:var(--cyan)}.metric-strip{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid var(--line)}.metric-strip article{padding:20px 24px;border-right:1px solid var(--line)}.metric-strip article:last-child{border-right:0}.metric-strip span,.metric-strip small{display:block;color:var(--muted);font-size:12px}.metric-strip strong{display:block;margin:5px 0 2px;font:700 29px/1.1 Georgia,serif;color:#0b6676}.metric-strip .alert strong,.overdue{color:#c34242}.dashboard-grid{display:grid;grid-template-columns:minmax(320px,.85fr) minmax(480px,1.15fr);gap:14px;margin-top:14px}.panel,.workspace-section{background:#fff;border:1px solid var(--line)}.panel{min-height:340px;padding:20px}.panel-title,.section-title{display:flex;align-items:flex-start;justify-content:space-between}.panel-title h2,.section-title h2{margin:0;font-size:18px}.panel-title p,.section-title p{margin:5px 0 0;color:var(--muted);font-size:12px}.category-list{display:grid;gap:8px;margin-top:18px}.category-list button{position:relative;overflow:hidden;display:flex;justify-content:space-between;padding:12px 14px;border:1px solid #e3ebef;background:#fbfdfe;color:var(--ink);cursor:pointer}.category-list button i{position:absolute;left:0;bottom:0;height:2px;background:var(--cyan)}.recent-list{margin-top:12px}.recent-list button{display:grid;grid-template-columns:115px 1fr 190px 90px;gap:12px;align-items:center;width:100%;padding:14px 4px;border:0;border-bottom:1px solid #e8eef1;background:#fff;text-align:left;cursor:pointer}.recent-list button:hover{background:#f7fafb}.recent-list small{color:var(--muted)}.task-code{font:600 11px Arial;color:#357b8f}.workspace-section{padding:20px}.filter-bar{display:grid;grid-template-columns:minmax(280px,1.8fr) minmax(150px,.8fr) minmax(140px,.7fr) auto auto;gap:10px;margin-bottom:24px;padding:14px;background:var(--wash);border:1px solid #e1e9ed}.filter-bar.task-filters{grid-template-columns:200px 200px 220px auto}.filter-bar.compact{grid-template-columns:220px;justify-content:end}.section-title{margin-bottom:14px}.section-title>span{font-size:13px;color:var(--muted)}.standard-cell{display:flex;align-items:center;gap:12px}.standard-cell strong,.standard-cell small,.task-name strong,.task-name small,.finding-cell strong,.finding-cell small{display:block}.standard-cell small,.task-name small,.finding-cell small{margin-top:4px;color:var(--muted)}.document-mark{display:grid;place-items:center;width:38px;height:45px;background:#eef6f8;border:1px solid #bad7df;color:#0b6c7e;font:700 10px Arial}.indexed{color:#167266}.scan-only{color:#9b6b23}.data-table{border-top:1px solid var(--line)}.issue-count{display:block;color:#b53d3d;font-size:11px}.el-pagination{justify-content:flex-end;margin-top:16px}.dialog-form{margin-top:18px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.form-grid :deep(.el-select),.form-grid :deep(.el-date-editor){width:100%}.native-file{display:block;width:100%;padding:9px;border:1px dashed #aebec9;background:#f8fbfc}.field-note{display:block;margin-top:5px;color:var(--muted)}.reader-dialog :deep(.el-dialog__body){padding:0;height:calc(100vh - 61px);overflow:hidden}.reader-dialog :deep(.el-dialog__header){padding:0}.reader-heading{display:flex;align-items:center;gap:18px;height:60px;padding:0 20px;border-bottom:1px solid var(--line)}.reader-heading strong,.reader-heading small{display:block}.reader-heading small{margin-top:3px;color:var(--muted)}.back-button{border:0;background:none;color:#176b9b;font-weight:600;cursor:pointer}.reader-layout{display:grid;grid-template-columns:260px minmax(480px,1fr) 340px;height:100%}.reader-index,.citation-rail{overflow-x:hidden;overflow-y:auto;background:#f7fafb}.reader-index{padding:18px;border-right:1px solid var(--line)}.reader-index h3{margin:0 0 12px}.scan-note{font-size:12px;line-height:1.6;color:#956d2d}.page-results{display:grid;gap:6px;margin-top:12px}.page-results button{padding:10px;border:1px solid transparent;background:transparent;text-align:left;cursor:pointer}.page-results button.active,.page-results button:hover{border-color:#bcd7df;background:#fff}.page-results b,.page-results span{display:block}.page-results b{font-size:12px;color:#176b9b}.page-results span{margin-top:4px;color:#6e8192;font-size:11px;line-height:1.45}.citation-rail{padding:10px 18px;border-left:1px solid var(--line);background:#fff}.rail-actions{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:var(--muted);font-size:12px}.inline-editor{display:grid;gap:8px;padding:12px;margin-bottom:12px;background:#f3f8fa;border-left:3px solid var(--cyan)}.citation-card,.note-card,.version-card{padding:13px 12px;margin-bottom:9px;border:1px solid #dce6ea;border-left:3px solid #2b879b;background:#fff}.citation-card>span,.note-card>span,.version-card span,.version-card small{display:block;color:var(--muted);font-size:11px}.citation-card strong,.version-card strong{display:block;margin:5px 0}.citation-card p,.note-card p{font-family:"SimSun",serif;line-height:1.7;color:#2f414e}.citation-card button{border:0;background:none;color:#176b9b;cursor:pointer}.item-editor-head{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.check-item-edit{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start;padding:10px 0;border-bottom:1px solid #e7edef}.check-item-edit>span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#e9f4f6;color:#176b7a}.item-basis{display:grid;grid-template-columns:1fr 130px;gap:8px;margin-top:7px}.readonly-items{margin-top:16px}.readonly-items article{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:13px 0;border-bottom:1px solid var(--line)}.readonly-items p{margin:4px 0;color:var(--muted)}.task-dialog-head{display:flex;justify-content:space-between;align-items:center}.task-dialog-head span{color:var(--muted);font:600 11px Arial}.task-dialog-head h2{margin:4px 0 0;font-size:19px}.task-context{display:flex;gap:0;margin-bottom:14px;background:#f2f7f8;border:1px solid var(--line)}.task-context span{padding:10px 14px;border-right:1px solid var(--line);font-size:12px}.review-item{padding:16px 0;border-top:1px solid var(--line)}.review-item header{display:grid;grid-template-columns:30px 1fr 150px;gap:10px;align-items:start;margin-bottom:10px}.review-item header>b{color:#1c7b8a}.review-item header p{margin:5px 0;color:var(--muted);font-size:12px}.review-item header button{margin-left:6px;border:0;background:none;color:#176b9b;cursor:pointer}.evidence-row{display:flex;align-items:center;justify-content:space-between;margin-top:8px}.file-action{color:#176b9b;font-size:12px;cursor:pointer}.file-action input{display:none}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:-16px;padding:14px;background:#fff;border-top:1px solid var(--line)}
@media(max-width:1100px){.module-nav{grid-template-columns:repeat(3,1fr)}.dashboard-grid{grid-template-columns:1fr}.reader-layout{grid-template-columns:210px 1fr}.citation-rail{position:absolute;right:0;width:330px;height:calc(100% - 60px);box-shadow:-8px 0 24px rgba(20,43,57,.12)}.filter-bar{grid-template-columns:1fr 1fr}.metric-strip{grid-template-columns:repeat(2,1fr)}}
@media(max-width:720px){.page-heading{align-items:flex-start;flex-direction:column;gap:16px}.module-nav{grid-template-columns:1fr 1fr}.metric-strip{grid-template-columns:1fr 1fr}.metric-strip article{padding:15px}.workspace-section{padding:12px}.filter-bar,.filter-bar.task-filters,.form-grid{grid-template-columns:1fr}.reader-layout{grid-template-columns:1fr}.reader-index{display:none}.citation-rail{display:none}.recent-list button{grid-template-columns:1fr}.review-item header{grid-template-columns:28px 1fr}.review-item header .el-select{grid-column:2}.evidence-row{align-items:flex-start;flex-direction:column;gap:8px}}
</style>
