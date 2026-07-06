import fs from 'fs'
import path from 'path'
import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import http from 'http'
import { VoiceInfo } from './types'
import {
  getPiperResourcesPath,
  getPiperExecutable,
  getSileroPythonExecutable,
  getSileroScript,
  getCoquiPythonExecutable,
  getCoquiScript,
  getFfmpegExecutable
} from './utils'
import {
  getTTSServerStatus,
  generateViaServer,
  generateViaServerForPreview
} from './server'
import {
  RHVOICE_VOICES,
  PIPER_VOICES,
  SILERO_VOICES,
  ELEVENLABS_VOICES,
  COQUI_VOICES
} from './voices'
import { getElevenLabsApiKey } from './providers'
import { getCustomVoiceAudioPath } from './customVoices'

const execAsync = promisify(exec)

// Temp directory name (app-specific to avoid conflicts)
const TEMP_AUDIO_DIR_NAME = 'bookify_tts_temp'

// Track last used output directory for cleanup
let lastOutputDir: string | null = null

// Preview abort control
let currentPreviewProcess: ChildProcess | null = null
let currentPreviewRequest: http.ClientRequest | null = null
let previewAborted = false

// Abort current preview generation
export function abortPreview(): void {
  previewAborted = true

  // Kill the process if running
  if (currentPreviewProcess) {
    try {
      currentPreviewProcess.kill('SIGTERM')
    } catch {
      // Process may have already exited
    }
    currentPreviewProcess = null
  }

  // Abort HTTP request if running
  if (currentPreviewRequest) {
    try {
      currentPreviewRequest.destroy()
    } catch {
      // Request may have already completed
    }
    currentPreviewRequest = null
  }
}

// ============= Text Processing =============

// Clean text for TTS
// Number to words conversion rules
// Based on Benedict Lee's dictionary (Sep 2022)

interface NumberRule {
  pattern: RegExp
  replacement: string | ((match: string, ...groups: string[]) => string)
}

// Russian number conversion rules
const RUSSIAN_NUMBER_RULES: NumberRule[] = [
  // Decimal zeros
  { pattern: /[\.,]0{6}0+/g, replacement: ' много нулей' },
  { pattern: /[\.,]000000/g, replacement: ' шесть нулей' },
  { pattern: /[\.,]00000/g, replacement: ' пять нулей' },
  { pattern: /[\.,]0000/g, replacement: ' четыре нуля' },
  { pattern: /[\.,]000/g, replacement: ' три нуля' },
  { pattern: /[\.,]00/g, replacement: ' ноль ноль' },
  { pattern: /[\.,]0/g, replacement: ' ноль' },

  // Leading zeros
  { pattern: /\b0+(\d+)/g, replacement: '$1' },
  // Too long numbers
  { pattern: /\d{16,}/g, replacement: 'несказанно много' },

  // Standalone zero
  { pattern: /\b0\b/g, replacement: 'ноль' },
]

// English number conversion rules
const ENGLISH_NUMBER_RULES: NumberRule[] = [
  // Decimal zeros
  { pattern: /[\.,]0{6}0+/g, replacement: ' many zero' },
  { pattern: /[\.,]000000/g, replacement: ' six zero' },
  { pattern: /[\.,]00000/g, replacement: ' five zero' },
  { pattern: /[\.,]0000/g, replacement: ' four zero' },
  { pattern: /[\.,]000/g, replacement: ' three zero' },
  { pattern: /[\.,]00/g, replacement: ' two zero' },
  { pattern: /[\.,]0/g, replacement: ' zero' },

  // Leading zeros
  { pattern: /\b0+(\d+)/g, replacement: '$1' },
  // Too long numbers
  { pattern: /\d{16,}/g, replacement: 'too much' },

  // Standalone zero
  { pattern: /\b0\b/g, replacement: 'zero' },
]

// Russian word forms for numbers
const RUSSIAN_UNITS = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const RUSSIAN_TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const RUSSIAN_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const RUSSIAN_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

// English word forms for numbers
const ENGLISH_UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const ENGLISH_TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const ENGLISH_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function convertHundredsRu(num: number): string {
  if (num === 0) return ''

  const parts: string[] = []
  const h = Math.floor(num / 100)
  const t = Math.floor((num % 100) / 10)
  const u = num % 10

  if (h > 0) parts.push(RUSSIAN_HUNDREDS[h])

  if (t === 1) {
    parts.push(RUSSIAN_TEENS[u])
  } else {
    if (t > 1) parts.push(RUSSIAN_TENS[t])
    if (u > 0) parts.push(RUSSIAN_UNITS[u])
  }

  return parts.join(' ').trim()
}

function convertHundredsEn(num: number): string {
  if (num === 0) return ''

  const parts: string[] = []
  const h = Math.floor(num / 100)
  const t = Math.floor((num % 100) / 10)
  const u = num % 10

  if (h > 0) parts.push(ENGLISH_UNITS[h] + ' hundred')

  if (t === 1) {
    parts.push(ENGLISH_TEENS[u])
  } else {
    if (t > 1) {
      if (u > 0) {
        parts.push(ENGLISH_TENS[t] + '-' + ENGLISH_UNITS[u])
      } else {
        parts.push(ENGLISH_TENS[t])
      }
    } else if (u > 0) {
      parts.push(ENGLISH_UNITS[u])
    }
  }

  return parts.join(' ').trim()
}

// Russian plural forms for scale words
function getRussianScaleWord(num: number, one: string, few: string, many: string): string {
  const lastTwo = num % 100
  const lastOne = num % 10

  if (lastTwo >= 11 && lastTwo <= 19) return many
  if (lastOne === 1) return one
  if (lastOne >= 2 && lastOne <= 4) return few
  return many
}

function numberToWordsRu(num: number): string {
  if (num === 0) return 'ноль'
  if (num >= 1000000000000000) return 'несказанно много'

  const parts: string[] = []

  // Trillions
  const trillions = Math.floor(num / 1000000000000)
  if (trillions > 0) {
    parts.push(convertHundredsRu(trillions) + ' ' + getRussianScaleWord(trillions, 'триллион', 'триллиона', 'триллионов'))
    num %= 1000000000000
  }

  // Billions
  const billions = Math.floor(num / 1000000000)
  if (billions > 0) {
    parts.push(convertHundredsRu(billions) + ' ' + getRussianScaleWord(billions, 'миллиард', 'миллиарда', 'миллиардов'))
    num %= 1000000000
  }

  // Millions
  const millions = Math.floor(num / 1000000)
  if (millions > 0) {
    parts.push(convertHundredsRu(millions) + ' ' + getRussianScaleWord(millions, 'миллион', 'миллиона', 'миллионов'))
    num %= 1000000
  }

  // Thousands (feminine in Russian: одна тысяча, две тысячи)
  const thousands = Math.floor(num / 1000)
  if (thousands > 0) {
    let thousandsWord = convertHundredsRu(thousands)
    // Replace masculine with feminine for 1 and 2
    thousandsWord = thousandsWord.replace(/\bодин\b/, 'одна').replace(/\bдва\b/, 'две')
    parts.push(thousandsWord + ' ' + getRussianScaleWord(thousands, 'тысяча', 'тысячи', 'тысяч'))
    num %= 1000
  }

  // Remainder
  if (num > 0) {
    parts.push(convertHundredsRu(num))
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function numberToWordsEn(num: number): string {
  if (num === 0) return 'zero'
  if (num >= 1000000000000000) return 'too much'

  const parts: string[] = []

  // Trillions
  const trillions = Math.floor(num / 1000000000000)
  if (trillions > 0) {
    parts.push(convertHundredsEn(trillions) + ' trillion')
    num %= 1000000000000
  }

  // Billions
  const billions = Math.floor(num / 1000000000)
  if (billions > 0) {
    parts.push(convertHundredsEn(billions) + ' billion')
    num %= 1000000000
  }

  // Millions
  const millions = Math.floor(num / 1000000)
  if (millions > 0) {
    parts.push(convertHundredsEn(millions) + ' million')
    num %= 1000000
  }

  // Thousands
  const thousands = Math.floor(num / 1000)
  if (thousands > 0) {
    parts.push(convertHundredsEn(thousands) + ' thousand')
    num %= 1000
  }

  // Remainder
  if (num > 0) {
    parts.push(convertHundredsEn(num))
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}


// Transliteration maps for cross-language text

// English to Cyrillic (for Russian TTS reading English words)
const LATIN_TO_CYRILLIC: Record<string, string> = {
  'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г',
  'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н',
  'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у',
  'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'й', 'z': 'з',
  // Common digraphs for better pronunciation
  'sh': 'ш', 'ch': 'ч', 'th': 'з', 'ph': 'ф', 'wh': 'в',
  'ck': 'к', 'gh': 'г', 'ng': 'нг', 'tion': 'шн', 'sion': 'жн',
  'oo': 'у', 'ee': 'и', 'ea': 'и', 'ou': 'ау', 'ow': 'оу',
  'ai': 'ей', 'ay': 'ей', 'ey': 'ей', 'ie': 'ай',
  'igh': 'ай', 'ough': 'о',
}

// Cyrillic to Latin (for English TTS reading Russian words)
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'ye', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

// Check if a word is primarily Latin characters
function isLatinWord(word: string): boolean {
  const latinChars = word.match(/[a-zA-Z]/g)
  return latinChars !== null && latinChars.length > word.length / 2
}

// Check if a word is primarily Cyrillic characters
function isCyrillicWord(word: string): boolean {
  const cyrillicChars = word.match(/[а-яёА-ЯЁ]/g)
  return cyrillicChars !== null && cyrillicChars.length > word.length / 2
}

// Transliterate Latin word to Cyrillic
function latinToCyrillic(word: string): string {
  let result = word.toLowerCase()

  // Apply digraphs first (longer patterns)
  const digraphs = Object.keys(LATIN_TO_CYRILLIC)
    .filter(k => k.length > 1)
    .sort((a, b) => b.length - a.length)

  for (const digraph of digraphs) {
    result = result.replace(new RegExp(digraph, 'g'), LATIN_TO_CYRILLIC[digraph])
  }

  // Then single characters
  result = result.replace(/[a-z]/g, char => LATIN_TO_CYRILLIC[char] || char)

  // Preserve original capitalization for first letter
  if (word[0] === word[0].toUpperCase()) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }

  return result
}

// Transliterate Cyrillic word to Latin
function cyrillicToLatin(word: string): string {
  let result = ''
  const lower = word.toLowerCase()

  for (const char of lower) {
    result += CYRILLIC_TO_LATIN[char] || char
  }

  // Preserve original capitalization for first letter
  if (word[0] === word[0].toUpperCase()) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }

  return result
}

// Transliterate foreign words based on target language
function transliterateForeignWords(text: string, language: string): string {
  const isRussian = language.startsWith('ru')

  // Split text into words while preserving delimiters
  return text.replace(/[\w\u0400-\u04FF]+/g, (word) => {
    if (isRussian) {
      // Russian model: transliterate Latin words to Cyrillic
      if (isLatinWord(word)) {
        return latinToCyrillic(word)
      }
    } else {
      // English model: transliterate Cyrillic words to Latin
      if (isCyrillicWord(word)) {
        return cyrillicToLatin(word)
      }
    }
    return word
  })
}

function convertNumbersToWords(text: string, language: string): string {
  const isRussian = language.startsWith('ru')

  // First apply basic rules (zeros, too long numbers)
  const rules = isRussian ? RUSSIAN_NUMBER_RULES : ENGLISH_NUMBER_RULES
  let result = text

  for (const rule of rules) {
    if (typeof rule.replacement === 'string') {
      result = result.replace(rule.pattern, rule.replacement)
    } else {
      result = result.replace(rule.pattern, rule.replacement)
    }
  }

  // Then convert remaining numbers to words
  const numberToWords = isRussian ? numberToWordsRu : numberToWordsEn

  result = result.replace(/\b\d+\b/g, (match) => {
    const num = parseInt(match, 10)
    if (isNaN(num)) return match
    return numberToWords(num)
  })

  // Transliterate foreign words for better pronunciation
  result = transliterateForeignWords(result, language)

  return result
}

function cleanTextForTTS(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .trim()
}

// Split text into chunks
function splitIntoChunks(text: string, maxLength: number = 1000, language: string = 'en'): string[] {
  let cleanedText = cleanTextForTTS(text)

  // Convert numbers to words for better TTS pronunciation (Silero, Coqui)
  cleanedText = convertNumbersToWords(cleanedText, language)

  const chunks: string[] = []
  const paragraphs = cleanedText.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    const trimmedPara = para.trim()
    if (!trimmedPara) continue

    if ((currentChunk + '\n\n' + trimmedPara).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }

      if (trimmedPara.length > maxLength) {
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+\s*/g) || [trimmedPara]
        let sentenceChunk = ''

        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length > maxLength) {
            if (sentenceChunk) {
              chunks.push(sentenceChunk.trim())
            }
            sentenceChunk = sentence
          } else {
            sentenceChunk += sentence
          }
        }

        if (sentenceChunk.trim()) {
          currentChunk = sentenceChunk
        } else {
          currentChunk = ''
        }
      } else {
        currentChunk = trimmedPara
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(c => c.length > 0)
}

// ============= RHVoice (SAPI) Implementation =============
async function generateSpeechWithRHVoice(
  text: string,
  voice: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  const tempDir = path.dirname(outputPath)
  const timestamp = Date.now()
  const tempTextPath = path.join(tempDir, `temp_text_${timestamp}.txt`)
  const tempScriptPath = path.join(tempDir, `temp_script_${timestamp}.ps1`)

  fs.writeFileSync(tempTextPath, text, { encoding: 'utf8' })

  // Convert rate from percentage format to SAPI rate (-10 to 10)
  // +100% -> 10, +50% -> 5, 0% -> 0, -50% -> -5
  let sapiRate = 0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      // Map percentage to -10..10 range (100% = 10)
      sapiRate = sign === '+' ? Math.round(percent / 10) : -Math.round(percent / 10)
      // Clamp to valid range
      sapiRate = Math.max(-10, Math.min(10, sapiRate))
    }
  }

  const psScript = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("${voice}")
$synth.Rate = ${sapiRate}
$synth.SetOutputToWaveFile("${outputPath.replace(/\\/g, '\\\\')}")
$text = [System.IO.File]::ReadAllText("${tempTextPath.replace(/\\/g, '\\\\')}", [System.Text.Encoding]::UTF8)
$synth.Speak($text)
$synth.Dispose()
`

  fs.writeFileSync(tempScriptPath, psScript, 'utf-8')

  try {
    await execAsync(`powershell.exe -ExecutionPolicy Bypass -File "${tempScriptPath}"`)
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath)
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath)
  }
}

// ============= Piper Implementation =============
async function generateSpeechWithPiper(
  text: string,
  modelPath: string,
  outputPath: string,
  options: { rate?: string; sentencePause?: number } = {}
): Promise<void> {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)

  if (!fs.existsSync(fullModelPath)) {
    throw new Error(`Piper voice model not found: ${fullModelPath}`)
  }

  const piperExe = getPiperExecutable()
  const piperDir = path.dirname(piperExe)

  let lengthScale = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        lengthScale = 1.0 / (1.0 + percent / 100)
      } else {
        lengthScale = 1.0 / (1.0 - percent / 100)
      }
    }
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      '--model', fullModelPath,
      '--output_file', outputPath,
      '--length_scale', lengthScale.toFixed(2)
    ]

    // Add sentence silence if specified
    if (options.sentencePause !== undefined && options.sentencePause > 0) {
      args.push('--sentence_silence', options.sentencePause.toFixed(2))
    }

    // Run piper from its own directory so it can find DLLs
    const piperProcess = spawn(piperExe, args, { cwd: piperDir })
    let stderr = ''

    piperProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    piperProcess.on('error', (error) => {
      reject(new Error(`Failed to start Piper: ${error.message}`))
    })

    piperProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Piper failed to generate audio file'))
        return
      }

      resolve()
    })

    if (piperProcess.stdin) {
      piperProcess.stdin.write(text, 'utf8')
      piperProcess.stdin.end()
    } else {
      reject(new Error('Failed to write to Piper stdin'))
    }
  })
}

// ============= Silero Implementation =============
async function generateSpeechWithSilero(
  text: string,
  speakerPath: string,
  outputPath: string,
  options: { rate?: string; pitch?: number; timeStretch?: number; useRuaccent?: boolean } = {}
): Promise<void> {
  // Try to use TTS server first
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    // Determine language from speaker path (e.g., "v5_ru/aidar" -> "ru")
    const language = speakerPath.includes('_ru') ? 'ru' : 'en'
    await generateViaServer('silero', text, speakerPath, language, outputPath, options.rate, options.pitch, options.timeStretch, undefined, options.useRuaccent)
    return
  }

  // Fallback to spawning process
  const pythonExe = getSileroPythonExecutable()
  const sileroScript = getSileroScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Silero Python environment not found. Please run setup script.')
  }

  if (!fs.existsSync(sileroScript)) {
    throw new Error('Silero generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      sileroScript,
      '--text', text,
      '--speaker', speakerPath,
      '--output', outputPath
    ]

    // Add rate parameter if specified
    if (options.rate) {
      args.push('--rate', options.rate)
    }

    // Add pitch parameter if specified
    if (options.pitch !== undefined && options.pitch !== 1.0) {
      args.push('--pitch', options.pitch.toString())
    }

    // Add time stretch parameter if specified
    if (options.timeStretch !== undefined && options.timeStretch !== 1.0) {
      args.push('--time-stretch', options.timeStretch.toString())
    }

    const sileroProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    sileroProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    sileroProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    sileroProcess.on('error', (error) => {
      reject(new Error(`Failed to start Silero: ${error.message}`))
    })

    sileroProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Silero exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Silero failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}

// ============= Coqui XTTS-v2 Implementation =============
async function generateSpeechWithCoqui(
  text: string,
  speakerName: string,
  language: string,
  outputPath: string,
  speakerWav?: string,
  useRuaccent?: boolean
): Promise<void> {
  // Try to use TTS server first
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    await generateViaServer('coqui', text, speakerName, language, outputPath, undefined, undefined, undefined, speakerWav, useRuaccent)
    return
  }

  // Fallback to spawning process
  const pythonExe = getCoquiPythonExecutable()
  const coquiScript = getCoquiScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Coqui Python environment not found. Please run setup.')
  }

  if (!fs.existsSync(coquiScript)) {
    throw new Error('Coqui generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      coquiScript,
      '--text', text,
      '--language', language,
      '--output', outputPath
    ]

    // Voice cloning mode: use speaker_wav instead of speaker name
    if (speakerWav) {
      args.push('--speaker_wav', speakerWav)
    } else {
      args.push('--speaker', speakerName)
    }

    const coquiProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    coquiProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    coquiProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    coquiProcess.on('error', (error) => {
      reject(new Error(`Failed to start Coqui: ${error.message}`))
    })

    coquiProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Coqui exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Coqui failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}

// ============= Abortable Preview Versions =============

// RHVoice abortable version for preview
async function generateSpeechWithRHVoiceForPreview(
  text: string,
  voice: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  // RHVoice uses PowerShell which is fast, just use the regular version
  // but wrap it to check for abort
  if (previewAborted) throw new Error('Preview cancelled')
  await generateSpeechWithRHVoice(text, voice, outputPath, options)
}

// Piper abortable version for preview
async function generateSpeechWithPiperForPreview(
  text: string,
  modelPath: string,
  outputPath: string,
  options: { rate?: string; sentencePause?: number } = {}
): Promise<void> {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)

  if (!fs.existsSync(fullModelPath)) {
    throw new Error(`Piper voice model not found: ${fullModelPath}`)
  }

  const piperExe = getPiperExecutable()
  const piperDir = path.dirname(piperExe)

  let lengthScale = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        lengthScale = 1.0 / (1.0 + percent / 100)
      } else {
        lengthScale = 1.0 / (1.0 - percent / 100)
      }
    }
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      '--model', fullModelPath,
      '--output_file', outputPath,
      '--length_scale', lengthScale.toFixed(2)
    ]

    if (options.sentencePause !== undefined && options.sentencePause > 0) {
      args.push('--sentence_silence', options.sentencePause.toFixed(2))
    }

    const piperProcess = spawn(piperExe, args, { cwd: piperDir })
    currentPreviewProcess = piperProcess
    let stderr = ''

    piperProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    piperProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Piper: ${error.message}`))
    })

    piperProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Piper failed to generate audio file'))
        return
      }
      resolve()
    })

    if (piperProcess.stdin) {
      piperProcess.stdin.write(text, 'utf8')
      piperProcess.stdin.end()
    } else {
      reject(new Error('Failed to write to Piper stdin'))
    }
  })
}

// Silero abortable version for preview
async function generateSpeechWithSileroForPreview(
  text: string,
  speakerPath: string,
  outputPath: string,
  options: { rate?: string; pitch?: number; timeStretch?: number; useRuaccent?: boolean } = {}
): Promise<void> {
  // Try to use TTS server first (abortable via HTTP)
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    const language = speakerPath.includes('_ru') ? 'ru' : 'en'
    await generateViaServerForPreview('silero', text, speakerPath, language, outputPath, options.rate, options.pitch, options.timeStretch, undefined, options.useRuaccent)
    return
  }

  // Fallback to spawning process
  const pythonExe = getSileroPythonExecutable()
  const sileroScript = getSileroScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Silero Python environment not found. Please run setup script.')
  }

  if (!fs.existsSync(sileroScript)) {
    throw new Error('Silero generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      sileroScript,
      '--text', text,
      '--speaker', speakerPath,
      '--output', outputPath
    ]

    if (options.rate) {
      args.push('--rate', options.rate)
    }

    if (options.pitch !== undefined && options.pitch !== 1.0) {
      args.push('--pitch', options.pitch.toString())
    }

    if (options.timeStretch !== undefined && options.timeStretch !== 1.0) {
      args.push('--time-stretch', options.timeStretch.toString())
    }

    const sileroProcess = spawn(pythonExe, args)
    currentPreviewProcess = sileroProcess
    let stderr = ''

    sileroProcess.stdout?.on('data', () => {})
    sileroProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    sileroProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Silero: ${error.message}`))
    })

    sileroProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Silero exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Silero failed to generate audio file'))
        return
      }
      resolve()
    })
  })
}

// Coqui abortable version for preview
async function generateSpeechWithCoquiForPreview(
  text: string,
  speakerName: string,
  language: string,
  outputPath: string,
  speakerWav?: string,
  useRuaccent?: boolean
): Promise<void> {
  // Try to use TTS server first (abortable via HTTP)
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    await generateViaServerForPreview('coqui', text, speakerName, language, outputPath, undefined, undefined, undefined, speakerWav, useRuaccent)
    return
  }

  // Fallback to spawning process
  const pythonExe = getCoquiPythonExecutable()
  const coquiScript = getCoquiScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Coqui Python environment not found. Please run setup.')
  }

  if (!fs.existsSync(coquiScript)) {
    throw new Error('Coqui generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      coquiScript,
      '--text', text,
      '--language', language,
      '--output', outputPath
    ]

    // Voice cloning mode: use speaker_wav instead of speaker name
    if (speakerWav) {
      args.push('--speaker_wav', speakerWav)
    } else {
      args.push('--speaker', speakerName)
    }

    const coquiProcess = spawn(pythonExe, args)
    currentPreviewProcess = coquiProcess
    let stderr = ''

    coquiProcess.stdout?.on('data', () => {})
    coquiProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    coquiProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Coqui: ${error.message}`))
    })

    coquiProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Coqui exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Coqui failed to generate audio file'))
        return
      }
      resolve()
    })
  })
}

// ============= ElevenLabs Implementation =============
async function generateSpeechWithElevenLabs(
  text: string,
  voiceId: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  const apiKey = getElevenLabsApiKey()

  if (!apiKey) {
    throw new Error('ElevenLabs API key not set. Please configure your API key in settings.')
  }

  // Convert rate from percentage format to ElevenLabs speed (0.7 to 1.2)
  // +100% -> 1.2, +20% -> 1.2, 0% -> 1.0, -30% -> 0.7
  let speed = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        // Map 0-100% to 1.0-1.2
        speed = 1.0 + (percent / 100) * 0.2
      } else {
        // Map 0-50% to 1.0-0.7
        speed = 1.0 - (percent / 100) * 0.6
      }
      // Clamp to valid range
      speed = Math.max(0.7, Math.min(1.2, speed))
    }
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: speed
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // ElevenLabs returns MP3, but we need WAV for consistency with other providers
  // Save as temp MP3 first, then convert to WAV
  const tempMp3Path = outputPath.replace('.wav', '_temp.mp3')
  fs.writeFileSync(tempMp3Path, buffer)

  // Convert MP3 to WAV using ffmpeg
  const ffmpegExe = getFfmpegExecutable()
  await execAsync(`"${ffmpegExe}" -i "${tempMp3Path}" -acodec pcm_s16le -ar 22050 -ac 1 -y "${outputPath}"`)

  // Clean up temp MP3
  if (fs.existsSync(tempMp3Path)) {
    fs.unlinkSync(tempMp3Path)
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ElevenLabs failed to generate audio file')
  }
}

// ============= Unified Processing =============

// Generate audio for a single text chunk (no retries, no splitting)
async function generateChunkAudio(
  chunk: string,
  outputFile: string,
  voiceInfo: VoiceInfo,
  options: { rate?: string; sentencePause?: number; pitch?: number; timeStretch?: number; speakerWav?: string; useRuaccent?: boolean }
): Promise<void> {
  switch (voiceInfo.provider) {
    case 'rhvoice':
      await generateSpeechWithRHVoice(chunk, voiceInfo.shortName, outputFile, options)
      break

    case 'piper':
      if (!voiceInfo.modelPath) {
        throw new Error('Model path required for Piper')
      }
      await generateSpeechWithPiper(chunk, voiceInfo.modelPath, outputFile, options)
      break

    case 'silero':
      if (!voiceInfo.modelPath) {
        throw new Error('Speaker path required for Silero')
      }
      await generateSpeechWithSilero(chunk, voiceInfo.modelPath, outputFile, { rate: options.rate, pitch: options.pitch, timeStretch: options.timeStretch, useRuaccent: options.useRuaccent })
      break

    case 'elevenlabs':
      if (!voiceInfo.voiceId) {
        throw new Error('Voice ID required for ElevenLabs')
      }
      await generateSpeechWithElevenLabs(chunk, voiceInfo.voiceId, outputFile, options)
      break

    case 'coqui':
      // Voice cloning mode: speakerWav takes precedence over modelPath
      if (!options.speakerWav && !voiceInfo.modelPath) {
        throw new Error('Speaker name or custom voice required for Coqui')
      }
      await generateSpeechWithCoqui(chunk, voiceInfo.modelPath || '', voiceInfo.locale, outputFile, options.speakerWav, options.useRuaccent)
      break

    default:
      throw new Error(`Unknown provider: ${voiceInfo.provider}`)
  }

  if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
    throw new Error('Audio file was not created or is empty')
  }
}

// Split text in half at a sentence boundary if possible
function splitTextInHalf(text: string): [string, string] {
  const mid = Math.floor(text.length / 2)

  // Look for sentence boundary near the middle (within 20% range)
  const searchStart = Math.floor(mid * 0.8)
  const searchEnd = Math.floor(mid * 1.2)
  const searchRange = text.slice(searchStart, searchEnd)

  // Find sentence-ending punctuation followed by space
  const sentenceBreaks = /[.!?।。！？]+\s+/g
  let bestBreak = -1
  let match

  while ((match = sentenceBreaks.exec(searchRange)) !== null) {
    const absolutePos = searchStart + match.index + match[0].length
    if (bestBreak === -1 || Math.abs(absolutePos - mid) < Math.abs(bestBreak - mid)) {
      bestBreak = absolutePos
    }
  }

  // If no sentence boundary found, split at word boundary near middle
  if (bestBreak === -1) {
    const spaceAfterMid = text.indexOf(' ', mid)
    const spaceBeforeMid = text.lastIndexOf(' ', mid)

    if (spaceAfterMid !== -1 && (spaceBeforeMid === -1 || (spaceAfterMid - mid) < (mid - spaceBeforeMid))) {
      bestBreak = spaceAfterMid + 1
    } else if (spaceBeforeMid !== -1) {
      bestBreak = spaceBeforeMid + 1
    } else {
      // No space found, just split in the middle
      bestBreak = mid
    }
  }

  return [text.slice(0, bestBreak).trim(), text.slice(bestBreak).trim()]
}

// Process chunk with automatic splitting on failure
// Returns array of audio files (1 if success, more if had to split)
async function processChunkWithSplit(
  chunk: string,
  baseIndex: string,
  voiceInfo: VoiceInfo,
  tempDir: string,
  maxRetries: number,
  retryDelay: number,
  options: { rate?: string; sentencePause?: number; pitch?: number; timeStretch?: number; speakerWav?: string; useRuaccent?: boolean },
  maxSplitDepth: number = 3
): Promise<{ success: boolean; files: string[]; error?: string }> {
  const tempFile = path.join(tempDir, `chunk_${baseIndex}.wav`)

  // Try to process the chunk with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await generateChunkAudio(chunk, tempFile, voiceInfo, options)
      return { success: true, files: [tempFile] }
    } catch (error) {
      console.error(`Error processing chunk ${baseIndex} (attempt ${attempt}/${maxRetries}):`, error)

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }

  // All retries failed - try splitting if we haven't reached max depth
  // and chunk is long enough to split (at least 50 chars)
  if (maxSplitDepth > 0 && chunk.length >= 50) {
    console.log(`Chunk ${baseIndex} failed after ${maxRetries} retries, splitting in half...`)

    const [firstHalf, secondHalf] = splitTextInHalf(chunk)

    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return { success: false, files: [], error: 'Failed to split chunk - one half is empty' }
    }

    // Process both halves recursively
    const firstResult = await processChunkWithSplit(
      firstHalf,
      `${baseIndex}_a`,
      voiceInfo,
      tempDir,
      maxRetries,
      retryDelay,
      options,
      maxSplitDepth - 1
    )

    if (!firstResult.success) {
      return { success: false, files: [], error: `First half failed: ${firstResult.error}` }
    }

    const secondResult = await processChunkWithSplit(
      secondHalf,
      `${baseIndex}_b`,
      voiceInfo,
      tempDir,
      maxRetries,
      retryDelay,
      options,
      maxSplitDepth - 1
    )

    if (!secondResult.success) {
      return { success: false, files: [], error: `Second half failed: ${secondResult.error}` }
    }

    // Combine the files from both halves
    return { success: true, files: [...firstResult.files, ...secondResult.files] }
  }

  return {
    success: false,
    files: [],
    error: `Failed after ${maxRetries} retries (chunk too small to split or max depth reached)`
  }
}

// Legacy wrapper for backward compatibility
async function processChunk(
  chunk: string,
  index: number,
  voiceInfo: VoiceInfo,
  tempDir: string,
  maxRetries: number,
  retryDelay: number,
  options: { rate?: string; sentencePause?: number; pitch?: number; timeStretch?: number; speakerWav?: string; useRuaccent?: boolean }
): Promise<{ success: boolean; file?: string; files?: string[]; error?: string }> {
  const result = await processChunkWithSplit(
    chunk,
    String(index).padStart(4, '0'),
    voiceInfo,
    tempDir,
    maxRetries,
    retryDelay,
    options,
    3 // max split depth: can split up to 3 times (8 sub-chunks max)
  )

  if (result.success && result.files.length > 0) {
    return {
      success: true,
      file: result.files[0], // First file for backward compat
      files: result.files    // All files if split occurred
    }
  }

  return { success: false, error: result.error }
}

// Combine multiple WAV files
async function combineWavFiles(inputFiles: string[], outputPath: string): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const firstFile = inputFiles[0]
  const headerBuffer = Buffer.alloc(44)
  const fd = fs.openSync(firstFile, 'r')
  fs.readSync(fd, headerBuffer, 0, 44, 0)
  fs.closeSync(fd)

  let totalDataSize = 0
  for (const file of inputFiles) {
    const stats = fs.statSync(file)
    totalDataSize += stats.size - 44
  }

  const newFileSize = 36 + totalDataSize
  headerBuffer.writeUInt32LE(newFileSize, 4)
  headerBuffer.writeUInt32LE(totalDataSize, 40)

  const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 64 * 1024 })
  writeStream.write(headerBuffer)

  for (const file of inputFiles) {
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(file, {
        start: 44,
        highWaterMark: 64 * 1024
      })

      readStream.on('data', (chunk) => {
        if (!writeStream.write(chunk)) {
          readStream.pause()
          writeStream.once('drain', () => readStream.resume())
        }
      })

      readStream.on('end', resolve)
      readStream.on('error', reject)
    })
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve())
    writeStream.on('error', reject)
  })
}

// Convert WAV to MP3 using FFmpeg
async function convertWavToMp3(wavPath: string, mp3Path: string): Promise<void> {
  const ffmpegExe = getFfmpegExecutable()

  if (!fs.existsSync(ffmpegExe)) {
    throw new Error(
      'FFmpeg not found. Please run setup script to download FFmpeg.'
    )
  }

  const ffmpegCommand = `"${ffmpegExe}" -i "${wavPath}" -b:a 128k -ar 22050 -ac 1 -y "${mp3Path}"`

  try {
    await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 100 })
  } catch (error) {
    throw new Error(`Failed to convert WAV to MP3: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
    throw new Error('MP3 file was not created or is empty')
  }
}

// Combine a group of WAV files and convert to MP3
async function combineToPart(
  inputFiles: string[],
  outputMp3Path: string,
  tempDir: string
): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const tempWavPath = path.join(tempDir, `part_${Date.now()}.wav`)

  try {
    if (inputFiles.length === 1) {
      fs.copyFileSync(inputFiles[0], tempWavPath)
    } else {
      await combineWavFiles(inputFiles, tempWavPath)
    }

    await convertWavToMp3(tempWavPath, outputMp3Path)

    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
  } catch (error) {
    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
    throw error
  }
}

// ============= Main Conversion Function =============

export async function convertToSpeech(
  text: string,
  voiceShortName: string,
  outputPath: string,
  options: { rate?: string; volume?: string; sentencePause?: number; pitch?: number; timeStretch?: number; customVoiceId?: string; useRuaccent?: boolean } = {},
  onProgress?: (progress: number, status: string) => void,
  isAborted?: () => boolean
): Promise<void> {
  // Find voice by short name across all providers
  let voiceInfo: VoiceInfo | undefined
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  // For custom voice cloning, we don't need a predefined voice
  // Create a virtual voiceInfo for Coqui with custom voice
  if (!voiceInfo && options.customVoiceId) {
    voiceInfo = {
      name: 'Custom Voice',
      shortName: 'custom-voice',
      gender: 'Male' as const,
      locale: 'en', // Will be overridden by actual language selection
      provider: 'coqui' as const
    }
  }

  if (!voiceInfo) {
    throw new Error(`Voice not found: ${voiceShortName}`)
  }

  // Get custom voice audio path if using voice cloning
  let speakerWav: string | undefined
  if (options.customVoiceId && voiceInfo.provider === 'coqui') {
    speakerWav = getCustomVoiceAudioPath(options.customVoiceId)
    if (!fs.existsSync(speakerWav)) {
      throw new Error('Custom voice audio file not found')
    }
  }

  // Silero and Coqui have token limits in the positional encoder.
  // Cyrillic/non-Latin text expands to more tokens, so use smaller chunks.
  // Coqui XTTS is especially sensitive, use even smaller chunks (250 chars)
  const maxChunkLength = voiceInfo.provider === 'coqui' ? 250 :
                         voiceInfo.provider === 'silero' ? 500 : 1000
  // Pass language to convert numbers to words for Silero/Coqui
  const language = voiceInfo.locale || 'en'
  const chunks = splitIntoChunks(text, maxChunkLength, language)

  if (chunks.length === 0) {
    throw new Error('No text content to convert')
  }

  const totalChunks = chunks.length
  // Coqui has smaller chunks, so use larger parts (200 instead of 100)
  const chunksPerPart = voiceInfo.provider === 'coqui' ? 200 : 100
  const totalParts = Math.ceil(totalChunks / chunksPerPart)

  // Each chunk can produce multiple files if it was split due to errors
  const audioFilesPerChunk: string[][] = new Array(totalChunks)
  let successfulChunks = 0
  let totalAudioFiles = 0 // Track actual number of audio files (including splits)
  const errors: Array<{ chunk: number; error: string }> = []
  const maxRetries = 3
  const retryDelay = 1000

  // Concurrency limits depend on provider
  // Coqui XTTS is slow and memory-intensive, process sequentially
  const concurrentLimit = voiceInfo.provider === 'coqui' ? 1 :
                         voiceInfo.provider === 'silero' ? 5 :
                         voiceInfo.provider === 'piper' ? 10 :
                         voiceInfo.provider === 'elevenlabs' ? 3 : 30

  onProgress?.(0, `Preparing ${totalChunks} text segments in ${totalParts} parts... (${voiceInfo.provider})`)

  const outputDir = path.dirname(outputPath)
  lastOutputDir = outputDir // Remember for cleanup
  const tempDir = path.join(outputDir, TEMP_AUDIO_DIR_NAME)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  let nextChunkIndex = 0
  let completedChunks = 0
  const chunkCompletionTimes: number[] = []

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    const pad = (num: number) => String(num).padStart(2, '0')

    if (hours > 0) {
      return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    } else if (minutes > 0) {
      return `${pad(minutes)}m ${pad(seconds)}s`
    } else {
      return `${pad(seconds)}s`
    }
  }

  const processNextChunk = async () => {
    const currentIndex = nextChunkIndex++
    if (currentIndex >= chunks.length) return

    const chunkStartTime = Date.now()

    try {
      const result = await processChunk(
        chunks[currentIndex],
        currentIndex,
        voiceInfo!,
        tempDir,
        maxRetries,
        retryDelay,
        { ...options, speakerWav }
      )

      if (result.success && result.files && result.files.length > 0) {
        audioFilesPerChunk[currentIndex] = result.files
        totalAudioFiles += result.files.length
        successfulChunks++

        // Log if chunk was split
        if (result.files.length > 1) {
          console.log(`Chunk ${currentIndex + 1} was split into ${result.files.length} parts`)
        }
      } else {
        errors.push({
          chunk: currentIndex + 1,
          error: result.error || 'Unknown error'
        })
      }

      completedChunks++
      const chunkDuration = Date.now() - chunkStartTime
      chunkCompletionTimes.push(chunkDuration)

      let statusMessage = ''
      if (completedChunks >= 3) {
        const recentTimes = chunkCompletionTimes.slice(-10)
        const avgTimePerChunk = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length
        const remainingChunks = totalChunks - completedChunks
        const estimatedRemainingMs = (remainingChunks * avgTimePerChunk) / concurrentLimit
        const splitInfo = totalAudioFiles > completedChunks ? ` (${totalAudioFiles} audio)` : ''
        statusMessage = `~${formatTime(estimatedRemainingMs)} remaining | Segment ${completedChunks} of ${totalChunks}${splitInfo}`
      } else {
        statusMessage = `Calculating time... | Segment ${completedChunks} of ${totalChunks}`
      }

      onProgress?.(
        Math.round((completedChunks / totalChunks) * 90),
        statusMessage
      )
    } catch (error) {
      errors.push({
        chunk: currentIndex + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      completedChunks++
    }
  }

  // Process chunks with proper parallelization
  for (let i = 0; i < chunks.length; i += concurrentLimit) {
    // Check if conversion was aborted
    if (isAborted?.()) {
      return
    }

    const batch = []
    for (let j = 0; j < concurrentLimit && i + j < chunks.length; j++) {
      batch.push(processNextChunk())
    }
    await Promise.all(batch)
  }

  // Flatten audio files - each chunk may have produced multiple files if it was split
  // Keep them in order: chunk 0 files, chunk 1 files, etc.
  const validAudioFiles: string[] = []
  for (let i = 0; i < audioFilesPerChunk.length; i++) {
    if (audioFilesPerChunk[i] && audioFilesPerChunk[i].length > 0) {
      validAudioFiles.push(...audioFilesPerChunk[i])
    }
  }

  if (validAudioFiles.length === 0) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error)
    }

    const errorDetails = errors.length > 0
      ? `\n\nDetails:\n${errors.map(e => `- Segment ${e.chunk}: ${e.error}`).join('\n')}`
      : ''
    throw new Error(
      `Failed to generate any audio after ${maxRetries} attempts per segment.${errorDetails}`
    )
  }

  if (successfulChunks < totalChunks) {
    const failedCount = totalChunks - successfulChunks
    console.warn(
      `Warning: ${failedCount} of ${totalChunks} segments failed to convert. ` +
      `Proceeding with ${successfulChunks} successful segments.`
    )
  }

  // Log if any chunks were split
  if (validAudioFiles.length > successfulChunks) {
    console.log(`Total audio files: ${validAudioFiles.length} (from ${successfulChunks} successful chunks, some were split)`)
  }

  // Combine files into parts
  const outputBaseName = path.basename(outputPath, path.extname(outputPath))

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Recalculate parts based on actual audio files count
  const actualTotalParts = Math.ceil(validAudioFiles.length / chunksPerPart)

  for (let partIndex = 0; partIndex < actualTotalParts; partIndex++) {
    const startIdx = partIndex * chunksPerPart
    const endIdx = Math.min(startIdx + chunksPerPart, validAudioFiles.length)
    const partFiles = validAudioFiles.slice(startIdx, endIdx)

    if (partFiles.length === 0) continue

    const currentPart = partIndex + 1
    const partProgress = 90 + Math.round((currentPart / actualTotalParts) * 10)
    onProgress?.(
      partProgress,
      `Creating part ${currentPart} of ${actualTotalParts} (files ${startIdx + 1}-${endIdx})...`
    )

    const partOutputPath = actualTotalParts > 1
      ? path.join(outputDir, `${outputBaseName}_part${currentPart}.mp3`)
      : outputPath

    await combineToPart(partFiles, partOutputPath, tempDir)
  }

  // Clean up temp directory
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  } catch (error) {
    console.warn('Failed to clean up temp directory:', error)
  }

  onProgress?.(100, `Conversion complete! Created ${actualTotalParts} part(s).`)
}


/**
 * Preview a voice by generating a short audio sample and returning its path
 * Supports abortion via abortPreview()
 */
export async function previewVoice(
  text: string,
  voiceShortName: string,
  options: { rate?: string; sentencePause?: number; pitch?: number; timeStretch?: number; customVoiceId?: string; useRuaccent?: boolean } = {}
): Promise<{ success: boolean; audioData?: string; error?: string }> {
  // Reset abort state
  previewAborted = false
  currentPreviewProcess = null
  currentPreviewRequest = null

  // Find voice by short name across all providers
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  let voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  // For custom voice cloning, create a virtual voiceInfo for Coqui
  if (!voiceInfo && options.customVoiceId) {
    voiceInfo = {
      name: 'Custom Voice',
      shortName: 'custom-voice',
      gender: 'Male' as const,
      locale: 'en',
      provider: 'coqui' as const
    }
  }

  if (!voiceInfo) {
    return { success: false, error: `Voice not found: ${voiceShortName}` }
  }

  // Get custom voice audio path if using voice cloning
  let speakerWav: string | undefined
  if (options.customVoiceId && voiceInfo.provider === 'coqui') {
    speakerWav = getCustomVoiceAudioPath(options.customVoiceId)
    if (!fs.existsSync(speakerWav)) {
      return { success: false, error: 'Custom voice audio file not found' }
    }
  }

  // Use a temp directory for preview files
  const tempDir = path.join(app.getPath('temp'), 'book-to-mp3-preview')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const timestamp = Date.now()
  const tempWavFile = path.join(tempDir, `preview_${timestamp}.wav`)
  const tempMp3File = path.join(tempDir, `preview_${timestamp}.mp3`)

  console.log('Preview paths:', { tempDir, tempWavFile, tempMp3File, voice: voiceShortName })

  // Convert numbers to words for Silero and Coqui providers
  let processedText = text
  if (voiceInfo.provider === 'silero' || voiceInfo.provider === 'coqui') {
    processedText = cleanTextForTTS(text)
    processedText = convertNumbersToWords(processedText, voiceInfo.locale || 'en')
  }

  try {
    // Generate audio based on provider (using abortable versions)
    switch (voiceInfo.provider) {
      case 'rhvoice':
        await generateSpeechWithRHVoiceForPreview(text, voiceInfo.shortName, tempWavFile, options)
        break

      case 'piper':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Model path required for Piper' }
        }
        await generateSpeechWithPiperForPreview(text, voiceInfo.modelPath, tempWavFile, options)
        break

      case 'silero':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Speaker path required for Silero' }
        }
        await generateSpeechWithSileroForPreview(processedText, voiceInfo.modelPath, tempWavFile, { rate: options.rate, pitch: options.pitch, timeStretch: options.timeStretch, useRuaccent: options.useRuaccent })
        break

      case 'elevenlabs':
        if (!voiceInfo.voiceId) {
          return { success: false, error: 'Voice ID required for ElevenLabs' }
        }
        await generateSpeechWithElevenLabs(text, voiceInfo.voiceId, tempWavFile, options)
        break

      case 'coqui':
        // Voice cloning mode: speakerWav takes precedence
        if (!speakerWav && !voiceInfo.modelPath) {
          return { success: false, error: 'Speaker name or custom voice required for Coqui' }
        }
        await generateSpeechWithCoquiForPreview(processedText, voiceInfo.modelPath || '', voiceInfo.locale, tempWavFile, speakerWav, options.useRuaccent)
        break

      default:
        return { success: false, error: `Unknown provider: ${voiceInfo.provider}` }
    }

    // Check if aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }

    console.log('WAV exists:', fs.existsSync(tempWavFile), 'Size:', fs.existsSync(tempWavFile) ? fs.statSync(tempWavFile).size : 0)

    if (!fs.existsSync(tempWavFile) || fs.statSync(tempWavFile).size === 0) {
      return { success: false, error: 'Audio file was not created or is empty' }
    }

    // Convert WAV to MP3 for browser playback
    await convertWavToMp3(tempWavFile, tempMp3File)

    // Check if aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }

    console.log('MP3 exists:', fs.existsSync(tempMp3File), 'Size:', fs.existsSync(tempMp3File) ? fs.statSync(tempMp3File).size : 0)

    // Clean up WAV file
    try {
      fs.unlinkSync(tempWavFile)
    } catch {
      // Ignore cleanup errors
    }

    if (!fs.existsSync(tempMp3File) || fs.statSync(tempMp3File).size === 0) {
      return { success: false, error: 'Failed to convert audio to MP3' }
    }

    // Read MP3 file as base64
    const audioBuffer = fs.readFileSync(tempMp3File)
    const audioBase64 = audioBuffer.toString('base64')
    const audioData = `data:audio/mpeg;base64,${audioBase64}`

    console.log('Audio data length:', audioData.length)

    // Clean up MP3 file
    try {
      fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }

    return { success: true, audioData }
  } catch (error) {
    console.error('Preview error:', error)
    // Clean up temp files on error
    try {
      if (fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile)
      if (fs.existsSync(tempMp3File)) fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }

    // Don't show error if it was aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }
    return { success: false, error: (error as Error).message }
  }
}
