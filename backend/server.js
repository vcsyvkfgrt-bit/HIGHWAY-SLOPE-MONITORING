const { createApp, finalizeApp } = require('./app')
const { appRoutes, dataRoutes, mountRoutes } = require('./config/routes')

const app3002 = createApp()
mountRoutes(app3002, dataRoutes)
finalizeApp(app3002)

const app3003 = createApp()
mountRoutes(app3003, appRoutes)
finalizeApp(app3003)

const PORT_3002 = Number(process.env.PORT_3002 || 3002)
const PORT_3003 = Number(process.env.PORT_3003 || 3003)

app3002.listen(PORT_3002, () => {
  console.log(`[backend] listening on http://localhost:${PORT_3002}`)
})

app3003.listen(PORT_3003, () => {
  console.log(`[backend] listening on http://localhost:${PORT_3003}`)
})
