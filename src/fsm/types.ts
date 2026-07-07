import type { DependencyStatus, AvailableAccelerators, AcceleratorConfig, AcceleratorType, ReinstallProgress } from '../../electron/services/setup/types'

// ================== TTS PROVIDERS ==================

export type TTSProvider = 'rhvoice' | 'piper' | 'silero' | 'coqui' | 'bark' | 'elevenlabs'

// Offline-совместимые провайдеры (не требуют интернет)
export const OFFLINE_PROVIDERS: readonly TTSProvider[] = ['rhvoice', 'piper', 'silero', 'coqui', 'bark']
// Online-only провайдеры
export const ONLINE_ONLY_PROVIDERS: readonly TTSProvider[] = ['elevenlabs']

// ================== ERROR TYPES ==================

export type ErrorType =
  | 'installation_error'
  | 'generation_error'
  | 'toolkit_error'
  | 'network_error'
  | 'permission_error'
  | 'disk_error'
  | 'api_error'
  | 'unknown_error'

export interface BaseError {
  type: ErrorType
  message: string
  details?: string
  timestamp: string
}

export interface SetupError extends BaseError {
  type: 'installation_error' | 'network_error' | 'disk_error' | 'permission_error'
  component: 'ffmpeg' | 'python' | 'silero' | 'coqui' | 'bark' | 'piper' | 'rhvoice'
}

export interface ConversionError extends BaseError {
  type: 'generation_error' | 'installation_error' | 'api_error' | 'network_error'
  provider: TTSProvider
  isInstallationRelated: boolean // Ключевой флаг для решения FSM
  chunksFailed?: number
  chunksTotal?: number
}

export interface ProviderError extends BaseError {
  type: 'installation_error' | 'network_error' | 'disk_error' | 'permission_error'
  provider: TTSProvider
  stage?: 'download' | 'extract' | 'install' | 'verify'
}

export interface ToolkitError extends BaseError {
  type: 'toolkit_error'
  toolkit: 'cuda'
  subtype: 'toolkit_missing' | 'toolkit_restart_required'
  title: string
  description: string
  downloadUrl?: string
  steps: string[]
  fallbackOption?: {
    engine: 'silero' | 'coqui'
    accelerator: 'cpu'
  }
}

// ================== APP STATES ==================

export interface LoadingState {
  type: 'LOADING'
}

export interface SetupRequiredState {
  type: 'SETUP_REQUIRED'
  missingDependencies: {
    ffmpeg: boolean
  }
}

export interface SetupInstallingState {
  type: 'SETUP_INSTALLING'
  progress: number
  details: string
  stage: 'downloading' | 'extracting' | 'verifying'
}

export interface SetupCompleteState {
  type: 'SETUP_COMPLETE'
}

export interface SetupErrorState {
  type: 'SETUP_ERROR'
  error: SetupError
  canRetry: boolean
}

export interface ReadyState {
  type: 'READY'
  dependencies: DependencyStatus
  accelerators: AvailableAccelerators
  currentAccelerators: {
    silero: AcceleratorConfig | null
    coqui: AcceleratorConfig | null
  }
  isOnline: boolean
}

export interface OfflineState {
  type: 'OFFLINE'
  dependencies: DependencyStatus
  accelerators: AvailableAccelerators
  currentAccelerators: {
    silero: AcceleratorConfig | null
    coqui: AcceleratorConfig | null
  }
}

export interface ConvertingState {
  type: 'CONVERTING'
  progress: number
  status: string
  canCancel: boolean
  outputPath: string
}

export interface ConversionErrorState {
  type: 'CONVERSION_ERROR'
  error: ConversionError
  canRetry: boolean
  offerReinstall: boolean
}

export interface InstallingProviderState {
  type: 'INSTALLING_PROVIDER'
  provider: TTSProvider
  accelerator?: AcceleratorType
  progress: number
  details: string
}

export interface ProviderErrorState {
  type: 'PROVIDER_ERROR'
  provider: TTSProvider
  error: ProviderError
  canRetry: boolean
  offerSetupScreen: boolean
}

export interface ReinstallingAcceleratorState {
  type: 'REINSTALLING_ACCELERATOR'
  engine: 'silero' | 'coqui'
  targetAccelerator: AcceleratorType
  progress: ReinstallProgress
}

export interface ToolkitErrorState {
  type: 'TOOLKIT_ERROR'
  toolkit: 'cuda'
  error: ToolkitError
  downloadUrl: string
  requiresRestart: boolean
}

export type AppState =
  | LoadingState
  | SetupRequiredState
  | SetupInstallingState
  | SetupCompleteState
  | SetupErrorState
  | ReadyState
  | OfflineState
  | ConvertingState
  | ConversionErrorState
  | InstallingProviderState
  | ProviderErrorState
  | ReinstallingAcceleratorState
  | ToolkitErrorState

// ================== ACTIONS ==================

export type AppAction =
  // Startup
  | { type: 'STARTUP_CHECK_COMPLETE'; needsSetup: boolean; dependencies?: DependencyStatus; accelerators?: AvailableAccelerators; currentAccelerators?: { silero: AcceleratorConfig | null; coqui: AcceleratorConfig | null }; isOnline?: boolean }

  // Setup
  | { type: 'START_SETUP' }
  | { type: 'SETUP_PROGRESS'; progress: number; details: string; stage: 'downloading' | 'extracting' | 'verifying' }
  | { type: 'SETUP_SUCCESS' }
  | { type: 'SETUP_FAILED'; error: SetupError }
  | { type: 'RETRY_SETUP' }
  | { type: 'COMPLETE_SETUP'; dependencies: DependencyStatus; accelerators: AvailableAccelerators; currentAccelerators: { silero: AcceleratorConfig | null; coqui: AcceleratorConfig | null } }

  // Conversion
  | { type: 'START_CONVERSION'; outputPath: string }
  | { type: 'CONVERSION_PROGRESS'; progress: number; status: string }
  | { type: 'CONVERSION_SUCCESS' }
  | { type: 'CONVERSION_FAILED'; error: ConversionError }
  | { type: 'CANCEL_CONVERSION' }
  | { type: 'RETRY_CONVERSION' }
  | { type: 'DISMISS_CONVERSION_ERROR' }

  // Provider Installation
  | { type: 'START_PROVIDER_INSTALL'; provider: TTSProvider; accelerator?: AcceleratorType }
  | { type: 'PROVIDER_INSTALL_PROGRESS'; progress: number; details: string }
  | { type: 'PROVIDER_INSTALL_SUCCESS'; provider: TTSProvider; dependencies: DependencyStatus; accelerators: AvailableAccelerators; currentAccelerators: { silero: AcceleratorConfig | null; coqui: AcceleratorConfig | null } }
  | { type: 'PROVIDER_INSTALL_FAILED'; error: ProviderError }
  | { type: 'RETRY_PROVIDER_INSTALL' }
  | { type: 'DISMISS_PROVIDER_ERROR' }
  | { type: 'GO_TO_SETUP' }

  // Accelerator Reinstall
  | { type: 'START_ACCELERATOR_REINSTALL'; engine: 'silero' | 'coqui'; accelerator: AcceleratorType }
  | { type: 'REINSTALL_PROGRESS'; progress: ReinstallProgress }
  | { type: 'REINSTALL_SUCCESS'; currentAccelerators: { silero: AcceleratorConfig | null; coqui: AcceleratorConfig | null } }
  | { type: 'REINSTALL_FAILED'; error: ProviderError | ToolkitError }
  | { type: 'TOOLKIT_ERROR_OCCURRED'; error: ToolkitError }
  | { type: 'DISMISS_TOOLKIT_ERROR' }
  | { type: 'RETRY_AFTER_TOOLKIT' }
  | { type: 'USE_CPU_FALLBACK'; engine: 'silero' | 'coqui' }

  // Network
  | { type: 'NETWORK_ONLINE' }
  | { type: 'NETWORK_OFFLINE' }

  // Refresh
  | { type: 'REFRESH_DEPENDENCIES'; dependencies: DependencyStatus }
  | { type: 'REFRESH_ACCELERATORS'; accelerators: AvailableAccelerators; currentAccelerators: { silero: AcceleratorConfig | null; coqui: AcceleratorConfig | null } }

// ================== FSM CONTEXT ==================

export interface FSMContext {
  state: AppState

  // Persisted data (survives state transitions)
  dependencies: DependencyStatus | null
  accelerators: AvailableAccelerators | null
  currentAccelerators: {
    silero: AcceleratorConfig | null
    coqui: AcceleratorConfig | null
  }
  isOnline: boolean

  // Conversion context (for retry)
  lastConversionParams?: {
    outputPath: string
  }

  // Error history (for debugging)
  errorHistory: BaseError[]
}

// ================== INITIAL STATE ==================

export const initialContext: FSMContext = {
  state: { type: 'LOADING' },
  dependencies: null,
  accelerators: null,
  currentAccelerators: {
    silero: null,
    coqui: null
  },
  isOnline: true, // Optimistic default
  errorHistory: []
}
