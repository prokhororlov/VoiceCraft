import fs from 'fs'
import path from 'path'
import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import { getResourcesPath, getSileroPythonExecutable, getCoquiPythonExecutable, getBarkPythonExecutable, getBarkAccelerator } from './utils'
import { getTTSServerScriptContent } from '../setup/utils'

const execAsync = promisify(exec)

// ==================== TTS Server Management ====================

const TTS_SERVER_PORT = 5050
const TTS_SERVER_URL = `http://127.0.0.1:${TTS_SERVER_PORT}`
type TTSEngine = 'silero' | 'coqui' | 'bark'

let ttsServerProcess: ChildProcess | null = null
let ttsServerReady = false
let serverStarting = false // Prevent multiple simultaneous starts
let ttsServerRuntimeEngine: TTSEngine | null = null

// Model load progress callback
let modelLoadProgressCallback: ((progress: number, engine: string, language?: string) => void) | null = null

export function setModelLoadProgressCallback(callback: ((progress: number, engine: string, language?: string) => void) | null): void {
  modelLoadProgressCallback = callback
}

// Track which model is currently loading
let currentLoadingModel: { engine: string; language?: string } | null = null

export function setCurrentLoadingModel(model: { engine: string; language?: string } | null): void {
  currentLoadingModel = model
}

export interface AvailableDevice {
  id: string
  name: string
  available: boolean
  description: string
}

export interface TTSServerStatus {
  running: boolean
  silero: {
    ru_loaded: boolean
    en_loaded: boolean
  }
  coqui: {
    loaded: boolean
  }
  bark: {
    loaded: boolean
    backend?: string | null
    acoustic_backend?: string | null
    codec_backend?: string | null
  }
  memory_gb: number
  cpu_percent: number
  device: string
  backend: string
  gpu_name: string | null
  preferred_device: string
  available_devices: AvailableDevice[]
  ipex_available: boolean
}

// Kill process tree on Windows (taskkill /T kills child processes)
async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execAsync(`taskkill /pid ${pid} /T /F`)
    } catch {
      // Process may already be dead
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL') // Kill process group on Unix
    } catch {
      // Process may already be dead
    }
  }
}

// Kill any orphan TTS server processes (from previous crashes)
export async function killOrphanTTSServers(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      // Find python processes running tts_server.py
      const { stdout } = await execAsync('wmic process where "commandline like \'%tts_server.py%\'" get processid /format:list')
      const pids = stdout.match(/ProcessId=(\d+)/g)
      if (pids) {
        for (const match of pids) {
          const pid = parseInt(match.replace('ProcessId=', ''))
          if (pid && !isNaN(pid)) {
            console.log(`Killing orphan TTS server process: ${pid}`)
            await killProcessTree(pid)
          }
        }
      }
    } catch {
      // No orphan processes or wmic not available
    }
  }
}

export function getTTSServerScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'tts_server.py')
}

function ensureTTSServerScript(): string {
  const serverScript = getTTSServerScript()
  const resourcesPath = getResourcesPath()
  const expectedContent = getTTSServerScriptContent()

  fs.mkdirSync(resourcesPath, { recursive: true })

  if (!fs.existsSync(serverScript)) {
    fs.writeFileSync(serverScript, expectedContent, 'utf-8')
    console.log(`Created missing TTS server script: ${serverScript}`)
  } else {
    const currentContent = fs.readFileSync(serverScript, 'utf-8')
    if (currentContent !== expectedContent) {
      fs.writeFileSync(serverScript, expectedContent, 'utf-8')
      console.log(`Updated TTS server script: ${serverScript}`)
    }
  }

  return serverScript
}

export function getTTSServerPythonExecutable(preferredEngine: TTSEngine = 'coqui'): string {
  if (preferredEngine === 'bark') {
    return getBarkPythonExecutable()
  }

  if (preferredEngine === 'coqui') {
    const coquiExe = getCoquiPythonExecutable()
    if (fs.existsSync(coquiExe)) return coquiExe
    const sileroExe = getSileroPythonExecutable()
    if (fs.existsSync(sileroExe)) return sileroExe
    const barkExe = getBarkPythonExecutable()
    if (fs.existsSync(barkExe)) return barkExe
    return coquiExe
  }

  // Prefer Coqui's venv for Silero when available because it has the broader
  // server dependency set; otherwise use Silero's own environment.
  const coquiExe = getCoquiPythonExecutable()
  if (fs.existsSync(coquiExe)) {
    return coquiExe
  }
  return getSileroPythonExecutable()
}

function getEnginePathFromPython(pythonExe: string): string {
  return path.dirname(path.dirname(pythonExe))
}

export async function waitForServer(maxAttempts: number = 60, delayMs: number = 500): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await getTTSServerStatus()
      if (status.running) {
        return true
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
}

export async function startTTSServer(preferredEngine: TTSEngine = 'coqui'): Promise<void> {
  // Already running
  if (ttsServerProcess && ttsServerReady) {
    if (ttsServerRuntimeEngine !== preferredEngine) {
      console.log(`TTS Server is running for ${ttsServerRuntimeEngine}; restarting for ${preferredEngine}`)
      await stopTTSServer()
    } else {
      console.log('TTS Server already running')
      return
    }
  }

  // Prevent multiple simultaneous starts
  if (serverStarting) {
    console.log('TTS Server is already starting, waiting...')
    await waitForServer()
    return
  }

  serverStarting = true

  try {
    // Kill any orphan servers first
    await killOrphanTTSServers()

    const pythonExe = getTTSServerPythonExecutable(preferredEngine)
    const serverScript = ensureTTSServerScript()

    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python environment not found. Please install Silero or Coqui first.')
    }

    if (!fs.existsSync(serverScript)) {
      throw new Error('TTS Server script not found.')
    }

    console.log('Starting TTS Server...')

    await new Promise<void>((resolve, reject) => {
      const enginePath = getEnginePathFromPython(pythonExe)
      const args = [
        serverScript,
        '--port', TTS_SERVER_PORT.toString(),
        '--runtime-engine', preferredEngine,
        '--engine-path', enginePath,
        '--accelerator', preferredEngine === 'bark' ? getBarkAccelerator() : 'auto'
      ]

      ttsServerProcess = spawn(pythonExe, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false // Ensure child dies with parent
      })

      const pid = ttsServerProcess.pid
      console.log(`TTS Server process started with PID: ${pid}`)

      ttsServerProcess.stdout?.on('data', (data) => {
        console.log('[TTS Server]', data.toString().trim())
      })

      ttsServerProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim()
        console.log('[TTS Server]', msg)
        // Check if server started
        if (msg.includes('Running on')) {
          ttsServerReady = true
        }

        // Parse model download progress (e.g., "19.5%", "100%")
        // PyTorch hub shows progress like: "Downloading: 19.5%"
        const progressMatch = msg.match(/(\d+(?:\.\d+)?)\s*%/)
        if (progressMatch && currentLoadingModel && modelLoadProgressCallback) {
          const progress = parseFloat(progressMatch[1])
          modelLoadProgressCallback(progress, currentLoadingModel.engine, currentLoadingModel.language)
        }
      })

      ttsServerProcess.on('error', (error) => {
        console.error('TTS Server error:', error)
        ttsServerProcess = null
        ttsServerReady = false
        ttsServerRuntimeEngine = null
        reject(error)
      })

      ttsServerProcess.on('close', (code) => {
        console.log(`TTS Server exited with code ${code}`)
        ttsServerProcess = null
        ttsServerReady = false
        ttsServerRuntimeEngine = null
      })

      // Wait for server to be ready
      waitForServer().then((ready) => {
        if (ready) {
          console.log('TTS Server is ready')
          ttsServerRuntimeEngine = preferredEngine
          resolve()
        } else {
          reject(new Error('TTS Server failed to start'))
        }
      })
    })
  } finally {
    serverStarting = false
  }
}

export async function stopTTSServer(): Promise<void> {
  const pid = ttsServerProcess?.pid

  if (!ttsServerProcess || !pid) {
    // Even if we don't have a process reference, kill any orphans
    await killOrphanTTSServers()
    return
  }

  console.log(`Stopping TTS Server (PID: ${pid})...`)

  try {
    // Try graceful shutdown via HTTP first
    await httpRequest(`${TTS_SERVER_URL}/shutdown`, 'POST')
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch {
    // Graceful shutdown failed, will force kill
  }

  // Force kill the process tree to ensure all child processes are killed
  await killProcessTree(pid)

  ttsServerProcess = null
  ttsServerReady = false
  ttsServerRuntimeEngine = null
  serverStarting = false
  console.log('TTS Server stopped')
}

export async function getTTSServerStatus(): Promise<TTSServerStatus> {
  try {
    const response = await httpRequest(`${TTS_SERVER_URL}/status`, 'GET')
    const data = JSON.parse(response)
    return {
      running: true,
      silero: data.silero,
      coqui: data.coqui,
      bark: data.bark || { loaded: false, backend: null },
      memory_gb: data.memory_gb,
      cpu_percent: data.cpu_percent || 0,
      device: data.device,
      backend: data.backend || 'unknown',
      gpu_name: data.gpu_name || null,
      preferred_device: data.preferred_device || data.device,
      available_devices: data.available_devices || [],
      ipex_available: data.ipex_available || false
    }
  } catch {
    return {
      running: false,
      silero: { ru_loaded: false, en_loaded: false },
      coqui: { loaded: false },
      bark: { loaded: false, backend: null },
      memory_gb: 0,
      cpu_percent: 0,
      device: 'unknown',
      backend: 'unknown',
      gpu_name: null,
      preferred_device: 'cpu',
      available_devices: [{ id: 'cpu', name: 'CPU', available: true, description: 'CPU' }],
      ipex_available: false
    }
  }
}

export async function loadTTSModel(
  engine: TTSEngine,
  language?: string
): Promise<{ success: boolean; memory_gb: number; error?: string }> {
  // Set current loading model for progress tracking
  setCurrentLoadingModel({ engine, language })

  try {
    // Start server if not running
    const status = await getTTSServerStatus()
    if (!status.running || ttsServerRuntimeEngine !== engine) {
      await startTTSServer(engine)
    }

    const body = JSON.stringify({ engine, language })
    // Use longer timeout for model loading (5 minutes) - Coqui + ruaccent can take a while
    const response = await httpRequestWithTimeout(`${TTS_SERVER_URL}/load`, 'POST', body, 300000)
    const data = JSON.parse(response)

    return {
      success: data.success,
      memory_gb: data.memory_gb
    }
  } catch (error) {
    return {
      success: false,
      memory_gb: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    // Clear loading state
    setCurrentLoadingModel(null)
  }
}

export async function unloadTTSModel(
  engine: TTSEngine | 'all',
  language?: string
): Promise<{ success: boolean; memory_gb: number }> {
  try {
    const body = JSON.stringify({ engine, language })
    const response = await httpRequest(`${TTS_SERVER_URL}/unload`, 'POST', body)
    const data = JSON.parse(response)

    return {
      success: data.success,
      memory_gb: data.memory_gb
    }
  } catch {
    return { success: false, memory_gb: 0 }
  }
}

export async function setPreferredDevice(device: string): Promise<{ success: boolean; error?: string }> {
  try {
    const body = JSON.stringify({ device })
    const response = await httpRequest(`${TTS_SERVER_URL}/set-device`, 'POST', body)
    const data = JSON.parse(response)
    return { success: data.success }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function generateViaServer(
  engine: TTSEngine,
  text: string,
  speaker: string,
  language: string,
  outputPath: string,
  rate?: string | number,
  pitch?: number,
  timeStretch?: number,
  speakerWav?: string,
  useRuaccent?: boolean
): Promise<void> {
  const body = JSON.stringify({
    engine,
    text,
    speaker,
    language,
    rate,
    pitch,
    time_stretch: timeStretch,
    speaker_wav: speakerWav,
    use_ruaccent: useRuaccent
  })

  // Coqui XTTS is much slower, use 3x timeout (6 minutes instead of 2)
  const timeout = engine === 'coqui' || engine === 'bark' ? 360000 : 120000
  const audioBuffer = await httpRequestBinary(`${TTS_SERVER_URL}/generate`, 'POST', body, timeout)

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, audioBuffer)
}

// Abortable version for preview
export async function generateViaServerForPreview(
  engine: TTSEngine,
  text: string,
  speaker: string,
  language: string,
  outputPath: string,
  rate?: string | number,
  pitch?: number,
  timeStretch?: number,
  speakerWav?: string,
  useRuaccent?: boolean
): Promise<void> {
  const body = JSON.stringify({
    engine,
    text,
    speaker,
    language,
    rate,
    pitch,
    time_stretch: timeStretch,
    speaker_wav: speakerWav,
    use_ruaccent: useRuaccent
  })

  const audioBuffer = await httpRequestBinaryForPreview(`${TTS_SERVER_URL}/generate`, 'POST', body)

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, audioBuffer)
}

export function httpRequest(url: string, method: string, body?: string): Promise<string> {
  return httpRequestWithTimeout(url, method, body, 60000)
}

export function httpRequestWithTimeout(url: string, method: string, body?: string, timeout: number = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(timeout, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

export function httpRequestBinary(url: string, method: string, body?: string, timeout: number = 120000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buffer)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(timeout, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

// Abortable version for preview - stores request reference for cancellation
// Note: currentPreviewRequest is managed by the caller (converter module)
let currentPreviewRequest: http.ClientRequest | null = null

export function httpRequestBinaryForPreview(url: string, method: string, body?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        currentPreviewRequest = null
        const buffer = Buffer.concat(chunks)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buffer)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`))
        }
      })
    })

    // Store reference for abort
    currentPreviewRequest = req

    req.on('error', (err) => {
      currentPreviewRequest = null
      reject(err)
    })
    req.setTimeout(360000, () => {
      currentPreviewRequest = null
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

// Export for cleanup in converter
export function getCurrentPreviewRequest(): http.ClientRequest | null {
  return currentPreviewRequest
}

export function clearCurrentPreviewRequest(): void {
  currentPreviewRequest = null
}
