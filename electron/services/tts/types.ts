export type TTSProvider = 'rhvoice' | 'piper' | 'silero' | 'elevenlabs' | 'coqui' | 'bark'

export interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: TTSProvider
  modelPath?: string // For Piper and Silero
  voiceId?: string // For ElevenLabs
  isInstalled?: boolean // For RHVoice and Piper
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
  memory_gb: number
  cpu_percent: number
  device: string
  backend: string
  gpu_name: string | null
  preferred_device: string
  available_devices: AvailableDevice[]
  ipex_available: boolean
}
