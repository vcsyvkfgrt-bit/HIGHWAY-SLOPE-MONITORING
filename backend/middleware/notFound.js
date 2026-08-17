function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl,
  })
}

module.exports = notFound
