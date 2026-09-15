const express = require('express')
const cors = require('cors')
const path = require('path')

const operationLog = require('./middleware/operationLog')
const attachApiResponse = require('./utils/apiResponse')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')

function createApp() {
  const app = express()
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '100mb'

  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: jsonBodyLimit }))
  app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }))
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
  app.use(attachApiResponse)
  app.use(operationLog)

  app.get('/health', (_req, res) => {
    res.json({ ok: true, success: true })
  })

  return app
}

function finalizeApp(app) {
  app.use(notFound)
  app.use(errorHandler)
  return app
}

module.exports = {
  createApp,
  finalizeApp,
}
