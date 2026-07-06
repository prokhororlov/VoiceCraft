import fs from 'fs'
import path from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { promisify } from 'util'
import { exec, spawn } from 'child_process'
import { getEmbeddedPythonPath, getEmbeddedPythonExe, getEnginePythonPath, getEnginePythonExe, getCachePath } from './paths'
import { downloadFile, extractZip } from './utils'
import type { SetupProgress, AcceleratorType } from './types'

const execAsync = promisify(exec)

// Run command with spawn for better reliability on Windows
function runCommand(command: string, args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    const timeout = options.timeout || 180000
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`Command timed out after ${timeout}ms`))
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDirectoryWithRetries(targetPath: string): Promise<void> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await sleep(attempt * 750)
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Python environment is locked and cannot be replaced: ${targetPath}. Close VoiceCraft/TTS/Python processes and try again. ${message}`)
}

// Embedded Python configuration - using Python 3.11 for Coqui TTS compatibility
// Coqui TTS 0.22.0 requires Python >=3.9.0,<3.12
const EMBEDDED_PYTHON_VERSION = '3.11.9'
const EMBEDDED_PYTHON_URL = `https://www.python.org/ftp/python/${EMBEDDED_PYTHON_VERSION}/python-${EMBEDDED_PYTHON_VERSION}-embed-amd64.zip`
// Python development files (headers and libs) for compiling C extensions
const PYTHON_DEV_URL = `https://www.nuget.org/api/v2/package/python/${EMBEDDED_PYTHON_VERSION}`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

// Check if embedded Python is installed and working
export function checkEmbeddedPythonInstalled(): boolean {
  const pythonExe = getEmbeddedPythonExe()
  const pipDir = path.join(getEmbeddedPythonPath(), 'Lib', 'site-packages', 'pip')
  return existsSync(pythonExe) && existsSync(pipDir)
}

// Install embedded Python with pip (packages install directly, no venv needed)
export async function installEmbeddedPython(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const pythonPath = getEmbeddedPythonPath()
  const pythonExe = getEmbeddedPythonExe()
  const zipPath = path.join(pythonPath, 'python-embed.zip')
  const getPipPath = path.join(pythonPath, 'get-pip.py')

  try {
    // Create directory
    if (!existsSync(pythonPath)) {
      mkdirSync(pythonPath, { recursive: true })
    }

    // Download embedded Python
    onProgress({
      stage: 'python',
      progress: 0,
      details: 'Downloading embedded Python...'
    })

    await downloadFile(EMBEDDED_PYTHON_URL, zipPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 40)
      onProgress({
        stage: 'python',
        progress: percent,
        details: `Downloading Python ${EMBEDDED_PYTHON_VERSION}... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })

    // Extract
    onProgress({
      stage: 'python',
      progress: 45,
      details: 'Extracting Python...'
    })

    await extractZip(zipPath, pythonPath)

    // Clean up zip
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }

    // Enable site-packages by modifying python*._pth file
    onProgress({
      stage: 'python',
      progress: 50,
      details: 'Configuring Python...'
    })

    const pthFiles = fs.readdirSync(pythonPath).filter(f => f.endsWith('._pth'))
    for (const pthFile of pthFiles) {
      const pthPath = path.join(pythonPath, pthFile)
      let content = fs.readFileSync(pthPath, 'utf-8')
      // Uncomment import site
      if (content.includes('#import site')) {
        content = content.replace('#import site', 'import site')
      } else if (!content.includes('import site')) {
        content += '\nimport site\n'
      }
      // Add Lib/site-packages path
      if (!content.includes('Lib/site-packages')) {
        content += '\nLib/site-packages\n'
      }
      fs.writeFileSync(pthPath, content, 'utf-8')
    }

    // Create Lib/site-packages directory
    const sitePackagesPath = path.join(pythonPath, 'Lib', 'site-packages')
    if (!existsSync(sitePackagesPath)) {
      mkdirSync(sitePackagesPath, { recursive: true })
    }

    // Download get-pip.py
    onProgress({
      stage: 'python',
      progress: 55,
      details: 'Downloading pip installer...'
    })

    await downloadFile(GET_PIP_URL, getPipPath)

    // Install pip
    onProgress({
      stage: 'python',
      progress: 60,
      details: 'Installing pip...'
    })

    await execAsync(`"${pythonExe}" "${getPipPath}" --target "${sitePackagesPath}" --no-warn-script-location`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10,
      cwd: pythonPath
    })

    // Clean up get-pip.py
    if (existsSync(getPipPath)) {
      unlinkSync(getPipPath)
    }

    // Verify pip installation
    onProgress({
      stage: 'python',
      progress: 90,
      details: 'Verifying pip installation...'
    })

    const { stdout } = await execAsync(`"${pythonExe}" -m pip --version`, { timeout: 30000 })
    if (!stdout.includes('pip')) {
      return { success: false, error: 'Failed to install pip' }
    }

    // Upgrade pip and setuptools to latest stable versions
    onProgress({
      stage: 'python',
      progress: 95,
      details: 'Upgrading pip and setuptools...'
    })

    await execAsync(`"${pythonExe}" -m pip install --upgrade pip setuptools wheel --no-warn-script-location`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10
    })

    onProgress({
      stage: 'python',
      progress: 100,
      details: 'Embedded Python installed successfully!'
    })

    return { success: true }
  } catch (error) {
    // Clean up on error
    try {
      if (existsSync(zipPath)) unlinkSync(zipPath)
      if (existsSync(getPipPath)) unlinkSync(getPipPath)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: (error as Error).message }
  }
}

// Check if system Python is available (checks embedded first, then system)
export async function checkPythonAvailable(): Promise<string | null> {
  // Only use embedded Python - simpler and more reliable
  if (!checkEmbeddedPythonInstalled()) {
    return null
  }

  const embeddedExe = getEmbeddedPythonExe()
  try {
    const { stdout, stderr } = await execAsync(`"${embeddedExe}" --version`, { timeout: 5000 })
    const output = stdout + stderr
    if (output.includes('Python 3')) {
      return embeddedExe
    }
  } catch {
    // Embedded Python check failed
  }

  return null
}

// Check if Python is available (system or embedded) - returns info about which one
export async function getPythonInfo(): Promise<{ available: boolean; path: string | null; isEmbedded: boolean; version: string | null }> {
  // Only use embedded Python
  if (!checkEmbeddedPythonInstalled()) {
    return { available: false, path: null, isEmbedded: false, version: null }
  }

  const embeddedExe = getEmbeddedPythonExe()
  try {
    const { stdout, stderr } = await execAsync(`"${embeddedExe}" --version`, { timeout: 5000 })
    const output = stdout + stderr
    const match = output.match(/Python (\d+\.\d+\.\d+)/)
    if (match) {
      return { available: true, path: embeddedExe, isEmbedded: true, version: match[1] }
    }
  } catch {
    // Failed
  }

  return { available: false, path: null, isEmbedded: false, version: null }
}

// Check if Python is installed for specific engine+accelerator
export function checkEnginePythonInstalled(engine: 'silero' | 'coqui', accelerator: AcceleratorType): boolean {
  const pythonExe = getEnginePythonExe(engine, accelerator)
  const pythonPath = getEnginePythonPath(engine, accelerator)
  const pipDir = path.join(pythonPath, 'Lib', 'site-packages', 'pip')
  return existsSync(pythonExe) && existsSync(pipDir)
}

// Install fresh embedded Python directly to engine-specific directory (silero-cpu/python, coqui-cuda/python, etc.)
// This provides complete isolation for each accelerator version with clean dependencies
export async function copyPythonForEngine(
  engine: 'silero' | 'coqui',
  accelerator: AcceleratorType,
  onProgress?: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const targetPath = getEnginePythonPath(engine, accelerator)
  const targetExe = getEnginePythonExe(engine, accelerator)

  // If already exists and working, skip
  if (existsSync(targetExe)) {
    try {
      const { stdout, stderr } = await runCommand(targetExe, ['--version'], { timeout: 5000 })
      const output = stdout + stderr
      if (output.includes('Python 3')) {
        // Also verify pip works
        const pipCheck = await runCommand(targetExe, ['-m', 'pip', '--version'], { timeout: 10000 })
        if (pipCheck.stdout.includes('pip')) {
          onProgress?.({
            stage: 'python',
            progress: 100,
            details: 'Python already installed for this configuration'
          })
          return { success: true }
        }
      }
    } catch {
      // Python exists but doesn't work, need to reinstall
    }
  }

  // Use cache directory for downloads
  const cachePath = getCachePath()
  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true })
  }

  // Cached file paths
  const cachedZipPath = path.join(cachePath, `python-${EMBEDDED_PYTHON_VERSION}-embed.zip`)
  const cachedDevZipPath = path.join(cachePath, `python-${EMBEDDED_PYTHON_VERSION}-dev.nupkg`)

  const getPipPath = path.join(targetPath, 'get-pip.py')

  try {
    onProgress?.({
      stage: 'python',
      progress: 0,
      details: 'Installing fresh Python environment...'
    })

    // Remove existing directory if corrupt
    if (existsSync(targetPath)) {
      await removeDirectoryWithRetries(targetPath)
    }

    // Create target directory
    mkdirSync(targetPath, { recursive: true })

    // Download embedded Python (or use cached)
    if (existsSync(cachedZipPath)) {
      onProgress?.({
        stage: 'python',
        progress: 25,
        details: 'Using cached Python archive...'
      })
    } else {
      onProgress?.({
        stage: 'python',
        progress: 5,
        details: 'Downloading Python...'
      })

      await downloadFile(EMBEDDED_PYTHON_URL, cachedZipPath, (downloaded, total) => {
        const percent = Math.round((downloaded / total) * 20) + 5
        onProgress?.({
          stage: 'python',
          progress: percent,
          details: `Downloading Python... ${Math.round(downloaded / 1024 / 1024)}MB`
        })
      })
    }

    // Extract embedded Python
    onProgress?.({
      stage: 'python',
      progress: 28,
      details: 'Extracting Python...'
    })

    await extractZip(cachedZipPath, targetPath)

    // Verify python.exe was extracted
    if (!existsSync(targetExe)) {
      return { success: false, error: 'Python extraction failed - python.exe not found' }
    }

    // Download Python dev files (headers for compiling C extensions) - or use cached
    if (existsSync(cachedDevZipPath)) {
      onProgress?.({
        stage: 'python',
        progress: 40,
        details: 'Using cached dev files...'
      })
    } else {
      onProgress?.({
        stage: 'python',
        progress: 30,
        details: 'Downloading Python development files...'
      })

      await downloadFile(PYTHON_DEV_URL, cachedDevZipPath, (downloaded, total) => {
        const percent = Math.round((downloaded / total) * 10) + 30
        onProgress?.({
          stage: 'python',
          progress: percent,
          details: `Downloading dev files... ${Math.round(downloaded / 1024 / 1024)}MB`
        })
      })
    }

    // Extract dev files (nuget package contains tools/include and tools/libs)
    onProgress?.({
      stage: 'python',
      progress: 42,
      details: 'Extracting development files...'
    })

    const devTempPath = path.join(targetPath, '_dev_temp')
    await extractZip(cachedDevZipPath, devTempPath)

    // Copy include folder from nuget package
    const nugetIncludePath = path.join(devTempPath, 'tools', 'include')
    const targetIncludePath = path.join(targetPath, 'include')
    if (existsSync(nugetIncludePath)) {
      fs.cpSync(nugetIncludePath, targetIncludePath, { recursive: true })
    }

    // Copy libs folder from nuget package
    const nugetLibsPath = path.join(devTempPath, 'tools', 'libs')
    const targetLibsPath = path.join(targetPath, 'libs')
    if (existsSync(nugetLibsPath)) {
      fs.cpSync(nugetLibsPath, targetLibsPath, { recursive: true })
    }

    // Clean up dev temp files (keep cached archives)
    fs.rmSync(devTempPath, { recursive: true, force: true })

    // Enable site-packages by modifying python*._pth file
    onProgress?.({
      stage: 'python',
      progress: 50,
      details: 'Configuring Python...'
    })

    const pthFiles = fs.readdirSync(targetPath).filter(f => f.endsWith('._pth'))
    for (const pthFile of pthFiles) {
      const pthPath = path.join(targetPath, pthFile)
      let content = fs.readFileSync(pthPath, 'utf-8')
      if (content.includes('#import site')) {
        content = content.replace('#import site', 'import site')
      } else if (!content.includes('import site')) {
        content += '\nimport site\n'
      }
      if (!content.includes('Lib/site-packages')) {
        content += '\nLib/site-packages\n'
      }
      fs.writeFileSync(pthPath, content, 'utf-8')
    }

    // Create Lib/site-packages directory
    const sitePackagesPath = path.join(targetPath, 'Lib', 'site-packages')
    if (!existsSync(sitePackagesPath)) {
      mkdirSync(sitePackagesPath, { recursive: true })
    }

    // Download get-pip.py
    onProgress?.({
      stage: 'python',
      progress: 55,
      details: 'Downloading pip...'
    })

    await downloadFile(GET_PIP_URL, getPipPath)

    // Install pip
    onProgress?.({
      stage: 'python',
      progress: 60,
      details: 'Installing pip...'
    })

    await runCommand(targetExe, [getPipPath, '--no-warn-script-location'], {
      timeout: 180000,
      cwd: targetPath
    })

    // Clean up get-pip.py
    if (existsSync(getPipPath)) {
      unlinkSync(getPipPath)
    }

    // Install latest stable setuptools
    onProgress?.({
      stage: 'python',
      progress: 80,
      details: 'Installing setuptools...'
    })

    await runCommand(targetExe, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', '--no-warn-script-location'], {
      timeout: 180000
    })

    // Verify installation
    onProgress?.({
      stage: 'python',
      progress: 95,
      details: 'Verifying installation...'
    })

    const { stdout, stderr } = await runCommand(targetExe, ['--version'], { timeout: 5000 })
    const output = stdout + stderr
    if (!output.includes('Python 3')) {
      return { success: false, error: 'Python installation verification failed' }
    }

    onProgress?.({
      stage: 'python',
      progress: 100,
      details: 'Python environment ready'
    })

    return { success: true }
  } catch (error) {
    // Clean up on error (keep cached files for retry)
    try {
      if (existsSync(getPipPath)) unlinkSync(getPipPath)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: (error as Error).message }
  }
}
