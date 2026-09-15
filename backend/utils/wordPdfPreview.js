const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

async function convertWordToPdf(inputPath, outputPath) {
  if (process.platform !== 'win32') {
    throw new Error('当前服务器未配置 Word/PDF 转换器')
  }

  const scriptPath = path.resolve(__dirname, '..', 'scripts', 'convert-word-to-pdf.ps1')
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    inputPath,
    outputPath,
  ], {
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  })
}

module.exports = { convertWordToPdf }
