import { ipcMain, dialog } from 'electron'
import path from 'path'
import {
  convertToSpeech,
  getVoicesForLanguage,
  previewVoice,
  abortPreview,
  getAvailableProviders,
  startTTSServer,
  stopTTSServer,
  getTTSServerStatus,
  loadTTSModel,
  unloadTTSModel,
  setPreferredDevice,
  cleanupTempAudio
} from '../../services/tts'
import {
  loadCustomVoices,
  addCustomVoice,
  updateCustomVoice,
  deleteCustomVoice,
  validateAudioFile
} from '../../services/tts/customVoices'
import { getMainWindow } from '../window'

let conversionAborted = false
let lastConversionOutputPath: string | null = null

export function registerTTSHandlers() {
  ipcMain.handle('get-voices', async (_event, language: string) => {
    try {
      const voices = await getVoicesForLanguage(language)
      return { success: true, voices }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('get-available-providers', () => {
    return getAvailableProviders()
  })

  ipcMain.handle('convert-to-speech', async (
    event,
    text: string,
    voice: string,
    outputPath: string,
    options: { rate?: string; volume?: string; sentencePause?: number; pitch?: number; timeStretch?: number; customVoiceId?: string; useRuaccent?: boolean }
  ) => {
    conversionAborted = false

    // Cleanup temp from previous conversion before starting new one
    if (lastConversionOutputPath) {
      cleanupTempAudio(path.dirname(lastConversionOutputPath))
    }
    lastConversionOutputPath = outputPath

    try {
      await convertToSpeech(
        text,
        voice,
        outputPath,
        options,
        (progress: number, status: string) => {
          if (!conversionAborted) {
            event.sender.send('conversion-progress', { progress, status })
          }
        },
        () => conversionAborted
      )
      return { success: true }
    } catch (error) {
      // Cleanup on error
      cleanupTempAudio(path.dirname(outputPath))
      if (conversionAborted) {
        return { success: false, error: 'Conversion cancelled' }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('abort-conversion', async () => {
    conversionAborted = true
    // Cleanup temp files on abort
    if (lastConversionOutputPath) {
      cleanupTempAudio(path.dirname(lastConversionOutputPath))
    }
    return { success: true }
  })

  ipcMain.handle('preview-voice', async (_event, text: string, voiceShortName: string, options: Record<string, unknown> = {}) => {
    return await previewVoice(text, voiceShortName, options as { rate?: string; sentencePause?: number; pitch?: number; timeStretch?: number; customVoiceId?: string; useRuaccent?: boolean })
  })

  ipcMain.handle('abort-preview', () => {
    abortPreview()
    return { success: true }
  })

  // TTS Server handlers
  ipcMain.handle('tts-server-start', async () => {
    try {
      await startTTSServer()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('tts-server-stop', async () => {
    try {
      await stopTTSServer()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('tts-server-status', async () => {
    return getTTSServerStatus()
  })

  ipcMain.handle('tts-model-load', async (_event, engine: 'silero' | 'coqui', language?: string) => {
    return loadTTSModel(engine, language)
  })

  ipcMain.handle('tts-model-unload', async (_event, engine: 'silero' | 'coqui' | 'all', language?: string) => {
    return unloadTTSModel(engine, language)
  })

  ipcMain.handle('tts-set-device', async (_event, device: string) => {
    return setPreferredDevice(device)
  })

  // Custom Voices handlers
  ipcMain.handle('get-custom-voices', async () => {
    return loadCustomVoices()
  })

  ipcMain.handle('add-custom-voice', async (_event, filePath: string, name: string) => {
    return addCustomVoice(filePath, name)
  })

  ipcMain.handle('update-custom-voice', async (_event, id: string, updates: { name?: string; newFilePath?: string }) => {
    return updateCustomVoice(id, updates)
  })

  ipcMain.handle('delete-custom-voice', async (_event, id: string) => {
    return deleteCustomVoice(id)
  })

  ipcMain.handle('validate-audio-file', async (_event, filePath: string) => {
    return validateAudioFile(filePath)
  })

  ipcMain.handle('open-audio-file-dialog', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return null
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'wma', 'ogg', 'flac', 'amr', 'm4a', 'aiff', 'aac'] }
      ],
      properties: ['openFile']
    })

    return result.filePaths[0] || null
  })
}
