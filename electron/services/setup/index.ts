// Main exports for setup module
// This file aggregates all setup functionality

// Types
export type {
  PipProgressInfo,
  SetupProgress,
  DependencyStatus,
  GPUInfo,
  AvailableAccelerators,
  AcceleratorType,
  AcceleratorConfig,
  ReinstallProgress
} from './types'

// Paths
export {
  getResourcesPath,
  getPiperResourcesPath,
  getFfmpegPath,
  getSileroPath,
  getCoquiPath,
  getBarkPath,
  getSileroPathForAccelerator,
  getCoquiPathForAccelerator,
  getBarkPathForAccelerator,
  getActiveAccelerator,
  setActiveAccelerator,
  getInstalledAccelerators,
  getRHVoicePath,
  getEmbeddedPythonPath,
  getEmbeddedPythonExe,
  getEnginePythonPath,
  getEnginePythonExe
} from './paths'

// Python
export {
  checkEmbeddedPythonInstalled,
  installEmbeddedPython,
  checkPythonAvailable,
  getPythonInfo,
  checkEnginePythonInstalled,
  copyPythonForEngine
} from './python'

// Dependencies
export {
  checkSileroInstalled,
  checkCoquiInstalled,
  checkBarkInstalled,
  checkSileroInstalledForAccelerator,
  checkCoquiInstalledForAccelerator,
  checkBarkInstalledForAccelerator,
  checkDependencies,
  needsSetup,
  checkDependenciesAsync
} from './dependencies'

// Utils
export {
  runPipWithProgress,
  downloadFile,
  extractZip,
  getGenerateScriptContent,
  getCoquiGenerateScriptContent,
  getBarkGenerateScriptContent,
  getTTSServerScriptContent,
  findVcvarsallPath
} from './utils'

// Installers
export {
  checkBuildToolsAvailable,
  installBuildTools,
  installPiper,
  installFfmpeg,
  installSilero,
  installCoqui,
  installBark,
  runSetup,
  getEstimatedDownloadSize
} from './installers'

// Voices
export {
  RHVOICE_VOICE_URLS,
  getAvailableRHVoices,
  getInstalledSAPIVoices,
  isRHVoiceInstalled,
  getInstalledRHVoices,
  checkRHVoiceCoreInstalled,
  installRHVoiceCore,
  installRHVoice,
  installPiperVoice
} from './voices'

// GPU
export {
  checkNvidiaGPU,
  getAvailableAccelerators,
  getCurrentAccelerator,
  removeSileroInstallation,
  removeCoquiInstallation,
  checkGPUToolkit,
  reinstallSileroWithAccelerator,
  reinstallCoquiWithAccelerator
} from './gpu'
