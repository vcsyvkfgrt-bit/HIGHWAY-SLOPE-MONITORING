const mysql = require('mysql2/promise');

async function updateTemplate() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '123456',
      database: 'slope_monitoring'
    });

    console.log('数据库连接成功');

    // 删除所有旧模板数据
    await connection.execute('DELETE FROM templates');
    console.log('删除所有旧模板数据');

    // 插入新的模板数据
    const defaultTemplate = {
      name: '周报基础模板',
      type: 'weekly',
      description: '包含基本的周报结构和常用模块',
      modules: [
        {
          id: 'mod_1',
          name: '项目概况',
          children: [
            { id: 'child_1', type: 'text', name: '项目基本信息', default: '项目名称：XX公路边坡监测项目\n项目地点：XX省XX市\n监测周期：2026年第X周' },
            { id: 'child_2', type: 'text', name: '监测目的', default: '为确保公路边坡的安全稳定，及时发现和预警边坡变形情况，保障公路通行安全。' },
            { id: 'child_3', type: 'text', name: '监测范围', default: 'XX公路K1+200-K1+500段右侧边坡' }
          ]
        },
        {
          id: 'mod_2',
          name: '边坡设计复核',
          children: [
            { id: 'child_4', type: 'text', name: '设计参数复核', default: '边坡设计坡度：1:1.5\n设计稳定系数：≥1.25\n支护结构：锚杆+格构梁' },
            { id: 'child_5', type: 'table', name: '设计对比表', columns: ['项目', '设计值', '实测值', '偏差'] }
          ]
        },
        {
          id: 'mod_3',
          name: '边坡监测情况',
          children: [
            { id: 'child_6', type: 'monitoring', name: '表面位移监测', monitoringType: 'surface' },
            { id: 'child_7', type: 'chart', name: '位移趋势图', chartType: 'line', description: '本周位移变化趋势' },
            { id: 'child_8', type: 'text', name: '监测分析', default: '本周监测数据显示，边坡位移处于正常范围内，未发现异常变化。' }
          ]
        },
        {
          id: 'mod_4',
          name: '边坡巡查情况',
          children: [
            { id: 'child_9', type: 'select', name: '巡查结果', options: ['正常', '异常', '需关注'], default: '正常' },
            { id: 'child_10', type: 'text', name: '巡查记录', default: '本周对监测边坡进行了X次巡查，边坡表面无明显裂缝、坍塌等异常现象。' }
          ]
        }
      ]
    };

    await connection.execute(`
      INSERT INTO templates (name, type, description, modules, is_system) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      defaultTemplate.name,
      defaultTemplate.type,
      defaultTemplate.description,
      JSON.stringify(defaultTemplate.modules),
      1
    ]);
    console.log('新模板数据插入成功');

    // 验证插入的数据
    const [templates] = await connection.execute('SELECT * FROM templates WHERE name = ?', ['周报基础模板']);
    if (templates.length > 0) {
      console.log('验证模板数据：');
      console.log('模板名称:', templates[0].name);
      console.log('模板类型:', templates[0].type);
      const modules = typeof templates[0].modules === 'string' ? JSON.parse(templates[0].modules) : templates[0].modules;
      console.log('模块数量:', modules.length);
      console.log('第一个模块:', modules[0].name);
      console.log('第一个模块的子内容数量:', modules[0].children.length);
    }

    await connection.end();
    console.log('模板更新完成');
  } catch (error) {
    console.error('更新模板失败:', error);
  }
}

updateTemplate();
