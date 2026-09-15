import * as echarts from 'echarts'

export const ACADEMIC_COLORS = [
  '#1f4e79',
  '#b7472a',
  '#2f6b4f',
  '#8a6d1d',
  '#684c7c',
  '#237a8a',
  '#7d3c48',
  '#4f5d2f',
  '#2f2f2f',
  '#627c92',
]

export const MEETING_CHART_EXPORT = {
  width: 1600,
  minHeight: 960,
  pixelRatio: 1.5,
  wordWidth: 540,
  itemsPerLegendRow: 4,
}

const CHART_FONT = '"Times New Roman", "SimSun", "宋体", serif'
const GRID_LINE = '#d2d8dd'
const AXIS_LINE = '#24292f'
const DEPTH_HISTORY_COLORS = ['#c9d6df', '#afc2cf', '#91abba', '#7293a5', '#527b91', '#35657e', '#214f6b']
const DEPTH_LATEST_COLOR = '#a63d2f'
const DEPTH_BASELINE_COLOR = '#3d4650'

function safeText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function seriesCount(material = {}) {
  return (material.series || []).filter(item => (item.data || []).length > 0).length || (material.series || []).length
}

function wrapLegendName(name, limit = 18) {
  const text = safeText(name)
  if (text.length <= limit) return text
  if (text.length <= limit * 2) return `${text.slice(0, limit)}\n${text.slice(limit)}`
  return `${text.slice(0, limit)}\n${text.slice(limit, limit * 2 - 1)}…`
}

export function getAcademicChartExportSize(material = {}, options = {}) {
  const width = options.width || MEETING_CHART_EXPORT.width
  if (material.chartType === 'rate-heatmap') {
    const rowCount = Math.max(1, (material.yCategories || []).length)
    return {
      width,
      height: options.height || Math.max(options.minHeight || MEETING_CHART_EXPORT.minHeight, 420 + rowCount * 30),
      legendRows: 0,
      legendHeight: 0,
      gridTop: options.gridTop || 132,
      gridBottom: 150,
    }
  }
  const count = seriesCount(material)
  const itemsPerRow = options.itemsPerLegendRow || MEETING_CHART_EXPORT.itemsPerLegendRow
  const legendRows = Math.max(1, Math.ceil(count / itemsPerRow))
  const hasWrappedLegend = (material.series || []).some(item => safeText(item.name).length > 18)
  const legendRowHeight = hasWrappedLegend ? 76 : 48
  const legendHeight = Math.max(44, legendRows * legendRowHeight)
  const height = options.height || Math.max(options.minHeight || MEETING_CHART_EXPORT.minHeight, 770 + legendHeight)
  return {
    width,
    height,
    legendRows,
    legendHeight,
    gridTop: options.gridTop || 132,
    gridBottom: legendHeight + 112,
  }
}

export function getWordChartTransformation(material = {}, options = {}) {
  const size = getAcademicChartExportSize(material, options)
  const width = options.wordWidth || MEETING_CHART_EXPORT.wordWidth
  const height = Math.round(width * size.height / size.width)
  const scale = Math.min(1, (options.maxWordHeight || 700) / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function axisNameStyle(exportMode = false) {
  return {
    color: '#1f2d38',
    fontFamily: CHART_FONT,
    fontSize: exportMode ? 28 : 12,
    fontWeight: exportMode ? 600 : 400,
  }
}

function axisLabelStyle(exportMode = false) {
  return {
    color: '#2f3a43',
    fontFamily: CHART_FONT,
    fontSize: exportMode ? 26 : 10,
    margin: exportMode ? 14 : 8,
    hideOverlap: true,
  }
}

function axisLine() {
  return { lineStyle: { color: AXIS_LINE, width: 1.2 } }
}

function buildLegend(material, exportMode, size) {
  if (!exportMode) {
    return {
      type: 'scroll',
      top: 40,
      left: 54,
      right: 28,
      itemWidth: 22,
      itemHeight: 9,
      itemGap: 14,
      pageIconColor: ACADEMIC_COLORS[0],
      pageTextStyle: { color: '#5a6470', fontFamily: CHART_FONT, fontSize: 11 },
      textStyle: { color: '#34495a', fontFamily: CHART_FONT, fontSize: 11 },
    }
  }

  return {
    type: 'plain',
    orient: 'horizontal',
    left: 110,
    right: 110,
    bottom: 52,
    height: size.legendHeight,
    selectedMode: false,
    itemWidth: 36,
    itemHeight: 10,
    itemGap: 22,
    formatter: name => wrapLegendName(name),
    textStyle: {
      color: '#202327',
      fontFamily: CHART_FONT,
      fontSize: 28,
      lineHeight: 34,
    },
  }
}

function baseOption(material, { exportMode = false, size = null } = {}) {
  const exportSize = size || getAcademicChartExportSize(material)
  return {
    animation: !exportMode,
    color: ACADEMIC_COLORS,
    backgroundColor: '#ffffff',
    title: {
      text: material.title || '',
      left: 'center',
      top: exportMode ? 26 : 8,
      itemGap: exportMode ? 12 : 6,
      subtext: exportMode && material.subtitle ? material.subtitle : '',
      textStyle: {
        color: '#151b20',
        fontFamily: CHART_FONT,
        fontSize: exportMode ? 26 : 16,
        fontWeight: 600,
      },
      subtextStyle: {
        color: '#505b64',
        fontFamily: CHART_FONT,
        fontSize: exportMode ? 15 : 11,
      },
    },
    legend: buildLegend(material, exportMode, exportSize),
    tooltip: {
      trigger: material.chartType === 'depth-profile' ? 'item' : 'axis',
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#87919b',
      borderWidth: 1,
      textStyle: { color: '#202327', fontFamily: CHART_FONT, fontSize: 12 },
    },
    grid: {
      left: exportMode ? 116 : 72,
      right: exportMode ? 86 : 38,
      top: exportMode ? exportSize.gridTop : 82,
      bottom: exportMode ? exportSize.gridBottom : 60,
      containLabel: false,
    },
    // 数据来源属于报告元数据，不直接压印在科研图件中。
    graphic: undefined,
  }
}

function makeReferenceLines(material) {
  return (material.referenceLines || []).map(value => ({
    yAxis: value,
    name: `${material.referenceLabel || '参考值'} ${value > 0 ? '+' : ''}${value}`,
    lineStyle: { color: '#b33a32', type: 'dashed', width: 1.3 },
    label: {
      show: true,
      formatter: '{b}',
      color: '#8d3c31',
      fontFamily: CHART_FONT,
      fontSize: 12,
    },
  }))
}

function normalizeSeries(material, exportMode = false) {
  const markLineData = makeReferenceLines(material)
  const threshold = Math.max(...(material.referenceLines || []).map(value => Math.abs(Number(value))).filter(Number.isFinite), 0)
  return (material.series || []).map((item, index) => {
    const color = ACADEMIC_COLORS[index % ACADEMIC_COLORS.length]
    const exceedancePoints = threshold > 0
      ? (item.data || []).filter(value => Math.abs(Number(value?.[1])) >= threshold)
      : []
    return {
      name: item.name,
      type: item.type || 'line',
      yAxisIndex: item.axis || 0,
      data: item.data || [],
      showSymbol: exportMode || (item.data || []).length <= 24,
      symbolSize: exportMode ? 6 : 4,
      connectNulls: Boolean(material.connectNulls),
      smooth: false,
      barMaxWidth: exportMode ? 22 : 18,
      lineStyle: {
        color,
        width: exportMode ? (item.riskLevel === 'exceeded' ? 3 : 2.2) : (item.riskLevel === 'exceeded' ? 2.2 : 1.6),
        type: item.lineType || 'solid',
      },
      itemStyle: {
        color,
        borderColor: '#ffffff',
        borderWidth: exportMode ? 1 : 0,
      },
      emphasis: { focus: 'series' },
      markLine: index === 0 && markLineData.length ? { silent: true, symbol: 'none', data: markLineData } : undefined,
      markPoint: exceedancePoints.length
        ? {
            silent: true,
            symbol: 'diamond',
            symbolSize: exportMode ? 15 : 10,
            label: { show: false },
            itemStyle: { color: '#b3261e', borderColor: '#ffffff', borderWidth: 1 },
            data: exceedancePoints.map(value => ({ coord: value })),
          }
        : undefined,
    }
  })
}

export function buildAcademicChartOption(material = {}, options = {}) {
  const exportMode = Boolean(options.exportMode)
  const size = options.size || getAcademicChartExportSize(material, options)
  const base = baseOption(material, { exportMode, size })

  if (material.chartType === 'rate-heatmap') {
    const min = Number(material.visualMin ?? -2)
    const max = Number(material.visualMax ?? 2)
    return {
      ...base,
      legend: undefined,
      tooltip: {
        position: 'top',
        formatter: params => `${params.value?.[1]}<br/>${params.value?.[0]}<br/>变化速率：${params.value?.[2]} mm/d`,
      },
      grid: {
        left: exportMode ? 180 : 112,
        right: exportMode ? 88 : 44,
        top: exportMode ? size.gridTop : 70,
        bottom: exportMode ? 150 : 96,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        name: material.xName || '监测日期',
        nameLocation: 'middle',
        nameGap: exportMode ? 54 : 42,
        data: material.xCategories || [],
        axisLine: axisLine(),
        axisLabel: { ...axisLabelStyle(exportMode), rotate: exportMode ? 35 : 45 },
        nameTextStyle: axisNameStyle(exportMode),
        splitArea: { show: true, areaStyle: { color: ['#ffffff', '#f7f9fa'] } },
      },
      yAxis: {
        type: 'category',
        name: material.yName || '监测点',
        nameLocation: 'middle',
        nameGap: exportMode ? 110 : 78,
        data: material.yCategories || [],
        axisLine: axisLine(),
        axisLabel: axisLabelStyle(exportMode),
        nameTextStyle: axisNameStyle(exportMode),
        splitArea: { show: true, areaStyle: { color: ['#ffffff', '#f7f9fa'] } },
      },
      visualMap: {
        min,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: exportMode ? 28 : 12,
        itemWidth: exportMode ? 360 : 220,
        itemHeight: exportMode ? 24 : 16,
        text: [`+${max} mm/d`, `${min} mm/d`],
        textStyle: { color: '#39444d', fontFamily: CHART_FONT, fontSize: exportMode ? 18 : 10 },
        inRange: { color: ['#2166ac', '#8db5cc', '#f7f7f7', '#e6a093', '#b2182b'] },
      },
      series: [{
        name: material.series?.[0]?.name || '变化速率',
        type: 'heatmap',
        data: material.series?.[0]?.data || [],
        progressive: 1000,
        itemStyle: { borderColor: '#ffffff', borderWidth: exportMode ? 1.2 : 0.7 },
        emphasis: { itemStyle: { borderColor: '#20262b', borderWidth: 1.5 } },
      }],
    }
  }

  if (material.chartType === 'depth-profile') {
    const profileSeries = material.series || []
    const latestIndex = profileSeries.findIndex(item => item.isLatest)
    const resolvedLatestIndex = latestIndex >= 0 ? latestIndex : profileSeries.length - 1
    const referenceLines = (material.referenceLinesX || []).map(value => ({
      xAxis: value,
      name: value === 0 ? '零线' : `${value > 0 ? '+' : ''}${value} mm`,
      lineStyle: {
        color: value === 0 ? '#626b73' : '#b44a41',
        type: value === 0 ? 'solid' : 'dashed',
        width: value === 0 ? 1.1 : 1.2,
      },
      label: {
        show: exportMode && value !== 0,
        formatter: '{b}',
        color: '#8b3933',
        fontFamily: CHART_FONT,
        fontSize: exportMode ? 18 : 10,
        position: 'insideEndTop',
      },
    }))
    return {
      ...base,
      legend: {
        ...base.legend,
        formatter: name => name,
        textStyle: {
          ...base.legend.textStyle,
          fontSize: exportMode ? 22 : 11,
          lineHeight: exportMode ? 28 : 16,
        },
      },
      tooltip: {
        trigger: 'item',
        formatter: params => `${params.seriesName}<br/>位移：${params.value?.[0]} mm<br/>深度：${params.value?.[1]} m`,
      },
      xAxis: {
        type: 'value',
        name: material.xName || '累计位移 (mm)',
        min: Number.isFinite(Number(material.xMin)) ? Number(material.xMin) : undefined,
        max: Number.isFinite(Number(material.xMax)) ? Number(material.xMax) : undefined,
        nameLocation: 'middle',
        nameGap: exportMode ? 48 : 34,
        nameTextStyle: axisNameStyle(exportMode),
        axisLine: axisLine(),
        axisLabel: axisLabelStyle(exportMode),
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed', width: exportMode ? 1 : 0.8 } },
      },
      yAxis: {
        type: 'value',
        inverse: material.inverseY !== false,
        name: material.yName || '深度 (m)',
        nameLocation: 'middle',
        nameGap: exportMode ? 64 : 46,
        nameTextStyle: axisNameStyle(exportMode),
        axisLine: axisLine(),
        axisLabel: axisLabelStyle(exportMode),
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed', width: exportMode ? 1 : 0.8 } },
      },
      series: profileSeries.map((item, index) => {
        const isLatest = index === resolvedLatestIndex || item.isLatest
        const isBaseline = item.isBaseline || index === 0
        const historyIndex = Math.min(
          DEPTH_HISTORY_COLORS.length - 1,
          Math.round(index / Math.max(1, profileSeries.length - 1) * (DEPTH_HISTORY_COLORS.length - 1))
        )
        const color = isLatest
          ? DEPTH_LATEST_COLOR
          : isBaseline
            ? DEPTH_BASELINE_COLOR
            : DEPTH_HISTORY_COLORS[historyIndex]
        return {
          name: item.name,
          type: 'line',
          data: item.data,
          showSymbol: false,
          smooth: false,
          lineStyle: {
            color,
            width: exportMode ? (isLatest ? 4 : isBaseline ? 2.6 : 2) : (isLatest ? 2.6 : 1.4),
            type: isBaseline && !isLatest ? 'dashed' : 'solid',
            opacity: isLatest || isBaseline ? 1 : 0.82,
          },
          itemStyle: { color },
          emphasis: { focus: 'series', lineStyle: { width: exportMode ? 5 : 3.2, opacity: 1 } },
          z: isLatest ? 10 : isBaseline ? 5 : 2,
          markLine: isLatest && referenceLines.length
            ? { silent: true, symbol: 'none', data: referenceLines }
            : undefined,
        }
      }),
    }
  }

  const isOverlay = material.chartType === 'rainfall-overlay'
  const yAxis = [{
    type: 'value',
    name: material.yName || '监测值',
    nameLocation: 'middle',
    nameGap: exportMode ? 62 : 48,
    nameTextStyle: axisNameStyle(exportMode),
    axisLine: { show: true, ...axisLine() },
    axisLabel: axisLabelStyle(exportMode),
    splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed', width: exportMode ? 1 : 0.8 } },
    scale: !isOverlay,
  }]

  if (isOverlay) {
    yAxis.push({
      type: 'value',
      name: material.yNameSecondary || '日雨量 (mm)',
      inverse: true,
      min: 0,
      nameTextStyle: axisNameStyle(exportMode),
      axisLine: { show: true, ...axisLine() },
      axisLabel: axisLabelStyle(exportMode),
      splitLine: { show: false },
    })
  }

  return {
    ...base,
    xAxis: {
      type: 'time',
      name: material.xName || '日期',
      nameLocation: 'middle',
      nameGap: exportMode ? 44 : 32,
      nameTextStyle: axisNameStyle(exportMode),
      axisLine: axisLine(),
      axisLabel: axisLabelStyle(exportMode),
      splitLine: { show: false },
    },
    yAxis,
    dataZoom: exportMode ? undefined : [{ type: 'inside', filterMode: 'none' }],
    series: normalizeSeries(material, exportMode),
  }
}

export async function renderAcademicChartImage(material, options = {}) {
  const exportMode = options.exportMode !== false
  const size = getAcademicChartExportSize(material, options)
  const width = options.width || size.width
  const height = options.height || size.height
  const pixelRatio = options.pixelRatio || MEETING_CHART_EXPORT.pixelRatio
  const container = document.createElement('div')
  Object.assign(container.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    background: '#fff',
  })
  document.body.appendChild(container)
  const chart = echarts.init(container, null, { renderer: 'canvas', width, height })
  chart.setOption(buildAcademicChartOption(material, { ...options, exportMode, size }), {
    notMerge: true,
    lazyUpdate: false,
  })
  await new Promise(resolve => setTimeout(resolve, 120))
  const imageUrl = chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#fff' })
  chart.dispose()
  container.remove()
  return imageUrl
}
