import { TTSProvider } from './types'
import { RHVOICE_VOICES, PIPER_VOICES, SILERO_VOICES, ELEVENLABS_VOICES, COQUI_VOICES, BARK_VOICES } from './voices'

// ElevenLabs API key storage
let elevenLabsApiKey: string | null = null

export function setElevenLabsApiKey(apiKey: string): void {
  elevenLabsApiKey = apiKey
}

export function getElevenLabsApiKey(): string | null {
  return elevenLabsApiKey
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: 'ru-RU', name: 'Русский' },
    { code: 'en', name: 'English' }
  ]
}

export function getAvailableProviders(): Array<{ id: TTSProvider; name: string; requiresSetup?: boolean }> {
  return [
    { id: 'rhvoice', name: 'RHVoice', requiresSetup: true },
    { id: 'piper', name: 'Piper', requiresSetup: true },
    { id: 'silero', name: 'Silero', requiresSetup: true },
    { id: 'coqui', name: 'Coqui', requiresSetup: true },
    { id: 'bark', name: 'Bark Small', requiresSetup: true },
    { id: 'elevenlabs', name: 'ElevenLabs', requiresSetup: false }
  ]
}

export function isProviderAvailableForLanguage(provider: TTSProvider, language: string): boolean {
  switch (provider) {
    case 'rhvoice':
      return RHVOICE_VOICES[language] !== undefined
    case 'piper':
      return PIPER_VOICES[language] !== undefined
    case 'silero':
      return SILERO_VOICES[language] !== undefined
    case 'elevenlabs':
      return ELEVENLABS_VOICES[language] !== undefined
    case 'coqui':
      return COQUI_VOICES[language] !== undefined
    case 'bark':
      return BARK_VOICES[language] !== undefined
    default:
      return false
  }
}
