import path from 'path'
import { existsSync } from 'fs'
import {
  getPiperResourcesPath,
  getFfmpegPath,
  getSileroPath,
  getCoquiPath,
  getBarkPath,
  getSileroPathForAccelerator,
  getCoquiPathForAccelerator,
  getBarkPathForAccelerator,
  getInstalledAccelerators,
  getEmbeddedPythonExe,
  getEnginePythonExe
} from './paths'
import { checkEmbeddedPythonInstalled, checkPythonAvailable } from './python'
import { checkBuildToolsAvailable } from './installers'
import { getInstalledRHVoices } from './voices'
import type { DependencyStatus, AcceleratorType } from './types'

// Check if Silero is installed for a specific accelerator
export function checkSileroInstalledForAccelerator(accelerator: AcceleratorType): boolean {
  const sileroPath = getSileroPathForAccelerator(accelerator)
  const enginePython = getEnginePythonExe('silero', accelerator)
  const generateScript = path.join(sileroPath, 'generate.py')
  const configFile = path.join(sileroPath, 'accelerator.json')

  // Check if engine-specific Python exists
  const pythonExists = existsSync(enginePython)
  const scriptExists = existsSync(generateScript)
  const configExists = existsSync(configFile)

  return pythonExists && scriptExists && configExists
}

// Check if Silero is set up and working (any accelerator version)
export function checkSileroInstalled(): boolean {
  // Check if any version is installed
  const installedAccelerators = getInstalledAccelerators('silero')
  if (installedAccelerators.length > 0) {
    return true
  }

  // Legacy check for old 'silero' folder (without accelerator suffix)
  // This handles both old venv structure and new python folder structure
  const sileroPath = path.join(path.dirname(getSileroPath()), 'silero')
  const venvPython = path.join(sileroPath, 'venv', 'Scripts', 'python.exe')
  const enginePython = path.join(sileroPath, 'python', 'python.exe')
  const generateScript = path.join(sileroPath, 'generate.py')

  const venvPythonExists = existsSync(venvPython)
  const enginePythonExists = existsSync(enginePython)
  const pythonExists = venvPythonExists || enginePythonExists
  const scriptExists = existsSync(generateScript)

  console.log('Silero check:', {
    installedAccelerators,
    legacyPath: sileroPath,
    venvPythonExists,
    enginePythonExists,
    scriptExists
  })

  return pythonExists && scriptExists
}

// Check if Coqui is installed for a specific accelerator
export function checkCoquiInstalledForAccelerator(accelerator: AcceleratorType): boolean {
  const coquiPath = getCoquiPathForAccelerator(accelerator)
  const enginePython = getEnginePythonExe('coqui', accelerator)
  const generateScript = path.join(coquiPath, 'generate.py')
  const configFile = path.join(coquiPath, 'accelerator.json')

  // Check if engine-specific Python exists
  const pythonExists = existsSync(enginePython)
  const scriptExists = existsSync(generateScript)
  const configExists = existsSync(configFile)

  return pythonExists && scriptExists && configExists
}

// Check if Bark is installed for a specific accelerator
export function checkBarkInstalledForAccelerator(accelerator: AcceleratorType): boolean {
  const barkPath = getBarkPathForAccelerator(accelerator)
  const enginePython = getEnginePythonExe('bark', accelerator)
  const generateScript = path.join(barkPath, 'generate.py')
  const configFile = path.join(barkPath, 'accelerator.json')

  const pythonExists = existsSync(enginePython)
  const scriptExists = existsSync(generateScript)
  const configExists = existsSync(configFile)

  return pythonExists && scriptExists && configExists
}

// Check if Bark is set up and working (any accelerator version)
export function checkBarkInstalled(): boolean {
  const installedAccelerators = getInstalledAccelerators('bark')
  if (installedAccelerators.length > 0) {
    return true
  }

  const barkPath = path.join(path.dirname(getBarkPath()), 'bark')
  const enginePython = path.join(barkPath, 'python', 'python.exe')
  const generateScript = path.join(barkPath, 'generate.py')

  return existsSync(enginePython) && existsSync(generateScript)
}

// Check if Coqui is set up and working (any accelerator version)
export function checkCoquiInstalled(): boolean {
  // Check if any version is installed
  const installedAccelerators = getInstalledAccelerators('coqui')
  if (installedAccelerators.length > 0) {
    return true
  }

  // Legacy check for old 'coqui' folder (without accelerator suffix)
  // This handles both old venv structure and new python folder structure
  const coquiPath = path.join(path.dirname(getCoquiPath()), 'coqui')
  const venvPython = path.join(coquiPath, 'venv', 'Scripts', 'python.exe')
  const enginePython = path.join(coquiPath, 'python', 'python.exe')
  const generateScript = path.join(coquiPath, 'generate.py')

  const venvPythonExists = existsSync(venvPython)
  const enginePythonExists = existsSync(enginePython)
  const pythonExists = venvPythonExists || enginePythonExists
  const scriptExists = existsSync(generateScript)

  console.log('Coqui check:', {
    installedAccelerators,
    legacyPath: coquiPath,
    venvPythonExists,
    enginePythonExists,
    scriptExists
  })

  return pythonExists && scriptExists
}

// Check which dependencies are installed
export function checkDependencies(): DependencyStatus {
  const piperPath = getPiperResourcesPath()
  const ffmpegPath = getFfmpegPath()

  const piperExe = path.join(piperPath, 'bin', 'piper', 'piper.exe')
  const ffmpegExe = path.join(ffmpegPath, 'ffmpeg.exe')

  const ruVoices = ['denis', 'dmitri', 'irina', 'ruslan']
  const enVoices = ['amy', 'lessac', 'ryan']

  const installedRuVoices: string[] = []
  const installedEnVoices: string[] = []

  // Check Russian voices
  for (const voice of ruVoices) {
    const quality = 'medium'
    const voicePath = path.join(piperPath, 'voices', 'ru_RU', voice, quality, `ru_RU-${voice}-${quality}.onnx`)
    if (existsSync(voicePath)) {
      installedRuVoices.push(voice)
    }
  }

  // Check English voices
  for (const voice of enVoices) {
    const quality = voice === 'amy' ? 'low' : 'medium'
    const voicePath = path.join(piperPath, 'voices', 'en_US', voice, quality, `en_US-${voice}-${quality}.onnx`)
    if (existsSync(voicePath)) {
      installedEnVoices.push(voice)
    }
  }

  // Check Silero
  const sileroInstalled = checkSileroInstalled()

  // Check Coqui
  const coquiInstalled = checkCoquiInstalled()

  // Check Bark
  const barkInstalled = checkBarkInstalled()

  return {
    piper: existsSync(piperExe),
    ffmpeg: existsSync(ffmpegExe),
    silero: sileroInstalled,
    sileroAvailable: false, // Will be set by async check
    coqui: coquiInstalled,
    coquiAvailable: false, // Will be set by async check
    coquiBuildToolsAvailable: false, // Will be set by async check
    bark: barkInstalled,
    barkAvailable: false, // Will be set by async check
    rhvoiceCore: false, // Will be set by async check
    rhvoiceVoices: [], // Will be set by async check
    piperVoices: {
      ruRU: installedRuVoices,
      enUS: installedEnVoices
    }
  }
}

// Check if any essential dependency is missing
export function needsSetup(): boolean {
  const status = checkDependencies()
  // Only FFmpeg is required at startup (used by all providers)
  return !status.ffmpeg
}

// Async version of checkDependencies that also checks Python availability
export async function checkDependenciesAsync(): Promise<DependencyStatus> {
  const status = checkDependencies()
  const pythonCmd = await checkPythonAvailable()
  status.sileroAvailable = pythonCmd !== null
  status.coquiAvailable = pythonCmd !== null
  status.barkAvailable = pythonCmd !== null

  // Check Build Tools for Coqui
  status.coquiBuildToolsAvailable = await checkBuildToolsAvailable()

  // Check RHVoice
  status.rhvoiceVoices = await getInstalledRHVoices()
  // RHVoice core is considered installed if any RHVoice voice is present
  status.rhvoiceCore = status.rhvoiceVoices.length > 0

  console.log('checkDependenciesAsync result:', { ...status, pythonCmd })
  return status
}
