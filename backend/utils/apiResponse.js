function attachApiResponse(req, res, next) {
  res.apiSuccess = (data = null, message = 'success', extra = {}) => {
    res.json({
      success: true,
      message,
      data,
      ...extra,
    })
  }

  res.apiError = (message = '服务器内部错误', status = 500, extra = {}) => {
    res.status(status).json({
      success: false,
      message,
      ...extra,
    })
  }

  next()
}

module.exports = attachApiResponse
