function errorHandler(error, req, res, _next) {
  console.error('未处理的接口异常:', error)

  if (res.headersSent) {
    return
  }

  res.status(error.status || 500).json({
    success: false,
    message: error.message || '服务器内部错误',
  })
}

module.exports = errorHandler
