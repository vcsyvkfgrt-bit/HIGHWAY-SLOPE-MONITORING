# 模板格式规范

## 1. 概述

本文档定义了报告模板的标准JSON格式，用于模板的导入和导出。遵循此格式的模板文件可以被系统正确加载和使用。

## 2. 模板结构

模板文件为JSON格式，包含以下字段：

```json
{
  "name": "模板名称",
  "description": "模板描述",
  "type": "模板类型",
  "modules": [
    {
      "type": "模块类型",
      "content": "模块内容",
      "title": "模块标题",
      "level": "标题级别",
      "chartType": "图表类型"
    }
  ]
}
```

## 3. 字段说明

### 3.1 模板基本信息

| 字段名 | 类型 | 必需 | 说明 |
|-------|------|------|------|
| `name` | String | 是 | 模板名称，长度不超过255个字符 |
| `description` | String | 否 | 模板描述，详细说明模板的用途和结构 |
| `type` | String | 是 | 模板类型，可选值：`weekly`（周报）、`monthly`（月报）、`custom`（自定义） |
| `modules` | Array | 是 | 模块列表，至少包含一个模块 |

### 3.2 模块信息

| 字段名 | 类型 | 必需 | 说明 |
|-------|------|------|------|
| `type` | String | 是 | 模块类型，可选值：`title`（标题）、`text`（文字）、`chart`（图表）、`table`（表格） |
| `content` | String | 否 | 模块内容，对于标题模块和文字模块必填 |
| `title` | String | 否 | 模块标题，对于图表模块和表格模块必填 |
| `level` | String | 否 | 标题级别，仅标题模块使用，可选值：`h1`、`h2`、`h3` |
| `chartType` | String | 否 | 图表类型，仅图表模块使用，可选值：`line`（折线图）、`bar`（柱状图）、`pie`（饼图） |

## 4. 模块类型详细说明

### 4.1 标题模块

```json
{
  "type": "title",
  "content": "标题内容",
  "level": "h2"
}
```

### 4.2 文字模块

```json
{
  "type": "text",
  "content": "文字内容"
}
```

### 4.3 图表模块

```json
{
  "type": "chart",
  "title": "图表标题",
  "chartType": "line"
}
```

### 4.4 表格模块

```json
{
  "type": "table",
  "title": "表格标题"
}
```

## 5. 完整示例

### 5.1 周报模板示例

```json
{
  "name": "周报模板",
  "description": "标准周报模板，包含工作概述、数据汇总和工作计划",
  "type": "weekly",
  "modules": [
    {
      "type": "title",
      "content": "一、本周工作概述",
      "level": "h2"
    },
    {
      "type": "text",
      "content": "本周完成了以下工作..."
    },
    {
      "type": "title",
      "content": "二、监测数据汇总",
      "level": "h2"
    },
    {
      "type": "chart",
      "title": "本周监测数据趋势",
      "chartType": "line"
    },
    {
      "type": "table",
      "title": "监测数据详情"
    },
    {
      "type": "title",
      "content": "三、下周工作计划",
      "level": "h2"
    },
    {
      "type": "text",
      "content": "下周计划开展以下工作..."
    }
  ]
}
```

### 5.2 月报模板示例

```json
{
  "name": "月报模板",
  "description": "标准月报模板，包含工作回顾、数据分析和工作计划",
  "type": "monthly",
  "modules": [
    {
      "type": "title",
      "content": "一、本月工作回顾",
      "level": "h2"
    },
    {
      "type": "text",
      "content": "本月完成了以下工作..."
    },
    {
      "type": "title",
      "content": "二、监测数据分析",
      "level": "h2"
    },
    {
      "type": "chart",
      "title": "本月监测数据趋势",
      "chartType": "line"
    },
    {
      "type": "chart",
      "title": "各监测边坡数据对比",
      "chartType": "bar"
    },
    {
      "type": "table",
      "title": "监测数据汇总表"
    },
    {
      "type": "title",
      "content": "三、问题与建议",
      "level": "h2"
    },
    {
      "type": "text",
      "content": "存在的问题及建议..."
    },
    {
      "type": "title",
      "content": "四、下月工作计划",
      "level": "h2"
    },
    {
      "type": "text",
      "content": "下月计划开展以下工作..."
    }
  ]
}
```

## 6. 导入导出操作

### 6.1 导出模板

1. 在模板管理页面，找到要导出的模板
2. 点击模板卡片上的"导出"按钮
3. 系统会生成并下载一个JSON格式的模板文件

### 6.2 导入模板

1. 在模板管理页面，点击"导入模板"按钮
2. 选择符合本规范的JSON模板文件
3. 系统会验证模板格式并导入到系统中

## 7. 注意事项

1. 模板文件必须是有效的JSON格式
2. 模板必须包含`name`、`type`和`modules`字段
3. `modules`数组至少包含一个模块
4. 每个模块必须包含`type`字段
5. 不同类型的模块需要提供相应的必填字段
6. 导入模板时，系统会自动生成新的模板ID和创建时间
