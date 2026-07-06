// Interface for pip progress tracking
export interface PipProgressInfo {
  phase: 'collecting' | 'downloading' | 'installing' | 'processing'
  package: string
  downloaded?: number
  total?: number
  percentage?: number
}

export interface SetupProgress {
  stage: string
  progress: number
  details: string
}

export interface DependencyStatus {
  piper: boolean
  ffmpeg: boolean
  silero: boolean
  sileroAvailable: boolean // true if Python is available for Silero setup
  coqui: boolean
  coquiAvailable: boolean // true if Python is available for Coqui setup
  coquiBuildToolsAvailable: boolean // true if Visual Studio Build Tools are installed
  rhvoiceCore: boolean // true if RHVoice SAPI engine is installed
  rhvoiceVoices: string[] // list of installed RHVoice voice names
  piperVoices: {
    ruRU: string[]
    enUS: string[]
  }
}

export interface GPUInfo {
  available: boolean
  name?: string
  vram?: number  // in MB
  toolkitMissing?: boolean  // GPU is present but required toolkit is not installed
  toolkitMessage?: string   // Message explaining what toolkit is needed
  toolkitUrl?: string       // URL to download the toolkit
  knownIssue?: {            // Known issue that may affect this GPU
    title: string
    description: string
    issueUrl?: string       // Link to GitHub issue tracking the problem
    workaround?: string     // Suggested workaround
  }
}

export interface AvailableAccelerators {
  cpu: true
  cuda: GPUInfo
  directml: GPUInfo
}

export type AcceleratorType = 'cpu' | 'cuda' | 'directml'

export interface AcceleratorConfig {
  accelerator: AcceleratorType
  installedAt: string
  pytorchVersion?: string
}

export interface ReinstallProgress {
  stage: 'installing' | 'complete' | 'error'
  message: string
  progress?: number
}
