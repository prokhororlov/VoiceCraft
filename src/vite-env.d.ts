/// <reference types="vite/client" />

export {}

interface FileInfo {
  name: string
  extension: string
  size: number
  path: string
}

interface BookContent {
  title: string
  author: string
  chapters: Array<{
    title: string
    content: string
  }>
  fullText: string
}

interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: 'system' | 'piper' | 'silero' | 'elevenlabs' | 'coqui' | 'bark' | 'rhvoice'
  modelPath?: string
  voiceId?: string
  isInstalled?: boolean
}

interface RHVoiceInfo {
  name: string
  gender: 'Male' | 'Female'
}

interface RHVoiceUrls {
  [language: string]: {
    [voiceName: string]: {
      url: string
      gender: 'Male' | 'Female'
    }
  }
}

interface ConversionProgress {
  progress: number
  status: string
}

interface SetupProgress {
  stage: string
  progress: number
  details: string
}

interface DependencyStatus {
  piper: boolean
  ffmpeg: boolean
  silero: boolean
  sileroAvailable: boolean
  coqui: boolean
  coquiAvailable: boolean
  coquiBuildToolsAvailable: boolean
  bark: boolean
  barkAvailable: boolean
  rhvoiceCore: boolean
  rhvoiceVoices: string[]
  piperVoices: {
    ruRU: string[]
    enUS: string[]
  }
}

interface GPUInfo {
  available: boolean
  name?: string
  vram?: number
  toolkitMissing?: boolean
  toolkitMessage?: string
  toolkitUrl?: string
}

interface AvailableAccelerators {
  cpu: true
  cuda: GPUInfo
  directml: GPUInfo
}

type AcceleratorType = 'cpu' | 'cuda' | 'directml'

interface AcceleratorConfig {
  accelerator: AcceleratorType
  installedAt: string
  pytorchVersion?: string
}

interface ReinstallProgress {
  stage: 'stopping' | 'removing' | 'installing' | 'starting' | 'complete' | 'error'
  message: string
  progress?: number
}

interface ReleaseInfo {
  version: string
  releaseDate: string
  downloadUrl: string
  releaseNotes: string
  fileName: string
}

interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseInfo?: ReleaseInfo
  error?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

interface TTSServerStatus {
  running: boolean
  silero: { ru_loaded: boolean; en_loaded: boolean }
  coqui: { loaded: boolean }
  memory_gb: number
  cpu_percent: number
  device: string
  backend: string
  gpu_name: string | null
  preferred_device: string
  available_devices: Array<{
    id: string
    name: string
    available: boolean
    description: string
  }>
}

interface ElectronAPI {
  // File API
  openFileDialog: () => Promise<string | null>
  saveFileDialog: (defaultName: string) => Promise<string | null>
  parseBook: (filePath: string) => Promise<{ success: boolean; content?: BookContent; error?: string }>
  getFileInfo: (filePath: string) => Promise<{ success: boolean; info?: FileInfo; error?: string }>

  // TTS API
  getVoices: (language: string) => Promise<VoiceInfo[]>
  getAvailableProviders: () => Promise<Array<{ id: string; name: string; description: string }>>
  convertToSpeech: (
    text: string,
    voice: string,
    outputPath: string,
    options: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string }>
  abortConversion: () => Promise<{ success: boolean }>
  previewVoice: (text: string, voiceShortName: string, options?: Record<string, unknown>) => Promise<{ success: boolean; audioData?: string; error?: string }>
  abortPreview: () => Promise<{ success: boolean }>
  onConversionProgress: (callback: (data: ConversionProgress) => void) => () => void
  onModelLoadProgress: (callback: (data: { progress: number; engine: string; language?: string }) => void) => () => void

  // TTS Server API
  ttsServerStart: () => Promise<{ success: boolean; error?: string }>
  ttsServerStop: () => Promise<{ success: boolean; error?: string }>
  ttsServerStatus: () => Promise<TTSServerStatus>
  ttsModelLoad: (engine: 'silero' | 'coqui', language?: string) => Promise<{ success: boolean; memory_gb: number; error?: string }>
  ttsModelUnload: (engine: 'silero' | 'coqui' | 'all', language?: string) => Promise<{ success: boolean; memory_gb: number }>
  ttsSetDevice: (device: string) => Promise<{ success: boolean; error?: string }>

  // Setup API
  checkDependencies: () => Promise<DependencyStatus>
  checkDependenciesAsync: () => Promise<DependencyStatus>
  checkPythonAvailable: () => Promise<boolean>
  installEmbeddedPython: () => Promise<{ success: boolean; error?: string }>
  checkEmbeddedPython: () => Promise<boolean>
  getPythonInfo: () => Promise<{ available: boolean; path: string | null; isEmbedded: boolean; version: string | null }>
  installSilero: (accelerator?: AcceleratorType) => Promise<{ success: boolean; error?: string }>
  installCoqui: (accelerator?: AcceleratorType) => Promise<{ success: boolean; error?: string; needsBuildTools?: boolean }>
  installBark: (accelerator?: AcceleratorType) => Promise<{ success: boolean; error?: string }>
  checkBuildTools: () => Promise<boolean>
  installBuildTools: () => Promise<{ success: boolean; error?: string; requiresRestart?: boolean }>
  installPiper: () => Promise<{ success: boolean; error?: string }>
  installFfmpeg: () => Promise<{ success: boolean; error?: string }>

  // GPU/Accelerator API
  getAvailableAccelerators: () => Promise<AvailableAccelerators>
  getCurrentSileroAccelerator: () => Promise<AcceleratorConfig | null>
  getCurrentCoquiAccelerator: () => Promise<AcceleratorConfig | null>
  reinstallSileroWithAccelerator: (accelerator: AcceleratorType) => Promise<{ success: boolean; error?: string }>
  reinstallCoquiWithAccelerator: (accelerator: AcceleratorType) => Promise<{ success: boolean; error?: string }>
  onReinstallProgress: (callback: (data: ReinstallProgress) => void) => () => void
  checkGPUToolkit: (accelerator: AcceleratorType) => Promise<{
    available: boolean
    error?: string
    message?: string
    downloadUrl?: string
  }>

  // Piper Voice API
  installPiperVoice: (lang: 'ru_RU' | 'en_US', voiceName: string, quality: string) => Promise<{ success: boolean; error?: string }>

  // RHVoice API
  installRHVoiceCore: () => Promise<{ success: boolean; error?: string }>
  installRHVoice: (voiceName: string, language: string) => Promise<{ success: boolean; error?: string }>
  getInstalledRHVoices: () => Promise<string[]>
  getAvailableRHVoices: (language: string) => Promise<RHVoiceInfo[]>
  getRHVoiceUrls: () => Promise<RHVoiceUrls>

  // Setup Wizard API
  needsSetup: () => Promise<boolean>
  runSetup: (options?: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
    installSilero?: boolean
  }) => Promise<{ success: boolean; error?: string }>
  getEstimatedDownloadSize: () => Promise<{ size: number; includeSilero: boolean }>

  // External Links
  openExternal: (url: string) => Promise<void>
  onSetupProgress: (callback: (data: SetupProgress) => void) => () => void

  // Settings API
  getElevenLabsApiKey: () => Promise<string | null>
  setElevenLabsApiKey: (apiKey: string) => Promise<{ success: boolean }>

  // Updates API
  checkForUpdates: () => Promise<UpdateCheckResult>
  downloadUpdate: (releaseInfo: ReleaseInfo) => Promise<{ success: boolean; installerPath?: string; error?: string }>
  installUpdate: (installerPath: string) => Promise<{ success: boolean; error?: string }>
  onUpdateDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void

  // Window API
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
