import fs from 'fs'
import path from 'path'
import { existsSync, mkdirSync, unlinkSync, rmSync, statSync } from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import type { SetupProgress, AcceleratorType, AcceleratorConfig } from './types'
import {
  getResourcesPath,
  getPiperResourcesPath,
  getFfmpegPath,
  getSileroPath,
  getCoquiPath,
  getSileroPathForAccelerator,
  getCoquiPathForAccelerator,
  setActiveAccelerator,
  getEmbeddedPythonPath,
  getEmbeddedPythonExe
} from './paths'
import {
  runPipWithProgress,
  downloadFile,
  extractZip,
  getGenerateScriptContent,
  getCoquiGenerateScriptContent,
  getTTSServerScriptContent,
  findVcvarsallPath
} from './utils'
import {
  checkEmbeddedPythonInstalled,
  installEmbeddedPython,
  checkPythonAvailable
} from './python'
import { checkDependencies } from './dependencies'
import { checkGPUToolkit } from './gpu'

const execAsync = promisify(exec)

// PyTorch URLs for different accelerators
const PYTORCH_INDEX_URLS: Partial<Record<AcceleratorType, string>> = {
  cpu: 'https://download.pytorch.org/whl/cpu',
  cuda: 'https://download.pytorch.org/whl/cu124'  // CUDA 12.4 for latest PyTorch
}

// Get accelerator config file path for a specific accelerator
function getAcceleratorConfigPath(engine: 'silero' | 'coqui', accelerator: AcceleratorType): string {
  const basePath = engine === 'silero'
    ? getSileroPathForAccelerator(accelerator)
    : getCoquiPathForAccelerator(accelerator)
  return path.join(basePath, 'accelerator.json')
}

// Save accelerator config
function saveAcceleratorConfig(engine: 'silero' | 'coqui', accelerator: AcceleratorType, pytorchVersion?: string): void {
  const config: AcceleratorConfig = {
    accelerator,
    installedAt: new Date().toISOString(),
    pytorchVersion
  }
  const configPath = getAcceleratorConfigPath(engine, accelerator)
  const dir = path.dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

  // Also set this as the active accelerator
  setActiveAccelerator(engine, accelerator)
}

// Check if Build Tools are available
export async function checkBuildToolsAvailable(): Promise<boolean> {
  // Helper function to check for cl.exe in MSVC path
  const checkMsvcPath = (msvcPath: string): boolean => {
    if (existsSync(msvcPath)) {
      try {
        const versions = fs.readdirSync(msvcPath)
        for (const version of versions) {
          const clPath = path.join(msvcPath, version, 'bin', 'Hostx64', 'x64', 'cl.exe')
          if (existsSync(clPath)) {
            return true
          }
        }
      } catch {
        // Ignore read errors
      }
    }
    return false
  }

  // Method 1: Use vswhere.exe to find Visual Studio installations with C++ tools
  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  ]

  for (const vswherePath of vswherePaths) {
    if (existsSync(vswherePath)) {
      try {
        // Query for installations with VC++ tools component
        const { stdout } = await execAsync(
          `"${vswherePath}" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
          { timeout: 10000 }
        )

        if (stdout.trim()) {
          const vsPath = stdout.trim()
          const msvcPath = path.join(vsPath, 'VC', 'Tools', 'MSVC')
          if (checkMsvcPath(msvcPath)) {
            return true
          }
        }
      } catch {
        // vswhere failed, continue to fallback
      }
    }
  }

  // Method 2: Direct path check for common VS/Build Tools installations
  const possibleMsvcPaths = [
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Tools\\MSVC',
  ]

  for (const msvcPath of possibleMsvcPaths) {
    if (checkMsvcPath(msvcPath)) {
      return true
    }
  }

  // Method 3: Try to run cl.exe directly (in case it's in PATH)
  try {
    await execAsync('where cl.exe', { timeout: 5000 })
    return true
  } catch {
    // cl.exe not in PATH
  }

  return false
}

// Download and install Visual Studio Build Tools
export async function installBuildTools(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string; requiresRestart?: boolean }> {
  const resourcesPath = getResourcesPath()
  const installerPath = path.join(resourcesPath, 'vs_buildtools.exe')

  try {
    // Create resources directory if it doesn't exist
    if (!existsSync(resourcesPath)) {
      mkdirSync(resourcesPath, { recursive: true })
    }

    onProgress({
      stage: 'buildtools',
      progress: 5,
      details: 'Downloading Visual Studio Build Tools installer...'
    })

    // Download the Visual Studio Build Tools installer
    const installerUrl = 'https://aka.ms/vs/17/release/vs_buildtools.exe'

    await new Promise<void>((resolve, reject) => {
      downloadFile(installerUrl, installerPath, (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 40) + 5 : 10
        onProgress({
          stage: 'buildtools',
          progress: percent,
          details: `Downloading installer... ${Math.round(downloaded / 1024 / 1024)}MB`
        })
      })
        .then(() => resolve())
        .catch(reject)
    })

    onProgress({
      stage: 'buildtools',
      progress: 50,
      details: 'Installing Visual Studio Build Tools (this may take 10-20 minutes)...'
    })

    // Run the installer silently with C++ workload
    const installCmd = `"${installerPath}" --quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`

    try {
      await execAsync(installCmd, {
        timeout: 3600000, // 1 hour timeout for installation
        maxBuffer: 1024 * 1024 * 10
      })
    } catch (installError) {
      // The installer might return non-zero exit code even on success
      const installed = await checkBuildToolsAvailable()
      if (!installed) {
        const errorMsg = (installError as Error).message
        if (errorMsg.includes('3010')) {
          // Exit code 3010 means success but requires restart
          onProgress({
            stage: 'buildtools',
            progress: 100,
            details: 'Build Tools installed! Computer restart required.'
          })
          return { success: true, requiresRestart: true }
        }
        throw installError
      }
    }

    // Cleanup installer
    try {
      unlinkSync(installerPath)
    } catch {
      // Ignore cleanup errors
    }

    // Verify installation
    onProgress({
      stage: 'buildtools',
      progress: 95,
      details: 'Verifying installation...'
    })

    const installed = await checkBuildToolsAvailable()
    if (!installed) {
      return {
        success: false,
        error: 'Build Tools installation completed but compiler not found. Please restart your computer and try again.'
      }
    }

    onProgress({
      stage: 'buildtools',
      progress: 100,
      details: 'Visual Studio Build Tools installed successfully!'
    })

    return { success: true }
  } catch (error) {
    // Cleanup on error
    try {
      if (existsSync(installerPath)) {
        unlinkSync(installerPath)
      }
    } catch {
      // Ignore cleanup errors
    }

    return { success: false, error: (error as Error).message }
  }
}

// Install Piper TTS
export async function installPiper(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const piperPath = getPiperResourcesPath()
  const binPath = path.join(piperPath, 'bin')
  const zipPath = path.join(piperPath, 'piper_windows_amd64.zip')

  const piperUrl = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'

  try {
    onProgress({
      stage: 'piper',
      progress: 0,
      details: 'Downloading Piper TTS...'
    })

    await downloadFile(piperUrl, zipPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 100)
      onProgress({
        stage: 'piper',
        progress: percent,
        details: `Downloading Piper TTS... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })

    onProgress({
      stage: 'piper',
      progress: 100,
      details: 'Extracting Piper TTS...'
    })

    await extractZip(zipPath, binPath)

    // Clean up zip
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Install FFmpeg
export async function installFfmpeg(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const ffmpegPath = getFfmpegPath()
  const zipPath = path.join(ffmpegPath, 'ffmpeg-essentials.zip')
  const tempPath = path.join(ffmpegPath, 'temp')

  // BtbN builds - official recommended source on ffmpeg.org
  const ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

  try {
    onProgress({
      stage: 'ffmpeg',
      progress: 0,
      details: 'Downloading FFmpeg...'
    })

    await downloadFile(ffmpegUrl, zipPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 100)
      onProgress({
        stage: 'ffmpeg',
        progress: percent,
        details: `Downloading FFmpeg... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })

    // Verify download size (should be ~100MB, reject if suspiciously small)
    const downloadedSize = statSync(zipPath).size
    const MIN_EXPECTED_SIZE = 50 * 1024 * 1024 // 50MB minimum
    if (downloadedSize < MIN_EXPECTED_SIZE) {
      unlinkSync(zipPath)
      throw new Error(`Downloaded file too small (${Math.round(downloadedSize / 1024 / 1024)}MB). Expected ~100MB. Please check your internet connection.`)
    }

    onProgress({
      stage: 'ffmpeg',
      progress: 100,
      details: 'Extracting FFmpeg...'
    })

    await extractZip(zipPath, tempPath)

    // Find ffmpeg.exe in extracted folder
    const findFfmpeg = async (dir: string): Promise<string | null> => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const found = await findFfmpeg(fullPath)
          if (found) return found
        } else if (entry.name === 'ffmpeg.exe') {
          return fullPath
        }
      }
      return null
    }

    const ffmpegExePath = await findFfmpeg(tempPath)
    if (ffmpegExePath) {
      fs.copyFileSync(ffmpegExePath, path.join(ffmpegPath, 'ffmpeg.exe'))
    }

    // Clean up
    if (existsSync(tempPath)) {
      rmSync(tempPath, { recursive: true })
    }
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Install Silero TTS (will auto-install embedded Python if system Python is not available)
export async function installSilero(
  onProgress: (progress: SetupProgress) => void,
  accelerator: AcceleratorType = 'cpu'
): Promise<{ success: boolean; error?: string }> {
  // Check if required toolkit is installed for GPU acceleration
  const toolkitCheck = checkGPUToolkit(accelerator)
  if (!toolkitCheck.available) {
    return { success: false, error: toolkitCheck.error }
  }

  // First ensure base embedded Python is installed
  if (!checkEmbeddedPythonInstalled()) {
    onProgress({
      stage: 'silero',
      progress: 0,
      details: 'Python not found. Installing embedded Python...'
    })

    const pythonResult = await installEmbeddedPython((p) => {
      // Scale embedded python progress to 0-10% of overall silero progress
      onProgress({
        stage: 'silero',
        progress: Math.round(p.progress * 0.10),
        details: p.details
      })
    })

    if (!pythonResult.success) {
      return {
        success: false,
        error: `Failed to install embedded Python: ${pythonResult.error}`
      }
    }
  }

  // Use accelerator-specific path (silero-cpu, silero-cuda)
  const sileroPath = getSileroPathForAccelerator(accelerator)

  // Import engine-specific Python functions
  const { copyPythonForEngine, checkEnginePythonInstalled } = await import('./python')
  const { getEnginePythonExe } = await import('./paths')

  // Get engine-specific Python path
  const enginePython = getEnginePythonExe('silero', accelerator)

  // Progress scaling
  const scaleProgress = (p: number) => Math.min(100, Math.round(p))

  try {
    // Create silero directory for this accelerator
    if (!existsSync(sileroPath)) {
      mkdirSync(sileroPath, { recursive: true })
    }

    // Copy Python to engine-specific directory if not already done
    if (!checkEnginePythonInstalled('silero', accelerator)) {
      onProgress({
        stage: 'silero',
        progress: scaleProgress(5),
        details: 'Copying Python environment...'
      })

      const copyResult = await copyPythonForEngine('silero', accelerator, (p) => {
        onProgress({
          stage: 'silero',
          progress: scaleProgress(5 + Math.round(p.progress * 0.03)),
          details: p.details
        })
      })

      if (!copyResult.success) {
        return { success: false, error: copyResult.error || 'Failed to copy Python environment' }
      }
    } else {
      onProgress({
        stage: 'silero',
        progress: scaleProgress(8),
        details: 'Using existing Python environment...'
      })
    }

    const targetPython = enginePython

    // Install PyTorch with selected accelerator
    const acceleratorLabel = accelerator === 'cuda' ? 'CUDA' : 'CPU'
    const downloadSize = accelerator === 'cuda' ? '~2.5 GB' : '~200 MB'
    onProgress({
      stage: 'silero',
      progress: scaleProgress(10),
      details: `Скачивание PyTorch ${acceleratorLabel} (${downloadSize})...`
    })

    // Build pip install command based on accelerator
    const pytorchPackages = 'torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1'
    const indexUrl = PYTORCH_INDEX_URLS[accelerator]
    const extraArgs: string[] = []

    const pytorchResult = await runPipWithProgress(
      targetPython,
      pytorchPackages,
      {
        indexUrl,
        extraArgs,
        timeout: accelerator === 'cpu' ? 600000 : 1800000, // 30 min for GPU versions
        onProgress: (info) => {
          const progress = scaleProgress(10 + Math.round((info.percentage || 0) * 0.5))
          let details = `Скачивание PyTorch ${acceleratorLabel} (${downloadSize})...`
          if (info.phase === 'downloading' && info.downloaded !== undefined && info.total !== undefined) {
            details = `Скачивание ${info.package}: ${info.downloaded.toFixed(0)}/${info.total.toFixed(0)} MB`
          } else if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Скачивание ${info.package}: ${info.percentage}%`
          } else if (info.phase === 'downloading') {
            details = `Скачивание ${info.package}...`
          } else if (info.phase === 'installing') {
            details = `Установка PyTorch...`
          }
          onProgress({ stage: 'silero', progress, details })
        }
      }
    )

    if (!pytorchResult.success) {
      return { success: false, error: pytorchResult.error || 'Failed to install PyTorch' }
    }


    // Install additional dependencies (60% to 85%)
    onProgress({
      stage: 'silero',
      progress: scaleProgress(60),
      details: 'Installing additional dependencies...'
    })

    const depsResult = await runPipWithProgress(
      targetPython,
      'omegaconf==2.3.0 numpy==1.26.4 scipy==1.14.1 flask==3.0.3 psutil==6.1.0',
      {
        timeout: 180000,
        onProgress: (info) => {
          const progress = scaleProgress(60 + Math.round((info.percentage || 0) * 0.25))
          let details = 'Установка зависимостей...'
          if (info.phase === 'downloading' && info.downloaded !== undefined && info.total !== undefined) {
            details = `Скачивание ${info.package}: ${info.downloaded.toFixed(0)}/${info.total.toFixed(0)} MB`
          } else if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Скачивание ${info.package}: ${info.percentage}%`
          }
          onProgress({ stage: 'silero', progress, details })
        }
      }
    )

    if (!depsResult.success) {
      return { success: false, error: depsResult.error || 'Failed to install dependencies' }
    }

    // Copy generate.py script
    onProgress({
      stage: 'silero',
      progress: scaleProgress(88),
      details: 'Setting up generation script...'
    })

    const generateScript = getGenerateScriptContent()
    fs.writeFileSync(path.join(sileroPath, 'generate.py'), generateScript, 'utf-8')

    // Copy TTS server script to tts_resources root
    const ttsServerScript = getTTSServerScriptContent()
    const ttsResourcesPath = path.dirname(sileroPath)
    fs.writeFileSync(path.join(ttsResourcesPath, 'tts_server.py'), ttsServerScript, 'utf-8')

    // Verify installation
    onProgress({
      stage: 'silero',
      progress: scaleProgress(94),
      details: 'Verifying installation...'
    })

    let verifyResult
    try {
      verifyResult = await execAsync(`"${targetPython}" -c "import torch; print('OK')"`, { timeout: 30000 })
    } catch (error: any) {
      const errorMsg = error.message || error.toString()

      // Check if error is due to missing CUDA runtime
      if (accelerator === 'cuda' && (errorMsg.includes('cudart') || errorMsg.includes('cublas') || errorMsg.includes('cusparse'))) {
        const downloadUrl = 'https://developer.nvidia.com/cuda-downloads'

        // Check if toolkit is actually installed
        const cudaPath = process.env.CUDA_PATH
        const isToolkitInstalled = cudaPath && existsSync(cudaPath)

        if (isToolkitInstalled) {
          // Toolkit installed but not working - needs restart
          return {
            success: false,
            error: JSON.stringify({
              type: 'toolkit_restart_required',
              title: 'Требуется перезагрузка компьютера',
              description: 'NVIDIA CUDA Toolkit установлен, но для его активации необходимо перезагрузить компьютер.',
              steps: [
                'Перезагрузите компьютер',
                'Попробуйте установить Silero с CUDA ускорением снова'
              ],
              fallbackToCpu: { engine: 'silero' }
            })
          }
        } else {
          // Toolkit not installed
          return {
            success: false,
            error: JSON.stringify({
              type: 'toolkit_missing',
              title: 'CUDA требует NVIDIA CUDA Toolkit',
              description: 'Для работы CUDA (NVIDIA GPU) необходимо установить NVIDIA CUDA Toolkit.',
              downloadUrl,
              downloadLabel: 'Скачать и установить',
              steps: [
                'Перезагрузите компьютер после установки',
                'Попробуйте установить Silero с CUDA ускорением снова'
              ],
              fallbackToCpu: { engine: 'silero' }
            })
          }
        }
      }

      return { success: false, error: `PyTorch verification failed: ${errorMsg}` }
    }

    const { stdout } = verifyResult
    if (!stdout.includes('OK')) {
      return { success: false, error: 'PyTorch verification failed' }
    }

    // Pre-download Silero models (Russian ~100MB + English ~100MB)
    onProgress({
      stage: 'silero',
      progress: scaleProgress(90),
      details: 'Скачивание моделей Silero (~200MB)...'
    })

    const preloadScript = `import sys
import torch

# Download Silero Russian model via torch.hub
print("SILERO_DOWNLOADING_RU", flush=True)
model_ru, _ = torch.hub.load(
    repo_or_dir='snakers4/silero-models',
    model='silero_tts',
    language='ru',
    speaker='v5_ru'
)
print("SILERO_RU_OK", flush=True)

# Download Silero English model via torch.hub
print("SILERO_DOWNLOADING_EN", flush=True)
model_en, _ = torch.hub.load(
    repo_or_dir='snakers4/silero-models',
    model='silero_tts',
    language='en',
    speaker='v3_en'
)
print("SILERO_EN_OK", flush=True)
print("SILERO_MODEL_OK")
`
    const preloadScriptPath = path.join(sileroPath, 'preload_model.py')
    fs.writeFileSync(preloadScriptPath, preloadScript, 'utf-8')

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(targetPython, [preloadScriptPath], {
          shell: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        })

        let stderr = ''

        let currentModel = 'ru'

        proc.stdout?.on('data', (data: Buffer) => {
          const str = data.toString()
          if (str.includes('SILERO_DOWNLOADING_RU')) {
            currentModel = 'ru'
            onProgress({
              stage: 'silero',
              progress: scaleProgress(90),
              details: 'Скачивание модели Silero (русская)...'
            })
          } else if (str.includes('SILERO_RU_OK')) {
            onProgress({
              stage: 'silero',
              progress: scaleProgress(95),
              details: 'Русская модель загружена. Скачивание английской...'
            })
          } else if (str.includes('SILERO_DOWNLOADING_EN')) {
            currentModel = 'en'
            onProgress({
              stage: 'silero',
              progress: scaleProgress(95),
              details: 'Скачивание модели Silero (английская)...'
            })
          } else if (str.includes('SILERO_EN_OK')) {
            onProgress({
              stage: 'silero',
              progress: scaleProgress(99),
              details: 'Английская модель загружена!'
            })
          } else if (str.includes('SILERO_MODEL_OK')) {
            onProgress({
              stage: 'silero',
              progress: scaleProgress(99),
              details: 'Все модели Silero загружены!'
            })
          }
        })

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
          // torch.hub shows download progress to stderr
          const progressMatch = data.toString().match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(M|MB|G|GB)/i)
          if (progressMatch) {
            const downloaded = parseFloat(progressMatch[1])
            const total = parseFloat(progressMatch[2])
            const unit = progressMatch[3].toUpperCase().replace('B', '')
            const downloadedMB = unit === 'G' ? downloaded * 1024 : downloaded
            const totalMB = unit === 'G' ? total * 1024 : total
            const modelLabel = currentModel === 'ru' ? 'русская' : 'английская'
            // Russian: 90-95%, English: 95-99%
            const baseProgress = currentModel === 'ru' ? 90 : 95
            const rangeSize = currentModel === 'ru' ? 5 : 4
            onProgress({
              stage: 'silero',
              progress: scaleProgress(baseProgress + Math.round((downloadedMB / totalMB) * rangeSize)),
              details: `Скачивание модели Silero (${modelLabel}): ${Math.round(downloadedMB)}/${Math.round(totalMB)} MB`
            })
          }
        })

        const timeout = setTimeout(() => {
          proc.kill()
          reject(new Error('Model download timeout'))
        }, 600000) // 10 min timeout

        proc.on('close', (code) => {
          clearTimeout(timeout)
          if (code === 0) {
            resolve()
          } else {
            // Model download failed, but don't fail the whole installation
            // Model will be downloaded on first use
            console.warn('[installSilero] Model preload failed:', stderr.slice(-500))
            resolve()
          }
        })

        proc.on('error', (err) => {
          clearTimeout(timeout)
          // Don't fail installation, model will download on first use
          console.warn('[installSilero] Model preload error:', err.message)
          resolve()
        })
      })
    } finally {
      try { unlinkSync(preloadScriptPath) } catch {}
    }

    // Install ruaccent for Russian stress marks
    onProgress({
      stage: 'silero',
      progress: scaleProgress(92),
      details: 'Installing ruaccent (Russian stress marks)...'
    })

    const ruaccentResult = await runPipWithProgress(
      targetPython,
      'ruaccent',
      {
        timeout: 300000,
        onProgress: (info) => {
          const progress = scaleProgress(92 + Math.round((info.percentage || 0) * 0.03))
          let details = 'Installing ruaccent...'
          if (info.phase === 'downloading' && info.downloaded !== undefined && info.total !== undefined) {
            details = `Downloading ruaccent: ${info.downloaded.toFixed(0)}/${info.total.toFixed(0)} MB`
          } else if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ruaccent: ${info.percentage}%`
          }
          onProgress({ stage: 'silero', progress, details })
        }
      }
    )

    if (!ruaccentResult.success) {
      // Don't fail installation, ruaccent is optional
      console.warn('[installSilero] ruaccent installation failed:', ruaccentResult.error)
    }

    // Pre-download ruaccent model (~300MB)
    onProgress({
      stage: 'silero',
      progress: scaleProgress(95),
      details: 'Downloading ruaccent model (~300 MB)...'
    })

    const ruaccentPreloadScript = `import sys
try:
    from ruaccent import RUAccent
    print("RUACCENT_LOADING", flush=True)
    model = RUAccent()
    model.load(omograph_model_size='turbo', use_dictionary=True)
    print("RUACCENT_OK", flush=True)
except ImportError:
    print("RUACCENT_NOT_INSTALLED", flush=True)
except Exception as e:
    print(f"RUACCENT_ERROR: {e}", flush=True)
`
    const ruaccentPreloadPath = path.join(sileroPath, 'preload_ruaccent.py')
    fs.writeFileSync(ruaccentPreloadPath, ruaccentPreloadScript, 'utf-8')

    try {
      await new Promise<void>((resolve) => {
        const proc = spawn(targetPython, [ruaccentPreloadPath], {
          shell: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        })

        proc.stdout?.on('data', (data: Buffer) => {
          const str = data.toString()
          if (str.includes('RUACCENT_LOADING')) {
            onProgress({
              stage: 'silero',
              progress: scaleProgress(96),
              details: 'Loading ruaccent model...'
            })
          } else if (str.includes('RUACCENT_OK')) {
            onProgress({
              stage: 'silero',
              progress: scaleProgress(99),
              details: 'ruaccent model loaded!'
            })
          }
        })

        proc.stderr?.on('data', (data: Buffer) => {
          const str = data.toString()
          // huggingface_hub outputs download progress in tqdm format
          const sizeMatch = str.match(/(\d+(?:\.\d+)?)\s*(M|G|MB|GB|k|K|KB)\s*\/\s*(\d+(?:\.\d+)?)\s*(M|G|MB|GB|k|K|KB)/i)

          if (sizeMatch) {
            const downloaded = parseFloat(sizeMatch[1])
            const downloadedUnit = sizeMatch[2].toUpperCase().replace('B', '')
            const total = parseFloat(sizeMatch[3])
            const totalUnit = sizeMatch[4].toUpperCase().replace('B', '')

            // Convert to MB for display
            const downloadedMB = downloadedUnit === 'G' ? downloaded * 1024 : (downloadedUnit === 'K' ? downloaded / 1024 : downloaded)
            const totalMB = totalUnit === 'G' ? total * 1024 : (totalUnit === 'K' ? total / 1024 : total)

            onProgress({
              stage: 'silero',
              progress: scaleProgress(95 + Math.round((downloadedMB / totalMB) * 3)),
              details: `Downloading ruaccent model: ${Math.round(downloadedMB)}/${Math.round(totalMB)} MB`
            })
          }
        })

        const timeout = setTimeout(() => {
          proc.kill()
          resolve()
        }, 300000) // 5 min timeout

        proc.on('close', () => {
          clearTimeout(timeout)
          resolve()
        })

        proc.on('error', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } finally {
      try { unlinkSync(ruaccentPreloadPath) } catch {}
    }

    // Save accelerator config
    saveAcceleratorConfig('silero', accelerator)

    onProgress({
      stage: 'silero',
      progress: 100,
      details: 'Silero installation complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Install Coqui TTS (requires Python and Visual Studio Build Tools)
export async function installCoqui(
  onProgress: (progress: SetupProgress) => void,
  accelerator: AcceleratorType = 'cpu'
): Promise<{ success: boolean; error?: string; needsBuildTools?: boolean }> {
  // Check if required toolkit is installed for GPU acceleration
  const toolkitCheck = checkGPUToolkit(accelerator)
  if (!toolkitCheck.available) {
    return { success: false, error: toolkitCheck.error }
  }

  // First ensure base embedded Python is installed
  if (!checkEmbeddedPythonInstalled()) {
    onProgress({
      stage: 'coqui',
      progress: 0,
      details: 'Python not found. Installing embedded Python...'
    })

    const pythonResult = await installEmbeddedPython((p) => {
      // Scale embedded python progress to 0-5% of overall coqui progress
      onProgress({
        stage: 'coqui',
        progress: Math.round(p.progress * 0.05),
        details: p.details
      })
    })

    if (!pythonResult.success) {
      return {
        success: false,
        error: `Failed to install embedded Python: ${pythonResult.error}`
      }
    }
  }

  const hasBuildTools = await checkBuildToolsAvailable()

  if (!hasBuildTools) {
    return {
      success: false,
      needsBuildTools: true,
      error: 'Visual Studio Build Tools are required for Coqui TTS installation.'
    }
  }

  const vcvarsallPath = await findVcvarsallPath()
  if (!vcvarsallPath) {
    return {
      success: false,
      error: 'Could not find vcvarsall.bat. Please reinstall Visual Studio Build Tools with C++ workload.'
    }
  }

  // Use accelerator-specific path (coqui-cpu, coqui-cuda, coqui-directml)
  const coquiPath = getCoquiPathForAccelerator(accelerator)

  // Import engine-specific Python functions
  const { copyPythonForEngine, checkEnginePythonInstalled } = await import('./python')
  const { getEnginePythonExe } = await import('./paths')

  // Get engine-specific Python path
  const enginePython = getEnginePythonExe('coqui', accelerator)

  // Progress scaling
  const scaleProgress = (p: number) => Math.min(100, Math.round(p))

  try {
    // Create coqui directory for this accelerator
    if (!existsSync(coquiPath)) {
      mkdirSync(coquiPath, { recursive: true })
    }

    const voicesPath = path.join(coquiPath, 'voices')
    if (!existsSync(voicesPath)) {
      mkdirSync(voicesPath, { recursive: true })
    }

    // Copy Python to engine-specific directory if not already done
    if (!checkEnginePythonInstalled('coqui', accelerator)) {
      onProgress({
        stage: 'coqui',
        progress: scaleProgress(2),
        details: 'Copying Python environment...'
      })

      const copyResult = await copyPythonForEngine('coqui', accelerator, (p) => {
        onProgress({
          stage: 'coqui',
          progress: scaleProgress(2 + Math.round(p.progress * 0.03)),
          details: p.details
        })
      })

      if (!copyResult.success) {
        return { success: false, error: copyResult.error || 'Failed to copy Python environment' }
      }
    } else {
      onProgress({
        stage: 'coqui',
        progress: scaleProgress(5),
        details: 'Using existing Python environment...'
      })
    }

    const targetPython = enginePython

    // Install PyTorch with selected accelerator - range 5% to 40%
    const acceleratorLabel = accelerator === 'cuda' ? 'CUDA' : accelerator === 'directml' ? 'DirectML' : 'CPU'
    const pytorchSize = accelerator === 'cuda' ? '~2.3 GB' : accelerator === 'directml' ? '~250 MB' : '~200 MB'
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(8),
      details: `Скачивание PyTorch ${acceleratorLabel} (${pytorchSize})...`
    })

    // Build pip install command based on accelerator
    const pytorchPackages = accelerator === 'directml'
      ? 'torch-directml'
      : 'torch==2.5.1 torchaudio==2.5.1'
    const indexUrl = PYTORCH_INDEX_URLS[accelerator]
    const extraArgs: string[] = []

    const pytorchResult = await runPipWithProgress(
      targetPython,
      pytorchPackages,
      {
        indexUrl,
        extraArgs,
        timeout: accelerator === 'cpu' ? 1200000 : 2400000, // 40 min for GPU versions
                onProgress: (info) => {
          const baseProgress = 8
          const rangeSize = 32 // 8% to 40%

          let subProgress = 0
          if (info.phase === 'collecting') {
            subProgress = 0
          } else if (info.phase === 'downloading') {
            subProgress = (info.percentage || 0) * 0.85
          } else if (info.phase === 'installing') {
            subProgress = 90
          } else if (info.phase === 'processing') {
            subProgress = 100
          }

          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = `Скачивание PyTorch ${acceleratorLabel} (${pytorchSize})...`
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            if (info.downloaded !== undefined && info.total !== undefined) {
              details = `Скачивание ${info.package}: ${info.downloaded.toFixed(1)}/${info.total.toFixed(1)} MB (${info.percentage}%)`
            } else {
              details = `Скачивание ${info.package}: ${info.percentage}%`
            }
          } else if (info.phase === 'downloading') {
            details = `Скачивание ${info.package}...`
          } else if (info.phase === 'collecting') {
            details = `Поиск зависимостей: ${info.package}...`
          } else if (info.phase === 'installing') {
            details = 'Установка скачанных пакетов...'
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!pytorchResult.success) {
      console.error('PyTorch installation error:', pytorchResult.error)
      return {
        success: false,
        error: 'Failed to install PyTorch. Please check your internet connection and try again.'
      }
    }

    if (accelerator === 'directml') {
      onProgress({
        stage: 'coqui',
        progress: scaleProgress(40),
        details: 'Installing DirectML-compatible torchaudio...'
      })

      const torchaudioResult = await runPipWithProgress(
        targetPython,
        'torchaudio==2.4.1',
        {
          timeout: 300000,
          onProgress: (info) => {
            let details = 'Installing torchaudio...'
            if (info.phase === 'downloading' && info.percentage !== undefined) {
              details = `Downloading ${info.package}: ${info.percentage}%`
            }
            onProgress({
              stage: 'coqui',
              progress: scaleProgress(40),
              details
            })
          }
        }
      )

      if (!torchaudioResult.success) {
        console.error('torchaudio installation error:', torchaudioResult.error)
        return {
          success: false,
          error: 'Failed to install DirectML-compatible torchaudio.'
        }
      }
    }

    // Install numpy, scipy - range 40% to 50%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(42),
      details: 'Installing numpy, scipy, omegaconf...'
    })

    const depsResult = await runPipWithProgress(
      targetPython,
      'numpy==1.26.4 scipy==1.14.1 omegaconf==2.3.0',
      {
        timeout: 300000,
        extraArgs: ['--prefer-binary'],
                onProgress: (info) => {
          const baseProgress = 42
          const rangeSize = 8

          let subProgress = (info.percentage || 0)
          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = 'Installing dependencies...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!depsResult.success) {
      console.error('Dependencies installation error:', depsResult.error)
      return { success: false, error: depsResult.error }
    }

    // Install Cython (required for building TTS wheel) - range 50% to 55%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(50),
      details: 'Installing Cython (required for building TTS)...'
    })

    const cythonResult = await runPipWithProgress(
      targetPython,
      'Cython==3.0.11 packaging==24.2',
      {
        timeout: 120000,
        onProgress: (info) => {
          const baseProgress = 50
          const rangeSize = 5
          let subProgress = (info.percentage || 0)
          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))
          let details = 'Installing Cython...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading Cython: ${info.percentage}%`
          }
          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!cythonResult.success) {
      console.error('Cython installation error:', cythonResult.error)
      return { success: false, error: `Failed to install Cython: ${cythonResult.error}` }
    }

    // Install Coqui TTS with MSVC - range 55% to 80%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(55),
      details: 'Installing Coqui TTS (downloading and compiling)...'
    })

    const ttsResult = await runPipWithProgress(
      targetPython,
      'TTS==0.22.0 flask==3.0.3 psutil==6.1.0',
      {
        timeout: 1200000,
        msvcEnvPath: vcvarsallPath,
        extraArgs: [],
                onProgress: (info) => {
          const baseProgress = 55
          const rangeSize = 25 // 55% to 80%

          let subProgress = 0
          if (info.phase === 'collecting') {
            subProgress = 5
          } else if (info.phase === 'downloading') {
            subProgress = 10 + (info.percentage || 0) * 0.5
          } else if (info.phase === 'processing') {
            // Building/compiling takes significant time
            subProgress = 70
          } else if (info.phase === 'installing') {
            subProgress = 95
          }

          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = 'Installing Coqui TTS...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          } else if (info.phase === 'collecting') {
            details = `Resolving: ${info.package}...`
          } else if (info.phase === 'processing') {
            details = `Compiling ${info.package}... (this may take several minutes)`
          } else if (info.phase === 'installing') {
            details = 'Installing compiled packages...'
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!ttsResult.success) {
      console.error('TTS installation error:', ttsResult.error)
      return { success: false, error: ttsResult.error }
    }

    // Fix transformers compatibility issue with Coqui TTS
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(80),
      details: 'Fixing transformers compatibility...'
    })

    await execAsync(`"${targetPython}" -m pip install "transformers==4.39.3" --no-input`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10
    })

    onProgress({
      stage: 'coqui',
      progress: scaleProgress(81),
      details: 'Setting up generation script...'
    })

    const generateScript = getCoquiGenerateScriptContent()
    fs.writeFileSync(path.join(coquiPath, 'generate.py'), generateScript, 'utf-8')

    onProgress({
      stage: 'coqui',
      progress: scaleProgress(85),
      details: 'Verifying installation...'
    })

    // Small delay to let filesystem sync after pip install
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Retry verification a few times in case of timing issues
    let verifySuccess = false
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const verifyCommand = accelerator === 'directml'
          ? `import torch; torch.inference_mode = torch.no_grad; import torch_directml; count=torch_directml.device_count() if hasattr(torch_directml,'device_count') else 1; idx=0; name=torch_directml.device_name(0); [globals().update(idx=i,name=torch_directml.device_name(i)) for i in range(count) if 'AMD' in torch_directml.device_name(i).upper() or 'RADEON' in torch_directml.device_name(i).upper()]; assert 'AMD' in name.upper() or 'RADEON' in name.upper(), name; d=torch_directml.device(idx); x=torch.ones((16,16), device=d); y=x @ x; from TTS.api import TTS; print('DIRECTML:' + name); print('OK')`
          : `from TTS.api import TTS; print('OK')`
        const { stdout } = await execAsync(`"${targetPython}" -c "${verifyCommand}"`, { timeout: 60000 })
        if (stdout.includes('OK')) {
          verifySuccess = true
          break
        }
        lastError = 'TTS import did not return OK'
      } catch (err) {
        lastError = (err as Error).message
        console.log(`[installCoqui] Verification attempt ${attempt} failed: ${lastError}`)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
    }

    if (!verifySuccess) {
      return { success: false, error: `Coqui TTS verification failed: ${lastError}` }
    }

    // Pre-download XTTS-v2 model - range 85% to 100%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(87),
      details: 'Pre-downloading XTTS-v2 model (~1.8GB)...'
    })

    const preloadScript = `import os
import sys
os.environ["COQUI_TOS_AGREED"] = "1"

# Fix for PyTorch 2.6+ weights_only default change
import torch
_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load
torch.inference_mode = torch.no_grad

# Simple progress tracking for model download
class ProgressTracker:
    def __init__(self):
        self.last_percent = -1

    def update(self, current, total):
        if total > 0:
            percent = int((current / total) * 100)
            if percent != self.last_percent and percent % 5 == 0:
                self.last_percent = percent
                print(f"PROGRESS:{percent}", flush=True)

from TTS.api import TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
print("Model downloaded successfully")
`
    const preloadScriptPath = path.join(coquiPath, 'preload_model.py')
    fs.writeFileSync(preloadScriptPath, preloadScript, 'utf-8')

    try {
      // Run model download with progress tracking
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(targetPython, [preloadScriptPath], {
          shell: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        })

        let stderr = ''

        proc.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n')
          for (const line of lines) {
            const match = line.match(/PROGRESS:(\d+)/)
            if (match) {
              const modelPercent = parseInt(match[1], 10)
              // Map model download progress to 87-98%
              const totalProgress = scaleProgress(87 + Math.round(modelPercent * 0.11))
              onProgress({
                stage: 'coqui',
                progress: totalProgress,
                details: `Downloading XTTS-v2 model: ${modelPercent}%`
              })
            }
            if (line.includes('Model downloaded successfully')) {
              onProgress({
                stage: 'coqui',
                progress: scaleProgress(98),
                details: 'Model download complete!'
              })
            }
          }
        })

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
          // TTS library outputs download progress to stderr in tqdm format
          // Example: "50%|█████     | 900M/1.80G [00:30<00:30, 30.0MB/s]"
          const str = data.toString()

          // Try to parse size info (e.g., "900M/1.80G" or "500.5M/1.80G")
          const sizeMatch = str.match(/(\d+(?:\.\d+)?)\s*(M|G|MB|GB)\s*\/\s*(\d+(?:\.\d+)?)\s*(M|G|MB|GB)/i)
          const progressMatch = str.match(/(\d+)%\|/)

          if (progressMatch) {
            const modelPercent = parseInt(progressMatch[1], 10)
            const totalProgress = scaleProgress(87 + Math.round(modelPercent * 0.11))

            let details = `Downloading XTTS-v2 model: ${modelPercent}%`
            if (sizeMatch) {
              const downloaded = parseFloat(sizeMatch[1])
              const downloadedUnit = sizeMatch[2].toUpperCase().replace('B', '')
              const total = parseFloat(sizeMatch[3])
              const totalUnit = sizeMatch[4].toUpperCase().replace('B', '')

              // Convert to MB for display
              const downloadedMB = downloadedUnit === 'G' ? downloaded * 1024 : downloaded
              const totalMB = totalUnit === 'G' ? total * 1024 : total

              details = `Скачивание модели XTTS-v2: ${Math.round(downloadedMB)}/${Math.round(totalMB)} MB`
            }

            onProgress({
              stage: 'coqui',
              progress: totalProgress,
              details
            })
          }
        })

        const timeout = setTimeout(() => {
          proc.kill()
          reject(new Error('Model download timeout'))
        }, 1800000)

        proc.on('close', (code) => {
          clearTimeout(timeout)
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(stderr || `Model download failed with code ${code}`))
          }
        })

        proc.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })
    } finally {
      try { unlinkSync(preloadScriptPath) } catch {}
    }

    // Save accelerator config
    saveAcceleratorConfig('coqui', accelerator)

    onProgress({
      stage: 'coqui',
      progress: 100,
      details: 'Coqui TTS installation complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Full setup process
export async function runSetup(
  onProgress: (progress: SetupProgress) => void,
  options: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
    installSilero?: boolean
  } = {}
): Promise<{ success: boolean; error?: string }> {
  const {
    installPiper: shouldInstallPiper = false,
    installFfmpeg: shouldInstallFfmpeg = false,
    installRussianVoices = false,
    installEnglishVoices = false,
    installSilero: shouldInstallSilero = false
  } = options

  try {
    const status = checkDependencies()

    // Install Piper if needed
    if (shouldInstallPiper && !status.piper) {
      const result = await installPiper(onProgress)
      if (!result.success) {
        return result
      }
    }

    // Install FFmpeg if needed
    if (shouldInstallFfmpeg && !status.ffmpeg) {
      const result = await installFfmpeg(onProgress)
      if (!result.success) {
        return result
      }
    }

    // Install Russian voices (only if explicitly requested)
    if (installRussianVoices) {
      const russianVoices = [
        { name: 'denis', quality: 'medium' },
        { name: 'dmitri', quality: 'medium' },
        { name: 'irina', quality: 'medium' },
        { name: 'ruslan', quality: 'medium' }
      ]

      const { installPiperVoice } = await import('./voices')
      for (const voice of russianVoices) {
        if (!status.piperVoices.ruRU.includes(voice.name)) {
          await installPiperVoice('ru_RU', voice.name, voice.quality, onProgress)
        }
      }
    }

    // Install English voices (only if explicitly requested)
    if (installEnglishVoices) {
      const englishVoices = [
        { name: 'amy', quality: 'low' },
        { name: 'lessac', quality: 'medium' },
        { name: 'ryan', quality: 'medium' }
      ]

      const { installPiperVoice } = await import('./voices')
      for (const voice of englishVoices) {
        if (!status.piperVoices.enUS.includes(voice.name)) {
          await installPiperVoice('en_US', voice.name, voice.quality, onProgress)
        }
      }
    }

    // Install Silero if explicitly requested and Python is available
    if (shouldInstallSilero && !status.silero) {
      const pythonCmd = await checkPythonAvailable()
      if (pythonCmd) {
        const result = await installSilero(onProgress)
        if (!result.success) {
          console.warn('Silero installation failed:', result.error)
          // Don't fail the whole setup, Silero is optional
        }
      } else {
        console.log('Skipping Silero installation: Python not available')
      }
    }

    onProgress({
      stage: 'complete',
      progress: 100,
      details: 'Setup complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Get total download size estimate
export async function getEstimatedDownloadSize(): Promise<{ size: number; includeSilero: boolean }> {
  const status = checkDependencies()
  let size = 0

  // Piper binary ~21MB
  if (!status.piper) {
    size += 21
  }

  // FFmpeg ~101MB
  if (!status.ffmpeg) {
    size += 101
  }

  // Voices are now installed on-demand, not included in initial setup
  const includeSilero = false

  return { size, includeSilero }
}
