import fs, { existsSync } from 'fs'
import path from 'path'
import { app } from 'electron'
import type { AcceleratorType } from '../setup/types'

// Get path to resources - uses userData for packaged app (dependencies installed at runtime)
export function getResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'tts_resources')
  } else {
    return path.join(process.cwd(), 'tts_resources')
  }
}

// Get active accelerator setting for an engine
function getActiveAccelerator(engine: 'silero' | 'coqui' | 'bark'): AcceleratorType {
  try {
    const settingsPath = path.join(getResourcesPath(), 'accelerator-settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return settings[engine] || 'cpu'
    }
  } catch {
    // Settings don't exist or are invalid
  }
  return 'cpu'
}

export function getPiperResourcesPath(): string {
  return path.join(getResourcesPath(), 'piper')
}

// Get path to Piper executable
export function getPiperExecutable(): string {
  const resourcesPath = getPiperResourcesPath()
  return path.join(resourcesPath, 'bin', 'piper', 'piper.exe')
}

// Get path to Python executable for Silero
// Uses accelerator-specific Python (silero-cpu/python, silero-cuda/python)
export function getSileroPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('silero')
  const sileroPath = path.join(resourcesPath, `silero-${activeAccelerator}`)
  return path.join(sileroPath, 'python', 'python.exe')
}

// Get path to Silero script
export function getSileroScript(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('silero')
  return path.join(resourcesPath, `silero-${activeAccelerator}`, 'generate.py')
}

// Get path to Python executable for Coqui
// Uses accelerator-specific Python (coqui-cpu/python, coqui-cuda/python)
export function getCoquiPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('coqui')
  const coquiPath = path.join(resourcesPath, `coqui-${activeAccelerator}`)
  return path.join(coquiPath, 'python', 'python.exe')
}

export function getCoquiScript(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('coqui')
  return path.join(resourcesPath, `coqui-${activeAccelerator}`, 'generate.py')
}

// Get path to Python executable for Bark
// Uses accelerator-specific Python (bark-cpu/python, bark-cuda/python, bark-directml/python)
export function getBarkPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('bark')
  const barkPath = path.join(resourcesPath, `bark-${activeAccelerator}`)
  return path.join(barkPath, 'python', 'python.exe')
}

export function getBarkScript(): string {
  const resourcesPath = getResourcesPath()
  const activeAccelerator = getActiveAccelerator('bark')
  return path.join(resourcesPath, `bark-${activeAccelerator}`, 'generate.py')
}

export function getBarkAccelerator(): AcceleratorType {
  return getActiveAccelerator('bark')
}

// Get path to ffmpeg executable
export function getFfmpegExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe')
}
