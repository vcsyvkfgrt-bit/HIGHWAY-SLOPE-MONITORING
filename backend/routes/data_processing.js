const express = require('express')
const multer = require('multer')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const AdmZip = require('adm-zip')
const auth = require('../middleware/auth')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 21 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, ['.xlsx', '.xlsm', '.xls'].includes(ext))
  },
})

const SCRIPT_ROOT = process.env.SLOPE_PROCESSING_SCRIPT_ROOT || 'H:\\codex\\兴长数据处理'
const scripts = {
  '1': path.join(SCRIPT_ROOT, '土建一标数据处理.py'),
  '2': path.join(SCRIPT_ROOT, '土建二标数据处理.py'),
  '3': path.join(SCRIPT_ROOT, '土建三标数据处理.py'),
}

function safeName(name, fallback = 'data.xlsx') {
  const ext = path.extname(name)
  const stem = path.basename(name, ext).replace(/[^\u4e00-\u9fa5a-zA-Z0-9._-]/g, '_') || 'data'
  return `${stem}${ext || '.xlsx'}`
}

function runPython(script, args, cwd) {
  const python = process.env.PYTHON_BIN || 'python'
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`处理脚本退出码 ${code}\n${stderr || stdout}`))
    })
  })
}

router.post('/run', auth, upload.fields([
  { name: 'files', maxCount: 20 },
  { name: 'template', maxCount: 1 },
]), async (req, res) => {
  const segment = String(req.body.segment || '')
  if (!scripts[segment]) return res.status(400).json({ success: false, message: '请选择有效的标段' })
  const files = req.files?.files || []
  const template = req.files?.template?.[0]
  if (!files.length) return res.status(400).json({ success: false, message: '请至少上传一个原始 Excel 文件' })
  if (segment !== '3' && !template) return res.status(400).json({ success: false, message: '标段一、二需要同时上传录入模板 Excel' })

  const jobDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'slope-processing-'))
  const inputDir = path.join(jobDir, 'input')
  const outputDir = path.join(jobDir, 'output')
  await fsp.mkdir(inputDir)
  try {
    for (const [index, file] of files.entries()) {
      let name = safeName(file.originalname)
      // 标段一脚本按“原始数据处理*.xlsx”扫描目录。
      if (segment === '1' && !name.startsWith('原始数据处理')) name = `原始数据处理-${index + 1}-${name}`
      await fsp.writeFile(path.join(inputDir, name), file.buffer)
    }
    let templatePath = ''
    if (template) {
      templatePath = path.join(jobDir, safeName(template.originalname, '监测数据录入模板.xlsx'))
      await fsp.writeFile(templatePath, template.buffer)
    }
    const args = ['--input-dir', inputDir, '--output-dir', outputDir]
    if (segment !== '3') args.push('--template', templatePath)
    const result = await runPython(scripts[segment], args, SCRIPT_ROOT)

    const zip = new AdmZip()
    const addDir = (dir, prefix = '') => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        const rel = path.join(prefix, entry.name)
        if (entry.isDirectory()) addDir(full, rel)
        else zip.addLocalFile(full, prefix)
      }
    }
    addDir(outputDir)
    const zipBuffer = zip.toBuffer()
    const segmentName = `土建${segment}标`
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(`${segmentName}-数据处理结果.zip`)}"`,
      'X-Processing-Log': Buffer.from(result.stdout.slice(-2000), 'utf8').toString('base64'),
    })
    return res.send(zipBuffer)
  } catch (error) {
    console.error('[data-processing]', error)
    return res.status(500).json({ success: false, message: error.message || '数据处理失败' })
  } finally {
    fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {})
  }
})

router.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: '单个文件不能超过 200MB' })
  res.status(400).json({ success: false, message: error.message || '文件上传失败' })
})

module.exports = router
