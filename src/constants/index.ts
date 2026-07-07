import { Zap, Cpu, Sparkles, Cloud, Wand2, AudioWaveform } from 'lucide-react'
import { createElement } from 'react'
import type { ReactNode } from 'react'

export const LANGUAGES = [
  { code: 'ru-RU', name: 'Русский' },
  { code: 'en', name: 'English' },
] as const

export const PROVIDER_ICONS: Record<string, ReactNode> = {
  system: createElement(Zap, { className: 'h-4 w-4' }),
  rhvoice: createElement(Zap, { className: 'h-4 w-4' }),
  piper: createElement(Cpu, { className: 'h-4 w-4' }),
  silero: createElement(Sparkles, { className: 'h-4 w-4' }),
  coqui: createElement(Wand2, { className: 'h-4 w-4' }),
  bark: createElement(AudioWaveform, { className: 'h-4 w-4' }),
  elevenlabs: createElement(Cloud, { className: 'h-4 w-4' }),
}

export const DEFAULT_PREVIEW_TEXT = {
  en: 'Hello! This is an example of how the voice sounds.',
  ru: 'Привет! Это пример того, как звучит голос.',
} as const
