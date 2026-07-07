import fs from 'fs'
import path from 'path'
import { VoiceInfo, TTSProvider } from './types'
import { getPiperResourcesPath } from './utils'
import { checkSileroInstalled, checkCoquiInstalled, checkBarkInstalled, getInstalledRHVoices } from '../setup'

// RHVoice configurations (Windows SAPI)
export const RHVOICE_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aleksandr', shortName: 'Aleksandr', gender: 'Male', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Irina', shortName: 'Irina', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Anna', shortName: 'Anna', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Elena', shortName: 'Elena', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' }
  ],
  'en': [
    { name: 'Bdl', shortName: 'Bdl', gender: 'Male', locale: 'en', provider: 'rhvoice' },
    { name: 'Slt', shortName: 'Slt', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Clb', shortName: 'Clb', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Alan', shortName: 'Alan', gender: 'Male', locale: 'en', provider: 'rhvoice' }
  ]
}

// Piper voice configurations
export const PIPER_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    {
      name: 'Denis',
      shortName: 'piper-denis',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/denis/medium/ru_RU-denis-medium.onnx'
    },
    {
      name: 'Dmitri',
      shortName: 'piper-dmitri',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx'
    },
    {
      name: 'Irina',
      shortName: 'piper-irina',
      gender: 'Female',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/irina/medium/ru_RU-irina-medium.onnx'
    },
    {
      name: 'Ruslan',
      shortName: 'piper-ruslan',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx'
    }
  ],
  'en': [
    // en_US voices
    {
      name: 'Amy (US)',
      shortName: 'piper-amy',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/amy/medium/en_US-amy-medium.onnx'
    },
    {
      name: 'Arctic (US)',
      shortName: 'piper-arctic',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/arctic/medium/en_US-arctic-medium.onnx'
    },
    {
      name: 'Bryce (US)',
      shortName: 'piper-bryce',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/bryce/medium/en_US-bryce-medium.onnx'
    },
    {
      name: 'Danny (US)',
      shortName: 'piper-danny',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/danny/low/en_US-danny-low.onnx'
    },
    {
      name: 'HFC Female (US)',
      shortName: 'piper-hfc-female',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/hfc_female/medium/en_US-hfc_female-medium.onnx'
    },
    {
      name: 'HFC Male (US)',
      shortName: 'piper-hfc-male',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/hfc_male/medium/en_US-hfc_male-medium.onnx'
    },
    {
      name: 'Joe (US)',
      shortName: 'piper-joe',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/joe/medium/en_US-joe-medium.onnx'
    },
    {
      name: 'John (US)',
      shortName: 'piper-john',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/john/medium/en_US-john-medium.onnx'
    },
    {
      name: 'Kathleen (US)',
      shortName: 'piper-kathleen',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/kathleen/low/en_US-kathleen-low.onnx'
    },
    {
      name: 'Kristin (US)',
      shortName: 'piper-kristin',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/kristin/medium/en_US-kristin-medium.onnx'
    },
    {
      name: 'Kusal (US)',
      shortName: 'piper-kusal',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/kusal/medium/en_US-kusal-medium.onnx'
    },
    {
      name: 'L2Arctic (US)',
      shortName: 'piper-l2arctic',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/l2arctic/medium/en_US-l2arctic-medium.onnx'
    },
    {
      name: 'Lessac (US)',
      shortName: 'piper-lessac',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/lessac/medium/en_US-lessac-medium.onnx'
    },
    {
      name: 'LibriTTS (US)',
      shortName: 'piper-libritts',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/libritts/high/en_US-libritts-high.onnx'
    },
    {
      name: 'LibriTTS-R (US)',
      shortName: 'piper-libritts-r',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/libritts_r/medium/en_US-libritts_r-medium.onnx'
    },
    {
      name: 'LJSpeech (US)',
      shortName: 'piper-ljspeech',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/ljspeech/medium/en_US-ljspeech-medium.onnx'
    },
    {
      name: 'Norman (US)',
      shortName: 'piper-norman',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/norman/medium/en_US-norman-medium.onnx'
    },
    {
      name: 'Reza Ibrahim (US)',
      shortName: 'piper-reza-ibrahim',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/reza_ibrahim/medium/en_US-reza_ibrahim-medium.onnx'
    },
    {
      name: 'Ryan (US)',
      shortName: 'piper-ryan',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/ryan/medium/en_US-ryan-medium.onnx'
    },
    {
      name: 'Sam (US)',
      shortName: 'piper-sam',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/sam/medium/en_US-sam-medium.onnx'
    },
    // en_GB voices
    {
      name: 'Alan (GB)',
      shortName: 'piper-alan',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/alan/medium/en_GB-alan-medium.onnx'
    },
    {
      name: 'Alba (GB)',
      shortName: 'piper-alba',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/alba/medium/en_GB-alba-medium.onnx'
    },
    {
      name: 'Aru (GB)',
      shortName: 'piper-aru',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/aru/medium/en_GB-aru-medium.onnx'
    },
    {
      name: 'Cori (GB)',
      shortName: 'piper-cori',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/cori/medium/en_GB-cori-medium.onnx'
    },
    {
      name: 'Jenny Dioco (GB)',
      shortName: 'piper-jenny-dioco',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx'
    },
    {
      name: 'Northern English Male (GB)',
      shortName: 'piper-northern-english-male',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx'
    },
    {
      name: 'Semaine (GB)',
      shortName: 'piper-semaine',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/semaine/medium/en_GB-semaine-medium.onnx'
    },
    {
      name: 'Southern English Female (GB)',
      shortName: 'piper-southern-english-female',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx'
    },
    {
      name: 'VCTK (GB)',
      shortName: 'piper-vctk',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_GB/vctk/medium/en_GB-vctk-medium.onnx'
    }
  ]
}

// Silero voice configurations
// Russian v5_ru has 5 speakers, English v3_en has 118 speakers (en_0 to en_117)
export const SILERO_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aidar', shortName: 'silero-aidar', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/aidar' },
    { name: 'Baya', shortName: 'silero-baya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/baya' },
    { name: 'Kseniya', shortName: 'silero-kseniya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/kseniya' },
    { name: 'Xenia', shortName: 'silero-xenia', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/xenia' },
    { name: 'Eugene', shortName: 'silero-eugene', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/eugene' }
  ],
  'en': [
    // Silero v3_en has 118 speakers (en_0 to en_117)
    // Gender info is approximate based on voice characteristics
    ...Array.from({ length: 118 }, (_, i) => ({
      name: `Speaker ${i}`,
      shortName: `silero-en-${i}`,
      gender: (i % 2 === 0 ? 'Female' : 'Male') as 'Male' | 'Female',
      locale: 'en' as const,
      provider: 'silero' as const,
      modelPath: `v3_en/en_${i}`
    }))
  ]
}

// ElevenLabs voice configurations
// Voice IDs from ElevenLabs API - these are the default voices available
export const ELEVENLABS_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam', gender: 'Male', locale: 'ru-RU', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel', gender: 'Female', locale: 'ru-RU', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' }
  ],
  'en': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam-en', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel-en', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
    { name: 'ElevenLabs Domi', shortName: 'elevenlabs-domi', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'AZnzlk1XvdvUeBnXmlld' },
    { name: 'ElevenLabs Bella', shortName: 'elevenlabs-bella', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
    { name: 'ElevenLabs Josh', shortName: 'elevenlabs-josh', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'TxGEqnHWrfWFTfGW9XjX' },
    { name: 'ElevenLabs Sam', shortName: 'elevenlabs-sam', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'yoZ06aMxZJJ28mfd3POQ' }
  ]
}

// Coqui XTTS-v2 voice configurations (built-in speakers)
// Full list of 55 speakers from speakers_xtts.pth
const COQUI_FEMALE_SPEAKERS = [
  'Claribel Dervla', 'Daisy Studious', 'Gracie Wise', 'Tammie Ema',
  'Alison Dietlinde', 'Ana Florence', 'Annmarie Nele', 'Asya Anara',
  'Brenda Stern', 'Gitta Nikolina', 'Henriette Usha', 'Sofia Hellen',
  'Tammy Grit', 'Tanja Adelina', 'Vjollca Johnnie', 'Nova Hogarth',
  'Maja Ruoho', 'Uta Obando', 'Lidiya Szekeres', 'Chandra MacFarland',
  'Szofi Granger', 'Camilla Holmström', 'Lilya Stainthorpe', 'Zofija Kendrick',
  'Narelle Moon', 'Barbora MacLean', 'Alexandra Hisakawa', 'Alma María',
  'Rosemary Okafor', 'Ige Behringer'
]

const COQUI_MALE_SPEAKERS = [
  'Andrew Chipper', 'Badr Odhiambo', 'Dionisio Schuyler', 'Royston Min',
  'Viktor Eka', 'Abrahan Mack', 'Adde Michal', 'Baldur Sanjin',
  'Craig Gutsy', 'Damien Black', 'Gilberto Mathias', 'Ilkin Urbano',
  'Kazuhiko Atallah', 'Ludvig Milivoj', 'Suad Qasim', 'Torcull Diarmuid',
  'Viktor Menelaos', 'Zacharie Aimilios', 'Filip Traverse', 'Damjan Chapman',
  'Wulf Carlevaro', 'Aaron Dreschner', 'Kumar Dahl', 'Eugenio Mataracı',
  'Ferran Simen', 'Xavier Hayasaka'
]

function createCoquiVoice(name: string, gender: 'Male' | 'Female', locale: string, suffix: string): VoiceInfo {
  const shortName = `coqui-${name.toLowerCase().replace(/\s+/g, '-')}${suffix}`
  return { name, shortName, gender, locale, provider: 'coqui', modelPath: name }
}

export const COQUI_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    ...COQUI_FEMALE_SPEAKERS.map(name => createCoquiVoice(name, 'Female', 'ru-RU', '')),
    ...COQUI_MALE_SPEAKERS.map(name => createCoquiVoice(name, 'Male', 'ru-RU', ''))
  ],
  'en': [
    ...COQUI_FEMALE_SPEAKERS.map(name => createCoquiVoice(name, 'Female', 'en', '-en')),
    ...COQUI_MALE_SPEAKERS.map(name => createCoquiVoice(name, 'Male', 'en', '-en'))
  ]
}

function createBarkVoice(language: string, index: number): VoiceInfo {
  const isRussian = language === 'ru-RU'
  const gender = (index % 2 === 0 ? 'Male' : 'Female') as 'Male' | 'Female'
  const presetLang = isRussian ? 'ru' : 'en'
  return {
    name: `Bark ${isRussian ? 'Russian' : 'English'} Speaker ${index}`,
    shortName: `bark-${presetLang}-${index}`,
    gender,
    locale: language,
    provider: 'bark',
    modelPath: `v2/${presetLang}_speaker_${index}`
  }
}

export const BARK_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': Array.from({ length: 10 }, (_, index) => createBarkVoice('ru-RU', index)),
  'en': Array.from({ length: 10 }, (_, index) => createBarkVoice('en', index))
}

// Check if Piper voice model file exists
export function isPiperVoiceInstalled(modelPath: string): boolean {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)
  const jsonPath = fullModelPath + '.json'
  return fs.existsSync(fullModelPath) && fs.existsSync(jsonPath)
}

export async function getVoicesForLanguage(language: string, provider?: TTSProvider): Promise<VoiceInfo[]> {
  let allVoices: VoiceInfo[] = []

  if (!provider || provider === 'rhvoice') {
    // Get installed RHVoice voices from SAPI
    const installedRHVoices = await getInstalledRHVoices()
    const rhvoiceVoices = (RHVOICE_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: installedRHVoices.some(v => v.toLowerCase() === voice.shortName.toLowerCase())
    }))
    allVoices = allVoices.concat(rhvoiceVoices)
  }

  if (!provider || provider === 'piper') {
    // Check if each Piper voice model file exists
    const piperVoices = (PIPER_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: voice.modelPath ? isPiperVoiceInstalled(voice.modelPath) : false
    }))
    allVoices = allVoices.concat(piperVoices)
  }

  // Silero requires Python environment to be set up
  if ((!provider || provider === 'silero') && checkSileroInstalled()) {
    allVoices = allVoices.concat(SILERO_VOICES[language] || [])
  }

  if (!provider || provider === 'elevenlabs') {
    allVoices = allVoices.concat(ELEVENLABS_VOICES[language] || [])
  }

  // Coqui XTTS-v2 requires Python environment to be set up
  if ((!provider || provider === 'coqui') && checkCoquiInstalled()) {
    allVoices = allVoices.concat(COQUI_VOICES[language] || [])
  }

  // Bark Small requires Python environment to be set up
  if ((!provider || provider === 'bark') && checkBarkInstalled()) {
    allVoices = allVoices.concat(BARK_VOICES[language] || [])
  }

  if (allVoices.length === 0) {
    throw new Error(`Language ${language} is not supported`)
  }

  return allVoices
}
