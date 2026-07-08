import { ipcMain } from 'electron'
import {
  checkDependencies,
  checkDependenciesAsync,
  needsSetup,
  runSetup,
  getEstimatedDownloadSize,
  SetupProgress,
  installSilero,
  installCoqui,
  installBark,
  checkPythonAvailable,
  installPiperVoice,
  installRHVoiceCore,
  installRHVoice,
  getInstalledRHVoices,
  getAvailableRHVoices,
  RHVOICE_VOICE_URLS,
  installPiper,
  installFfmpeg,
  checkBuildToolsAvailable,
  installBuildTools,
  installEmbeddedPython,
  checkEmbeddedPythonInstalled,
  getPythonInfo,
  getAvailableAccelerators,
  getCurrentAccelerator,
  reinstallSileroWithAccelerator,
  reinstallCoquiWithAccelerator,
  AcceleratorType,
  ReinstallProgress
} from '../../services/setup'
import { stopTTSServer } from '../../services/tts'

export function registerSetupHandlers() {
  ipcMain.handle('check-dependencies', async () => {
    return checkDependencies()
  })

  ipcMain.handle('check-dependencies-async', async () => {
    const result = await checkDependenciesAsync()
    console.log('checkDependenciesAsync result:', JSON.stringify(result, null, 2))
    return result
  })

  ipcMain.handle('check-python-available', async () => {
    const pythonCmd = await checkPythonAvailable()
    return pythonCmd !== null
  })

  ipcMain.handle('install-silero', async (event, accelerator: AcceleratorType = 'cpu') => {
    try {
      await stopTTSServer()
      const result = await installSilero((progress) => {
        event.sender.send('setup-progress', progress)
      }, accelerator)
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-embedded-python', async (event) => {
    try {
      const result = await installEmbeddedPython((progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('check-embedded-python', async () => {
    return checkEmbeddedPythonInstalled()
  })

  ipcMain.handle('get-python-info', async () => {
    return await getPythonInfo()
  })

  ipcMain.handle('install-coqui', async (event, accelerator: AcceleratorType = 'cpu') => {
    try {
      await stopTTSServer()
      const result = await installCoqui((progress) => {
        event.sender.send('setup-progress', progress)
      }, accelerator)
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-bark', async (event, accelerator: AcceleratorType = 'cpu') => {
    try {
      await stopTTSServer()
      const result = await installBark((progress) => {
        event.sender.send('setup-progress', progress)
      }, accelerator)
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('check-build-tools', async () => {
    try {
      return await checkBuildToolsAvailable()
    } catch (error) {
      return false
    }
  })

  ipcMain.handle('install-build-tools', async (event) => {
    try {
      const result = await installBuildTools((progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-piper', async (event) => {
    try {
      const result = await installPiper((progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-ffmpeg', async (event) => {
    try {
      const result = await installFfmpeg((progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // GPU Accelerator handlers
  ipcMain.handle('get-available-accelerators', async () => {
    return await getAvailableAccelerators()
  })

  ipcMain.handle('get-current-silero-accelerator', async () => {
    return getCurrentAccelerator('silero')
  })

  ipcMain.handle('get-current-coqui-accelerator', async () => {
    return getCurrentAccelerator('coqui')
  })

  ipcMain.handle('get-current-bark-accelerator', async () => {
    return getCurrentAccelerator('bark')
  })

  ipcMain.handle('reinstall-silero-with-accelerator', async (event, accelerator: AcceleratorType) => {
    try {
      // Stop TTS server first
      await stopTTSServer()

      const result = await reinstallSileroWithAccelerator(accelerator, (progress: ReinstallProgress) => {
        event.sender.send('reinstall-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('reinstall-coqui-with-accelerator', async (event, accelerator: AcceleratorType) => {
    try {
      // Stop TTS server first
      await stopTTSServer()

      const result = await reinstallCoquiWithAccelerator(accelerator, (progress: ReinstallProgress) => {
        event.sender.send('reinstall-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-piper-voice', async (event, lang: 'ru_RU' | 'en_US', voiceName: string, quality: string) => {
    try {
      await installPiperVoice(lang, voiceName, quality, (progress) => {
        event.sender.send('setup-progress', progress)
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-rhvoice-core', async (event) => {
    try {
      const result = await installRHVoiceCore((progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-rhvoice', async (event, voiceName: string, language: string) => {
    try {
      const result = await installRHVoice(voiceName, language, (progress) => {
        event.sender.send('setup-progress', progress)
      })
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('get-installed-rhvoices', async () => {
    return await getInstalledRHVoices()
  })

  ipcMain.handle('get-available-rhvoices', (_event, language: string) => {
    return getAvailableRHVoices(language)
  })

  ipcMain.handle('get-rhvoice-urls', () => {
    return RHVOICE_VOICE_URLS
  })

  ipcMain.handle('needs-setup', async () => {
    return needsSetup()
  })

  ipcMain.handle('get-estimated-download-size', async () => {
    return await getEstimatedDownloadSize()
  })

  ipcMain.handle('check-gpu-toolkit', async (_event, accelerator: AcceleratorType) => {
    const { checkGPUToolkit } = await import('../../services/setup.js')
    return checkGPUToolkit(accelerator)
  })

  ipcMain.handle('run-setup', async (event, options?: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
  }) => {
    try {
      await runSetup((progress: SetupProgress) => {
        event.sender.send('setup-progress', progress)
      }, options)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
