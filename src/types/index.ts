import type { ReactNode } from 'react'

export interface BookContent {
  title: string
  author: string
  chapters: Array<{ title: string; content: string }>
  fullText: string
}

export interface FileInfo {
  name: string
  extension: string
  size: number
  path: string
}

export interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: 'system' | 'piper' | 'silero' | 'elevenlabs' | 'coqui' | 'bark' | 'rhvoice'
  isInstalled?: boolean
}

export interface ProviderInfo {
  id: string
  name: string
  description: string
  icon: ReactNode
  requiresSetup?: boolean
}

export interface AcceleratorInfo {
  cpu: true
  cuda: {
    available: boolean
    name?: string
    vram?: number
    toolkitMissing?: boolean
    toolkitMessage?: string
    toolkitUrl?: string
  }
  directml: {
    available: boolean
    name?: string
    vram?: number
    toolkitMissing?: boolean
    toolkitMessage?: string
    toolkitUrl?: string
  }
}

export interface AcceleratorConfig {
  accelerator: 'cpu' | 'cuda' | 'directml'
  installedAt: string
  pytorchVersion?: string
}

export interface TTSServerStatus {
  running: boolean
  silero: { ru_loaded: boolean; en_loaded: boolean }
  coqui: { loaded: boolean }
  bark: { loaded: boolean; backend?: string | null; acoustic_backend?: string | null; codec_backend?: string | null }
  memory_gb: number
  cpu_percent: number
  device: string
  backend: string
  gpu_name: string | null
  preferred_device: string
  available_devices: DeviceInfo[]
}

export interface DeviceInfo {
  id: string
  name: string
  available: boolean
  description: string
}

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseInfo?: {
    version: string
    releaseDate: string
    downloadUrl: string
    releaseNotes: string
    fileName: string
  }
  error?: string
}

export interface ReinstallProgress {
  stage: string
  message: string
  progress?: number
}

export interface InstallProgress {
  progress: number
  details: string
}

export type TTSProvider = 'system' | 'piper' | 'silero' | 'elevenlabs' | 'coqui' | 'bark' | 'rhvoice'
