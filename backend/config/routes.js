const slopesRouter = require('../routes/slopes')
const pointsRouter = require('../routes/points')
const templatesRouter = require('../routes/templates')
const userRouter = require('../routes/user')
const monitoringDataRouter = require('../routes/monitoring_data')
const inspectionsRouter = require('../routes/inspections')
const projectsRouter = require('../routes/projects')
const alarmsRouter = require('../routes/alarms')
const operationLogsRouter = require('../routes/operation_logs')
const filesRouter = require('../routes/files')
const inclinometerDataRouter = require('../routes/inclinometer_data')
const slopeLedgerRouter = require('../routes/slope_ledger')
const reportsRouter = require('../routes/reports')
const slopeMapPositionsRouter = require('../routes/slope_map_positions')
const mapOverviewRouter = require('../routes/map_overview')
const weatherRainfallRouter = require('../routes/weather_rainfall')
const reportMaterialsRouter = require('../routes/report_materials')
const dataProcessingRouter = require('../routes/data_processing')
const standardsRouter = require('../routes/standards')

const dataRoutes = [
  ['/api/slopes', slopesRouter],
  ['/api/points', pointsRouter],
  ['/api/templates', templatesRouter],
  ['/api/monitoring-data', monitoringDataRouter],
  ['/api/inspections', inspectionsRouter],
  ['/api/projects', projectsRouter],
  ['/api/alarms', alarmsRouter],
  ['/api/operation-logs', operationLogsRouter],
  ['/api/files', filesRouter],
  ['/api/inclinometer-data', inclinometerDataRouter],
  ['/api/slope-ledger', slopeLedgerRouter],
  ['/api/slope-map-positions', slopeMapPositionsRouter],
  ['/api/map-overview', mapOverviewRouter],
  ['/api/weather-rainfall', weatherRainfallRouter],
  ['/api/report-materials', reportMaterialsRouter],
  ['/api/reports', reportsRouter],
  ['/api/data-processing', dataProcessingRouter],
  ['/api/standards', standardsRouter],
]

const appRoutes = [
  ['/api/user', userRouter],
  ['/api/templates', templatesRouter],
  ['/api/operation-logs', operationLogsRouter],
  ['/api/files', filesRouter],
]

function mountRoutes(app, routes) {
  routes.forEach(([path, router]) => {
    app.use(path, router)
  })
}

module.exports = {
  dataRoutes,
  appRoutes,
  mountRoutes,
}
