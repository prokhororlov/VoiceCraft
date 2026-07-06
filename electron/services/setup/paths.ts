import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { AcceleratorType } from './types'

// Get path to resources
export function getResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'tts_resources')
  } else {
    return path.join(process.cwd(), 'tts_resources')
  }
}

export function getPiperResourcesPath(): string {
  return path.join(getResourcesPath(), 'piper')
}

export function getFfmpegPath(): string {
  return path.join(getResourcesPath(), 'ffmpeg')
}

// Settings file for storing active accelerator choice
function getAcceleratorSettingsPath(): string {
  return path.join(getResourcesPath(), 'accelerator-settings.json')
}

// Get/set active accelerator for an engine
export function getActiveAccelerator(engine: 'silero' | 'coqui'): AcceleratorType {
  try {
    const settingsPath = getAcceleratorSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return settings[engine] || 'cpu'
    }
  } catch {
    // Settings don't exist or are invalid
  }
  return 'cpu'
}

export function setActiveAccelerator(engine: 'silero' | 'coqui', accelerator: AcceleratorType): void {
  const settingsPath = getAcceleratorSettingsPath()
  let settings: Record<string, AcceleratorType> = {}

  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch {
    // Start fresh
  }

  settings[engine] = accelerator

  const dir = path.dirname(settingsPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

// Get all installed accelerators for an engine
export function getInstalledAccelerators(engine: 'silero' | 'coqui'): AcceleratorType[] {
  const resourcesPath = getResourcesPath()
  const installed: AcceleratorType[] = []

  const accelerators: AcceleratorType[] = ['cpu', 'cuda', 'directml']
  for (const acc of accelerators) {
    const enginePath = path.join(resourcesPath, `${engine}-${acc}`)
    const configPath = path.join(enginePath, 'accelerator.json')
    if (fs.existsSync(configPath)) {
      installed.push(acc)
    }
  }

  return installed
}

// Get path to Silero for specific accelerator
export function getSileroPathForAccelerator(accelerator: AcceleratorType): string {
  return path.join(getResourcesPath(), `silero-${accelerator}`)
}

// Get path to Coqui for specific accelerator
export function getCoquiPathForAccelerator(accelerator: AcceleratorType): string {
  return path.join(getResourcesPath(), `coqui-${accelerator}`)
}

// Get path to active Silero installation (based on settings)
export function getSileroPath(): string {
  const activeAccelerator = getActiveAccelerator('silero')
  return getSileroPathForAccelerator(activeAccelerator)
}

// Get path to active Coqui installation (based on settings)
export function getCoquiPath(): string {
  const activeAccelerator = getActiveAccelerator('coqui')
  return getCoquiPathForAccelerator(activeAccelerator)
}

export function getRHVoicePath(): string {
  return path.join(getResourcesPath(), 'rhvoice')
}

// Get path to cache directory for downloaded files
export function getCachePath(): string {
  return path.join(getResourcesPath(), 'cache')
}

// Get path to embedded Python directory (shared, for bootstrapping only)
export function getEmbeddedPythonPath(): string {
  return path.join(getResourcesPath(), 'python')
}

// Get path to embedded Python executable (shared, for bootstrapping only)
export function getEmbeddedPythonExe(): string {
  return path.join(getEmbeddedPythonPath(), 'python.exe')
}

// Get path to Python for specific engine+accelerator (silero-cpu/python, silero-cuda/python, etc.)
export function getEnginePythonPath(engine: 'silero' | 'coqui', accelerator: AcceleratorType): string {
  const enginePath = engine === 'silero'
    ? getSileroPathForAccelerator(accelerator)
    : getCoquiPathForAccelerator(accelerator)
  return path.join(enginePath, 'python')
}

// Get path to Python executable for specific engine+accelerator
export function getEnginePythonExe(engine: 'silero' | 'coqui', accelerator: AcceleratorType): string {
  return path.join(getEnginePythonPath(engine, accelerator), 'python.exe')
}
