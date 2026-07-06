import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { spawn } from 'child_process'
import { getFfmpegPath } from '../setup/paths'

// ============================================================================
// Types
// ============================================================================

export interface CustomVoiceMetadata {
  id: string
  name: string
  fileName: string
  originalFileName: string
  duration: number
  createdAt: string
  updatedAt: string
}

export interface ValidationResult {
  valid: boolean
  duration?: number
  error?: string
}

export interface AddVoiceResult {
  success: boolean
  voice?: CustomVoiceMetadata
  error?: string
}

export interface UpdateVoiceResult {
  success: boolean
  error?: string
}

export interface DeleteVoiceResult {
  success: boolean
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const SUPPORTED_FORMATS = ['mp3', 'wav', 'wma', 'ogg', 'flac', 'amr', 'm4a', 'aiff', 'aac']
const MAX_FILE_SIZE_MB = 10
const MIN_DURATION_SEC = 10
const MAX_DURATION_SEC = 60

// ============================================================================
// Path Functions
// ============================================================================

export function getCustomVoicesDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'custom-voices')
  } else {
    return path.join(process.cwd(), 'custom-voices')
  }
}

function getVoicesJsonPath(): string {
  return path.join(getCustomVoicesDir(), 'voices.json')
}

export function getCustomVoiceAudioPath(id: string): string {
  return path.join(getCustomVoicesDir(), `${id}.wav`)
}

// ============================================================================
// Storage Functions
// ============================================================================

function ensureCustomVoicesDir(): void {
  const dir = getCustomVoicesDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function loadCustomVoices(): Promise<CustomVoiceMetadata[]> {
  try {
    const jsonPath = getVoicesJsonPath()
    if (!fs.existsSync(jsonPath)) {
      return []
    }
    const data = fs.readFileSync(jsonPath, 'utf-8')
    return JSON.parse(data) as CustomVoiceMetadata[]
  } catch (error) {
    console.error('Failed to load custom voices:', error)
    return []
  }
}

async function saveCustomVoices(voices: CustomVoiceMetadata[]): Promise<void> {
  ensureCustomVoicesDir()
  const jsonPath = getVoicesJsonPath()
  const tempPath = jsonPath + '.tmp'

  // Atomic write: write to temp file, then rename
  fs.writeFileSync(tempPath, JSON.stringify(voices, null, 2), 'utf-8')
  fs.renameSync(tempPath, jsonPath)
}

// ============================================================================
// Validation Functions
// ============================================================================

function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase().slice(1)
}

function isFormatSupported(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return SUPPORTED_FORMATS.includes(ext)
}

function getFileSizeMB(filePath: string): number {
  const stats = fs.statSync(filePath)
  return stats.size / (1024 * 1024)
}

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpegDir = getFfmpegPath()
    const ffmpegPath = path.join(ffmpegDir, 'ffmpeg.exe')

    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error('ffmpeg not found'))
      return
    }

    // Use ffmpeg to get duration (outputs to stderr)
    const args = [
      '-i', filePath,
      '-f', 'null',
      '-'
    ]

    const proc = spawn(ffmpegPath, args)
    let stderr = ''

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', () => {
      // Parse duration from ffmpeg output: "Duration: HH:MM:SS.ms"
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10)
        const minutes = parseInt(durationMatch[2], 10)
        const seconds = parseFloat(durationMatch[3])
        const totalSeconds = hours * 3600 + minutes * 60 + seconds
        resolve(totalSeconds)
      } else {
        reject(new Error('Could not parse duration from ffmpeg output'))
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

export async function validateAudioFile(filePath: string): Promise<ValidationResult> {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'File not found' }
  }

  // Check format
  if (!isFormatSupported(filePath)) {
    return { valid: false, error: 'invalidFormat' }
  }

  // Check file size
  const sizeMB = getFileSizeMB(filePath)
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return { valid: false, error: 'fileTooLarge' }
  }

  // Check duration
  try {
    const duration = await getAudioDuration(filePath)

    if (duration < MIN_DURATION_SEC || duration > MAX_DURATION_SEC) {
      return { valid: false, duration, error: 'invalidDuration' }
    }

    return { valid: true, duration }
  } catch (error) {
    console.error('Duration check failed:', error)
    return { valid: false, error: 'Failed to read audio file' }
  }
}

// ============================================================================
// Audio Conversion
// ============================================================================

async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegDir = getFfmpegPath()
    const ffmpegPath = path.join(ffmpegDir, 'ffmpeg.exe')

    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error('ffmpeg not found'))
      return
    }

    // Convert to WAV: 22050Hz, mono, 16-bit PCM (optimal for XTTS-v2)
    const args = [
      '-i', inputPath,
      '-acodec', 'pcm_s16le',
      '-ar', '22050',
      '-ac', '1',
      '-y',
      outputPath
    ]

    const proc = spawn(ffmpegPath, args)
    let stderr = ''

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg conversion failed: ${stderr}`))
        return
      }
      resolve()
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

// ============================================================================
// CRUD Functions
// ============================================================================

function generateId(): string {
  return crypto.randomUUID()
}

export async function addCustomVoice(sourcePath: string, name: string): Promise<AddVoiceResult> {
  // Validate input
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Voice name is required' }
  }

  // Validate file
  const validation = await validateAudioFile(sourcePath)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    ensureCustomVoicesDir()

    // Generate unique ID
    const id = generateId()
    const fileName = `${id}.wav`
    const outputPath = path.join(getCustomVoicesDir(), fileName)

    // Convert to WAV
    await convertToWav(sourcePath, outputPath)

    // Create metadata
    const now = new Date().toISOString()
    const voice: CustomVoiceMetadata = {
      id,
      name: name.trim(),
      fileName,
      originalFileName: path.basename(sourcePath),
      duration: validation.duration!,
      createdAt: now,
      updatedAt: now
    }

    // Save to voices.json
    const voices = await loadCustomVoices()
    voices.push(voice)
    await saveCustomVoices(voices)

    return { success: true, voice }
  } catch (error) {
    console.error('Failed to add custom voice:', error)
    return { success: false, error: (error as Error).message }
  }
}

export async function updateCustomVoice(
  id: string,
  updates: { name?: string; newFilePath?: string }
): Promise<UpdateVoiceResult> {
  try {
    const voices = await loadCustomVoices()
    const index = voices.findIndex(v => v.id === id)

    if (index === -1) {
      return { success: false, error: 'Voice not found' }
    }

    const voice = voices[index]

    // Update name if provided
    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        return { success: false, error: 'Voice name is required' }
      }
      voice.name = updates.name.trim()
    }

    // Replace audio file if provided
    if (updates.newFilePath) {
      // Validate new file
      const validation = await validateAudioFile(updates.newFilePath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Delete old file
      const oldFilePath = path.join(getCustomVoicesDir(), voice.fileName)
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath)
      }

      // Convert new file (keep same ID)
      const outputPath = path.join(getCustomVoicesDir(), voice.fileName)
      await convertToWav(updates.newFilePath, outputPath)

      // Update metadata
      voice.originalFileName = path.basename(updates.newFilePath)
      voice.duration = validation.duration!
    }

    voice.updatedAt = new Date().toISOString()
    voices[index] = voice
    await saveCustomVoices(voices)

    return { success: true }
  } catch (error) {
    console.error('Failed to update custom voice:', error)
    return { success: false, error: (error as Error).message }
  }
}

export async function deleteCustomVoice(id: string): Promise<DeleteVoiceResult> {
  try {
    const voices = await loadCustomVoices()
    const index = voices.findIndex(v => v.id === id)

    if (index === -1) {
      return { success: false, error: 'Voice not found' }
    }

    const voice = voices[index]

    // Delete audio file
    const filePath = path.join(getCustomVoicesDir(), voice.fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Remove from list
    voices.splice(index, 1)
    await saveCustomVoices(voices)

    return { success: true }
  } catch (error) {
    console.error('Failed to delete custom voice:', error)
    return { success: false, error: (error as Error).message }
  }
}
