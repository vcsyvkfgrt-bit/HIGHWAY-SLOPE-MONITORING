const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { resolveUploadedTemplate, validateWordTemplateFile } = require('../utils/wordTemplateRenderer');

const STANDARD_PLACEHOLDERS = [
  { key: '{报告标题}', field: 'title', type: 'text', label: '报告标题', source: 'report', description: '当前报告标题' },
  { key: '{报告类型}', field: 'reportType', type: 'text', label: '报告类型', source: 'report', description: '周报、月报或自定义报告' },
  { key: '{报告日期}', field: 'reportDate', type: 'date', label: '报告日期', source: 'report', description: '报告编制日期' },
  { key: '{统计月份}', field: 'reportMonth', type: 'month', label: '统计月份', source: 'report', description: '报告统计月份' },
  { key: '{汇报月份}', field: 'meetingMonth', type: 'month', label: '汇报月份', source: 'report', description: '监理例会材料所属月份' },
  { key: '{统计截止日期}', field: 'cutoffDate', type: 'date', label: '统计截止日期', source: 'report', description: '监理例会材料统计截止日期' },
  { key: '{监理例会标题}', field: 'supervisionMeetingTitle', type: 'text', label: '监理例会标题', source: 'report', description: '监理例会汇报材料标题' },
  { key: '{编制人}', field: 'author', type: 'user', label: '编制人', source: 'report', description: '报告编制人' },
  { key: '{审核人}', field: 'reviewer', type: 'user', label: '审核人', source: 'report', description: '报告审核人' },
  { key: '{标段}', field: 'section', type: 'text', label: '标段', source: 'slope', description: '当前筛选标段或边坡所属标段' },
  { key: '{边坡名称}', field: 'slopeName', type: 'text', label: '边坡名称', source: 'slope', description: '边坡名称' },
  { key: '{边坡监测台账表}', field: 'slopeLedgerTable', type: 'table', label: '边坡监测台账表', source: 'slope_ledger', description: '按月生成边坡监测台账表' },
  { key: '{本期监测完成率}', field: 'completionRate', type: 'number', label: '本期监测完成率', source: 'slope_ledger', description: '台账统计的本期监测完成率' },
  { key: '{地表位移趋势图}', field: 'surfaceTrendChart', type: 'chart', label: '地表位移趋势图', source: 'monitoring_data', description: '地表位移监测数据趋势图' },
  { key: '{深部测斜曲线}', field: 'inclinometerProfileChart', type: 'chart', label: '深部测斜曲线', source: 'inclinometer_data', description: '深部位移测斜累计/相对位移曲线' },
  { key: '{地表位移统计表}', field: 'surfaceSummaryTable', type: 'table', label: '地表位移统计表', source: 'monitoring_data', description: '地表位移本期统计表' },
  { key: '{平均监测频率统计}', field: 'frequencySummaryTable', type: 'table', label: '平均监测频率统计', source: 'monitoring_data', description: '按测点统计相邻有效观测日期的平均间隔' },
  { key: '{变化速率图}', field: 'monitoringRateChart', type: 'chart', label: '变化速率图', source: 'monitoring_data', description: '相邻两期变化速率及2mm/d参考线' },
  { key: '{雨量位移叠加图}', field: 'rainfallOverlayChart', type: 'chart', label: '雨量位移叠加图', source: 'weather_rainfall', description: '报告期日雨量与监测值时间叠加' },
  { key: '{巡检问题汇总}', field: 'inspectionProblems', type: 'table', label: '巡检问题汇总', source: 'inspections', description: '边坡巡检问题汇总' },
  { key: '{预警处置记录}', field: 'alarmActions', type: 'table', label: '预警处置记录', source: 'alarms', description: '报警与处置记录' },
  { key: '{监测布点图}', field: 'layoutMap', type: 'image', label: '监测布点图', source: 'slope_ledger', description: '边坡当前监测布点图' },
  { key: '{边坡空间位置表}', field: 'geoLocationTable', type: 'table', label: '边坡空间位置表', source: 'map_overview', description: '边坡经纬度、坐标系及精度说明' },
  { key: '{监测结论}', field: 'monitorConclusion', type: 'text', label: '监测结论', source: 'report', description: '报告结论段落' },
  { key: '{监测对象概况表}', field: 'meetingOverviewTable', type: 'table', label: '监测对象概况表', source: 'supervision_meeting', description: '监理例会材料中的高边坡施工现状及监测工作进展表' },
  { key: '{本月监测进展清单}', field: 'meetingProgressList', type: 'table', label: '本月监测进展清单', source: 'supervision_meeting', description: '按边坡汇总本月已布点和测斜数量' },
  { key: '{本月监测进展}', field: 'meetingProgressText', type: 'text', label: '本月监测进展', source: 'supervision_meeting', description: '按边坡生成的本月监测进展文字' },
  { key: '{分边坡监测进展}', field: 'meetingSlopeSections', type: 'section-list', label: '分边坡监测进展', source: 'supervision_meeting', description: '按边坡循环生成地表变形、变化速率、深部测斜和分析文字' },
  { key: '{单边坡地表变形图}', field: 'meetingSlopeSections', type: 'chart', label: '单边坡地表变形图', source: 'supervision_meeting', description: '分边坡章节中的地表累计变形曲线' },
  { key: '{单边坡深部测斜图}', field: 'meetingSlopeSections', type: 'chart', label: '单边坡深部测斜图', source: 'supervision_meeting', description: '分边坡章节中的深部水平位移测斜曲线' },
  { key: '{单边坡监测分析}', field: 'meetingSlopeSections', type: 'text', label: '单边坡监测分析', source: 'supervision_meeting', description: '分边坡章节中的自动分析段落' },
  { key: '{月度监测结论}', field: 'meetingConclusion', type: 'text', label: '月度监测结论', source: 'supervision_meeting', description: '监理例会材料监测结论初稿' },
  { key: '{月度工作建议}', field: 'meetingSuggestions', type: 'text', label: '月度工作建议', source: 'supervision_meeting', description: '监理例会材料工作建议初稿' },
  { key: '{第3节监测结论初稿}', field: 'meetingConclusion', type: 'text', label: '第3节监测结论初稿', source: 'supervision_meeting', description: '基于监测数据、变化速率、巡检问题和预警记录自动生成，可人工确认修改' },
  { key: '{第4节工作建议初稿}', field: 'meetingSuggestions', type: 'text', label: '第4节工作建议初稿', source: 'supervision_meeting', description: '基于风险点、巡检问题、预警记录和雨量情况自动生成，可人工确认修改' },
]

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeModules(modules) {
  if (!Array.isArray(modules)) return []
  return modules.map((module) => ({
    ...module,
    children: Array.isArray(module.children) ? module.children : [],
  }))
}

function formatTemplate(template) {
  const modules = normalizeModules(parseJson(template.modules, []))
  return {
    ...template,
    modules,
    placeholders: parseJson(template.placeholders, []),
    structure: parseJson(template.structure, []),
    data_bindings: parseJson(template.data_bindings, {}),
  }
}

function userName(req) {
  return req.user?.real_name || req.user?.username || null
}

async function writeTemplateVersion(conn, templateId, versionNo, data, req) {
  await conn.execute(
    `INSERT INTO template_versions
      (template_id, version_no, name, type, description, template_kind, modules,
       file_asset_id, placeholders, structure, content_text, data_bindings, created_by, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      templateId,
      versionNo,
      data.name,
      data.type || 'custom',
      data.description || '',
      data.template_kind || 'system',
      JSON.stringify(data.modules || []),
      data.file_asset_id || null,
      JSON.stringify(data.placeholders || []),
      JSON.stringify(data.structure || []),
      data.content_text || null,
      JSON.stringify(data.data_bindings || {}),
      req.user?.userId || null,
      userName(req),
    ]
  )
}

router.get('/placeholders/dictionary', async (_req, res) => {
  res.json({ success: true, data: STANDARD_PLACEHOLDERS })
})

// 获取所有模板
router.get('/', async (req, res) => {
  try {
    const { type, is_system, template_kind } = req.query;
    let query = 'SELECT * FROM templates WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (is_system !== undefined) {
      query += ' AND is_system = ?';
      params.push(is_system === 'true' ? 1 : 0);
    }

    if (template_kind) {
      query += ' AND template_kind = ?';
      params.push(template_kind);
    }

    query += ' ORDER BY is_system DESC, created_at DESC';

    const [templates] = await pool.execute(query, params);

    // 解析JSON字段（MySQL的JSON类型可能返回对象或字符串）
    const formattedTemplates = templates.map(formatTemplate);

    res.json({
      success: true,
      data: formattedTemplates
    });
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取模板列表失败'
    });
  }
});

// 获取单个模板
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [templates] = await pool.execute(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        error: '模板不存在'
      });
    }

    const template = formatTemplate(templates[0]);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('获取模板详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取模板详情失败'
    });
  }
});

router.get('/:id/versions', auth, async (req, res) => {
  try {
    const { id } = req.params
    const [versions] = await pool.execute(
      `SELECT id, template_id, version_no, name, type, template_kind, created_by_name, created_at
       FROM template_versions
       WHERE template_id = ?
       ORDER BY version_no DESC`,
      [id]
    )
    res.json({ success: true, data: versions })
  } catch (error) {
    console.error('获取模板版本失败:', error)
    res.status(500).json({ success: false, error: '获取模板版本失败' })
  }
})

// 创建模板
router.post('/', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const {
      name,
      type,
      description,
      modules,
      template_kind = 'system',
      file_asset_id,
      placeholders = [],
      structure = [],
      content_text,
      data_bindings = {},
    } = req.body;

    if (!name || !modules) {
      return res.status(400).json({
        success: false,
        error: '模板名称和模块内容不能为空'
      });
    }

    if (template_kind === 'word' && data_bindings?.__sourceFormat !== 'pdf') {
      if (!file_asset_id) {
        return res.status(400).json({ success: false, error: 'DOCX 模板缺少原文件，请重新上传' })
      }
      const [[asset]] = await conn.execute(
        'SELECT file_path FROM file_assets WHERE id = ? AND module = ?',
        [file_asset_id, 'document-template']
      )
      if (!asset) {
        return res.status(400).json({ success: false, error: 'DOCX 模板原文件不存在，请重新上传' })
      }
      try {
        await validateWordTemplateFile(resolveUploadedTemplate(asset.file_path))
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError?.message || 'Word 模板指令校验失败',
        })
      }
    }

    await conn.beginTransaction()
    const [result] = await conn.execute(
      `INSERT INTO templates
        (name, type, description, modules, template_kind, file_asset_id, placeholders, structure,
         content_text, data_bindings, version_no, created_by, updated_by, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        name,
        type || 'custom',
        description || '',
        JSON.stringify(modules),
        template_kind || 'system',
        file_asset_id || null,
        JSON.stringify(placeholders || []),
        JSON.stringify(structure || []),
        content_text || null,
        JSON.stringify(data_bindings || {}),
        req.user.userId,
        req.user.userId,
        userName(req),
      ]
    );
    await writeTemplateVersion(conn, result.insertId, 1, {
      name,
      type,
      description,
      modules,
      template_kind,
      file_asset_id,
      placeholders,
      structure,
      content_text,
      data_bindings,
    }, req)
    await conn.commit()

    res.status(201).json({
      success: true,
      message: '模板创建成功',
      data: {
        id: result.insertId,
        name,
        type,
        description,
        modules,
        template_kind,
        version_no: 1,
      }
    });
  } catch (error) {
    await conn.rollback()
    console.error('创建模板失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: '模板名称已存在'
      });
    }
    res.status(500).json({
      success: false,
      error: '创建模板失败'
    });
  } finally {
    conn.release()
  }
});

// 更新模板
router.put('/:id', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { id } = req.params;
    const {
      name,
      type,
      description,
      modules,
      template_kind,
      file_asset_id,
      placeholders,
      structure,
      content_text,
      data_bindings,
    } = req.body;

    // 检查模板是否存在
    const [existing] = await conn.execute(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: '模板不存在'
      });
    }

    // 系统模板只能由管理员修改
    if (existing[0].is_system && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '无权修改系统模板'
      });
    }

    const current = formatTemplate(existing[0]);
    const nextVersion = Number(current.version_no || 1) + 1
    const updateFields = ['version_no = ?', 'updated_by = ?', 'updated_by_name = ?'];
    const params = [nextVersion, req.user.userId, userName(req)];

    if (name !== undefined) {
      updateFields.push('name = ?');
      params.push(name);
    }
    if (type !== undefined) {
      updateFields.push('type = ?');
      params.push(type);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      params.push(description);
    }
    if (modules !== undefined) {
      updateFields.push('modules = ?');
      params.push(JSON.stringify(modules));
    }
    if (template_kind !== undefined) {
      updateFields.push('template_kind = ?');
      params.push(template_kind);
    }
    if (file_asset_id !== undefined) {
      updateFields.push('file_asset_id = ?');
      params.push(file_asset_id || null);
    }
    if (placeholders !== undefined) {
      updateFields.push('placeholders = ?');
      params.push(JSON.stringify(placeholders || []));
    }
    if (structure !== undefined) {
      updateFields.push('structure = ?');
      params.push(JSON.stringify(structure || []));
    }
    if (content_text !== undefined) {
      updateFields.push('content_text = ?');
      params.push(content_text || null);
    }
    if (data_bindings !== undefined) {
      updateFields.push('data_bindings = ?');
      params.push(JSON.stringify(data_bindings || {}));
    }

    params.push(id);

    await conn.beginTransaction()
    await conn.execute(
      `UPDATE templates SET ${updateFields.join(', ')} WHERE id = ?`,
      params
    );
    const versionData = {
      name: name ?? current.name,
      type: type ?? current.type,
      description: description ?? current.description,
      modules: modules ?? current.modules,
      template_kind: template_kind ?? current.template_kind,
      file_asset_id: file_asset_id ?? current.file_asset_id,
      placeholders: placeholders ?? current.placeholders,
      structure: structure ?? current.structure,
      content_text: content_text ?? current.content_text,
      data_bindings: data_bindings ?? current.data_bindings,
    }
    await writeTemplateVersion(conn, id, nextVersion, versionData, req)
    await conn.commit()

    res.json({
      success: true,
      message: '模板更新成功',
      data: { version_no: nextVersion }
    });
  } catch (error) {
    await conn.rollback()
    console.error('更新模板失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: '模板名称已存在'
      });
    }
    res.status(500).json({
      success: false,
      error: '更新模板失败'
    });
  } finally {
    conn.release()
  }
});

// 删除模板
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查模板是否存在
    const [existing] = await pool.execute(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: '模板不存在'
      });
    }

    // 系统模板只能由管理员删除
    if (existing[0].is_system && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '无权删除系统模板'
      });
    }

    await pool.execute('DELETE FROM templates WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '模板删除成功'
    });
  } catch (error) {
    console.error('删除模板失败:', error);
    res.status(500).json({
      success: false,
      error: '删除模板失败'
    });
  }
});

// 复制模板
router.post('/:id/copy', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { id } = req.params;
    const { newName } = req.body;

    // 获取原模板
    const [templates] = await conn.execute(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        error: '模板不存在'
      });
    }

    const originalTemplate = formatTemplate(templates[0]);
    const name = newName || `${originalTemplate.name}_副本`;

    await conn.beginTransaction()
    const [result] = await conn.execute(
      `INSERT INTO templates
        (name, type, description, modules, template_kind, file_asset_id, placeholders, structure,
         content_text, data_bindings, version_no, created_by, updated_by, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        name,
        originalTemplate.type,
        originalTemplate.description,
        JSON.stringify(originalTemplate.modules || []),
        originalTemplate.template_kind || 'system',
        originalTemplate.file_asset_id || null,
        JSON.stringify(originalTemplate.placeholders || []),
        JSON.stringify(originalTemplate.structure || []),
        originalTemplate.content_text || null,
        JSON.stringify(originalTemplate.data_bindings || {}),
        req.user.userId,
        req.user.userId,
        userName(req),
      ]
    );
    await writeTemplateVersion(conn, result.insertId, 1, {
      ...originalTemplate,
      name,
    }, req)
    await conn.commit()

    res.status(201).json({
      success: true,
      message: '模板复制成功',
      data: {
        id: result.insertId,
        name,
        type: originalTemplate.type,
        description: originalTemplate.description
      }
    });
  } catch (error) {
    await conn.rollback()
    console.error('复制模板失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: '模板名称已存在'
      });
    }
    res.status(500).json({
      success: false,
      error: '复制模板失败'
    });
  } finally {
    conn.release()
  }
});

module.exports = router;
