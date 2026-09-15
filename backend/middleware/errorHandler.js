function errorHandler(error, req, res, _next) {
  console.error('未处理的接口异常:', error)

  if (res.headersSent) {
    return
  }

  const isPayloadTooLarge = error?.type === 'entity.too.large' || error?.status === 413
  res.status(isPayloadTooLarge ? 413 : (error.status || 500)).json({
    success: false,
    message: isPayloadTooLarge
      ? '报告内容过大，请刷新页面后重新生成；系统将自动压缩并重新绘制图表。'
      : (error.message || '服务器内部错误'),
  })
}

module.exports = errorHandler
