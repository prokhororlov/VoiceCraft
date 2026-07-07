import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, Play, Loader2, AlertTriangle, FolderOpen } from 'lucide-react'

import { SetupScreen } from '@/components/SetupScreen'
import { TitleBar } from '@/components/TitleBar'
import { FileDropZone } from '@/components/file/FileDropZone'
import { ProviderSelector } from '@/components/provider/ProviderSelector'
import { ElevenLabsSetup } from '@/components/provider/ElevenLabsSetup'
import { SileroSetup } from '@/components/provider/SileroSetup'
import { CoquiSetup } from '@/components/provider/CoquiSetup'
import { BarkSetup } from '@/components/provider/BarkSetup'
import { PiperSetup } from '@/components/provider/PiperSetup'
import { RHVoiceSetup } from '@/components/provider/RHVoiceSetup'
import { TTSModelPanel } from '@/components/tts/TTSModelPanel'
import { VoiceSelector } from '@/components/tts/VoiceSelector'
import { ConversionProgress } from '@/components/conversion/ConversionProgress'
import { ReinstallConfirmDialog, ReinstallProgressDialog } from '@/components/dialogs/ReinstallDialog'
import { UpdateModal } from '@/components/dialogs/UpdateModal'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { PlaybackSettingsContent } from '@/components/settings/PlaybackSettings'
import { CustomVoiceModal, type CustomVoiceMetadata } from '@/components/dialogs/CustomVoiceModal'

import { useTheme, useWindowState, useUpdates } from '@/hooks'
import { PROVIDER_ICONS } from '@/constants'
import { sanitizeFilename, detectLanguage, getDefaultPreviewText, formatSpeedRate } from '@/utils'
import { useI18n } from '@/i18n'
import type {
  BookContent,
  FileInfo,
  VoiceInfo,
  ProviderInfo,
  AcceleratorInfo,
  AcceleratorConfig,
  TTSServerStatus,
  DeviceInfo,
  ReinstallProgress,
} from '@/types'

function App() {
  // ==================== SETUP STATE ====================
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  // ==================== HOOKS ====================
  const { theme, setTheme } = useTheme()
  const { isMaximized } = useWindowState()
  const { t } = useI18n()
  const {
    updateInfo,
    isCheckingUpdate,
    showUpdateModal,
    setShowUpdateModal,
    isDownloadingUpdate,
    updateDownloadProgress,
    checkForUpdates,
    downloadAndInstallUpdate,
  } = useUpdates()

  // ==================== SETTINGS DIALOG STATE ====================
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)

  // ==================== FILE STATE ====================
  const [file, setFile] = useState<FileInfo | null>(null)
  const [bookContent, setBookContent] = useState<BookContent | null>(null)

  // ==================== LANGUAGE & VOICE STATE ====================
  const [language, setLanguage] = useState('en')
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('piper')
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([])
  const [voiceSelectOpen, setVoiceSelectOpen] = useState(false)

  // ==================== PLAYBACK SETTINGS ====================
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([1.0])
  const [timeStretch, setTimeStretch] = useState([1.0])
  const [sentencePause, setSentencePause] = useState([0.0])
  const [ruaccentEnabled, setRuaccentEnabled] = useState(false)
  const [previewText, setPreviewText] = useState(() => getDefaultPreviewText('en'))
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ==================== PREVIEW STATE ====================
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const previewAbortedRef = useRef(false)

  // ==================== CONVERSION STATE ====================
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null)

  // ==================== ELEVENLABS STATE ====================
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>('')
  const [hasApiKey, setHasApiKey] = useState(false)

  // ==================== PROVIDER INSTALLATION STATE ====================
  const [pythonAvailable, setPythonAvailable] = useState(false)

  // Silero
  const [sileroInstalled, setSileroInstalled] = useState(false)
  const [isInstallingSilero, setIsInstallingSilero] = useState(false)
  const [sileroInstallProgress, setSileroInstallProgress] = useState('')
  const [sileroInstallPercent, setSileroInstallPercent] = useState(0)
  const [sileroInstallAccelerator, setSileroInstallAccelerator] = useState<'cpu' | 'cuda'>('cpu')

  // Coqui
  const [coquiInstalled, setCoquiInstalled] = useState(false)
  const [coquiBuildToolsAvailable, setCoquiBuildToolsAvailable] = useState(false)
  const [isInstallingCoqui, setIsInstallingCoqui] = useState(false)
  const [coquiInstallProgress, setCoquiInstallProgress] = useState('')
  const [coquiInstallPercent, setCoquiInstallPercent] = useState(0)
  const [coquiInstallAccelerator, setCoquiInstallAccelerator] = useState<'cpu' | 'cuda' | 'directml'>('cpu')

  // Bark
  const [barkInstalled, setBarkInstalled] = useState(false)
  const [isInstallingBark, setIsInstallingBark] = useState(false)
  const [barkInstallProgress, setBarkInstallProgress] = useState('')
  const [barkInstallPercent, setBarkInstallPercent] = useState(0)
  const [barkInstallAccelerator, setBarkInstallAccelerator] = useState<'cpu' | 'cuda' | 'directml'>('cpu')

  // Piper
  const [piperInstalled, setPiperInstalled] = useState(false)
  const [isInstallingPiperCore, setIsInstallingPiperCore] = useState(false)
  const [piperCoreInstallProgress, setPiperCoreInstallProgress] = useState('')
  const [piperCoreInstallPercent, setPiperCoreInstallPercent] = useState(0)

  // RHVoice
  const [rhvoiceCoreInstalled, setRhvoiceCoreInstalled] = useState(false)
  const [isInstallingRHVoiceCore, setIsInstallingRHVoiceCore] = useState(false)
  const [rhvoiceCoreInstallProgress, setRhvoiceCoreInstallProgress] = useState('')
  const [rhvoiceCoreInstallPercent, setRhvoiceCoreInstallPercent] = useState(0)

  // Voice installation (Piper/RHVoice)
  const [installingVoice, setInstallingVoice] = useState<string | null>(null)
  const [voiceInstallProgress, setVoiceInstallProgress] = useState<number>(0)
  const [installingRHVoice, setInstallingRHVoice] = useState<string | null>(null)
  const [rhvoiceInstallProgress, setRHVoiceInstallProgress] = useState<number>(0)

  // ==================== VOICE CLONING STATE (Coqui) ====================
  const [voiceCloningEnabled, setVoiceCloningEnabled] = useState(false)
  const [customVoices, setCustomVoices] = useState<CustomVoiceMetadata[]>([])
  const [selectedCustomVoice, setSelectedCustomVoice] = useState<string>('')
  const [showCustomVoiceModal, setShowCustomVoiceModal] = useState(false)
  const [editingCustomVoice, setEditingCustomVoice] = useState<CustomVoiceMetadata | null>(null)

  // ==================== GPU ACCELERATOR STATE ====================
  const [availableAccelerators, setAvailableAccelerators] = useState<AcceleratorInfo | null>(null)
  const [sileroAccelerator, setSileroAccelerator] = useState<AcceleratorConfig | null>(null)
  const [coquiAccelerator, setCoquiAccelerator] = useState<AcceleratorConfig | null>(null)
  const [isReinstalling, setIsReinstalling] = useState<'silero' | 'coqui' | null>(null)
  const [reinstallProgress, setReinstallProgress] = useState<ReinstallProgress | null>(null)
  const [showReinstallConfirm, setShowReinstallConfirm] = useState<{ engine: 'silero' | 'coqui'; accelerator: 'cuda' | 'directml' } | null>(null)
  const [isCheckingToolkit, setIsCheckingToolkit] = useState(false)
  const [sileroGpuPopoverOpen, setSileroGpuPopoverOpen] = useState(false)
  const [coquiGpuPopoverOpen, setCoquiGpuPopoverOpen] = useState(false)

  // ==================== TTS SERVER STATE ====================
  const [ttsServerStatus, setTtsServerStatus] = useState<TTSServerStatus | null>(null)
  const [isLoadingModel, setIsLoadingModel] = useState<string | null>(null)
  const [modelLoadProgress, setModelLoadProgress] = useState<number>(0)
  const [preferredDevice, setPreferredDevice] = useState<string>('cpu')
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([
    { id: 'cpu', name: 'CPU', available: true, description: 'Central Processing Unit' }
  ])

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    const checkSetup = async () => {
      if (!window.electronAPI) {
        setNeedsSetup(false)
        return
      }
      const needs = await window.electronAPI.needsSetup()
      setNeedsSetup(needs)
    }
    checkSetup()
  }, [])

  // Fetch providers
  useEffect(() => {
    const fetchProviders = async () => {
      if (!window.electronAPI) return
      try {
        const providers = await window.electronAPI.getAvailableProviders()
        const providersWithIcons: ProviderInfo[] = providers.map(p => ({
          ...p,
          icon: PROVIDER_ICONS[p.id] || PROVIDER_ICONS.piper
        }))
        setAvailableProviders(providersWithIcons)
      } catch (err) {
        console.error('Failed to fetch providers:', err)
      }
    }
    fetchProviders()
  }, [])

  // Helper to update device state
  const updateDeviceState = (status: TTSServerStatus) => {
    setTtsServerStatus(status)
    if (status.available_devices?.length > 0) {
      setAvailableDevices(status.available_devices)
    }
    if (status.preferred_device) {
      setPreferredDevice(status.preferred_device)
    }
  }

  // Detect devices on start
  useEffect(() => {
    const detectDevices = async () => {
      if (!window.electronAPI) return
      try {
        await window.electronAPI.ttsServerStart()
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 500))
          const status = await window.electronAPI.ttsServerStatus()
          if (status.running) {
            updateDeviceState(status)
            break
          }
        }
      } catch (e) {
        console.error('Failed to detect devices:', e)
      }
    }
    detectDevices()
  }, [])

  // Load API key and check providers on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (!window.electronAPI) return
      try {
        const key = await window.electronAPI.getElevenLabsApiKey()
        if (key) {
          setElevenLabsApiKey(key)
          setHasApiKey(true)
        }
      } catch (err) {
        console.error('Failed to load ElevenLabs API key:', err)
      }
    }

    const checkProviders = async () => {
      if (!window.electronAPI) return
      try {
        const deps = await window.electronAPI.checkDependenciesAsync()
        setSileroInstalled(deps.silero)
        setCoquiInstalled(deps.coqui)
        setBarkInstalled(deps.bark)
        setCoquiBuildToolsAvailable(deps.coquiBuildToolsAvailable)
        setPythonAvailable(deps.sileroAvailable || deps.coquiAvailable || deps.barkAvailable)
        setPiperInstalled(deps.piper)
        setRhvoiceCoreInstalled(deps.rhvoiceCore)

        const accelerators = await window.electronAPI.getAvailableAccelerators()
        setAvailableAccelerators(accelerators)
        if (accelerators.directml.available) {
          setCoquiInstallAccelerator('directml')
          setBarkInstallAccelerator('directml')
        } else if (accelerators.cuda.available) {
          setCoquiInstallAccelerator('cuda')
          setBarkInstallAccelerator('cuda')
        }

        if (deps.silero) {
          const sileroAcc = await window.electronAPI.getCurrentSileroAccelerator()
          setSileroAccelerator(sileroAcc)
        }
        if (deps.coqui) {
          const coquiAcc = await window.electronAPI.getCurrentCoquiAccelerator()
          setCoquiAccelerator(coquiAcc)
        }
      } catch (err) {
        console.error('Failed to check provider status:', err)
      }
    }

    loadApiKey()
    checkProviders()
  }, [])

  // Load custom voices when Coqui is selected
  useEffect(() => {
    const loadCustomVoices = async () => {
      if (!window.electronAPI) return
      if (selectedProvider === 'coqui') {
        try {
          const voices = await window.electronAPI.getCustomVoices()
          setCustomVoices(voices)
        } catch (err) {
          console.error('Failed to load custom voices:', err)
        }
      }
    }
    loadCustomVoices()
  }, [selectedProvider])

  // Load voices
  useEffect(() => {
    const loadVoices = async () => {
      if (!window.electronAPI) return
      setIsLoadingVoices(true)
      try {
        const loadedVoices = await window.electronAPI.getVoices(language)
        setVoices(loadedVoices)
      } catch (error) {
        console.error('Failed to load voices:', error)
      } finally {
        setIsLoadingVoices(false)
      }
    }
    loadVoices()
  }, [language, needsSetup, sileroInstalled, coquiInstalled, barkInstalled, rhvoiceCoreInstalled, piperInstalled])

  // Select default voice when provider changes
  useEffect(() => {
    const providerVoices = voices.filter(v => v.provider === selectedProvider)

    if (selectedProvider === 'piper' || selectedProvider === 'rhvoice') {
      const installedVoices = providerVoices.filter(v => v.isInstalled !== false)
      const currentVoiceValid = installedVoices.some(v => v.shortName === selectedVoice)
      if (currentVoiceValid) return
      if (installedVoices.length > 0) {
        setSelectedVoice(installedVoices[0].shortName)
      } else {
        setSelectedVoice('')
      }
    } else if (providerVoices.length > 0) {
      const currentVoiceValid = providerVoices.some(v => v.shortName === selectedVoice)
      if (currentVoiceValid) return
      setSelectedVoice(providerVoices[0].shortName)
    } else if (selectedProvider === 'silero' || selectedProvider === 'coqui' || selectedProvider === 'bark') {
      setSelectedVoice('')
    } else if (voices.length > 0) {
      setSelectedProvider('piper')
      setSelectedVoice(voices[0].shortName)
    }
  }, [voices, selectedProvider])

  // Update preview text when language changes
  useEffect(() => {
    setPreviewText(getDefaultPreviewText(language))
  }, [language])

  // Listen for conversion progress
  useEffect(() => {
    if (!window.electronAPI) return
    const unsubscribe = window.electronAPI.onConversionProgress(({ progress, status }) => {
      setProgress(progress)
      setStatus(status)
    })
    return () => unsubscribe()
  }, [])

  // Model load progress
  useEffect(() => {
    if (!window.electronAPI) return
    const unsubscribe = window.electronAPI.onModelLoadProgress(({ progress }) => {
      setModelLoadProgress(progress)
    })
    return () => unsubscribe()
  }, [])

  // Refresh server status periodically
  useEffect(() => {
    if ((selectedProvider === 'silero' && sileroInstalled) ||
        (selectedProvider === 'coqui' && coquiInstalled)) {
      refreshServerStatus()
      const interval = setInterval(refreshServerStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [selectedProvider, sileroInstalled, coquiInstalled])

  // ==================== HANDLERS ====================
  const refreshServerStatus = async () => {
    if (!window.electronAPI) return
    try {
      const status = await window.electronAPI.ttsServerStatus()
      updateDeviceState(status)
    } catch (err) {
      console.error('Failed to get server status:', err)
    }
  }

  const refreshAccelerators = useCallback(async () => {
    if (!window.electronAPI) return
    setIsCheckingToolkit(true)
    try {
      const accelerators = await window.electronAPI.getAvailableAccelerators()
      setAvailableAccelerators(accelerators)
    } catch (err) {
      console.error('Failed to refresh accelerators:', err)
    } finally {
      setIsCheckingToolkit(false)
    }
  }, [])

  // Auto-refresh toolkit status when reinstall dialog is open
  useEffect(() => {
    if (!showReinstallConfirm) return
    const handleFocus = () => refreshAccelerators()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [showReinstallConfirm, refreshAccelerators])

  const handleFileSelect = async () => {
    if (!window.electronAPI) return
    const filePath = await window.electronAPI.openFileDialog()
    if (!filePath) return
    await loadFile(filePath)
  }

  const loadFile = async (filePath: string) => {
    if (!window.electronAPI) return
    setError(null)

    const fileResult = await window.electronAPI.getFileInfo(filePath)
    if (!fileResult.success || !fileResult.info) {
      setError(fileResult.error || 'Failed to read file')
      return
    }

    setFile(fileResult.info)

    const parseResult = await window.electronAPI.parseBook(filePath)
    if (!parseResult.success || !parseResult.content) {
      setError(parseResult.error || 'Failed to parse book')
      return
    }

    setBookContent(parseResult.content)

    const detectedLang = detectLanguage(parseResult.content.fullText)
    setLanguage(detectedLang)
  }

  const clearFile = () => {
    setFile(null)
    setBookContent(null)
    setProgress(0)
    setStatus('')
    setError(null)
  }

  const handleConvert = async () => {
    // For voice cloning mode, check custom voice; otherwise check regular voice
    const voiceToUse = voiceCloningEnabled && selectedProvider === 'coqui'
      ? selectedCustomVoice
      : selectedVoice

    if (!window.electronAPI || !bookContent || !voiceToUse) return

    const safeFilename = sanitizeFilename(bookContent.title)
    const outputPath = await window.electronAPI.saveFileDialog(`${safeFilename}.mp3`)
    if (!outputPath) return

    setIsConverting(true)
    setProgress(0)
    setStatus(t.conversion.starting)
    setError(null)

    const rate = formatSpeedRate(speed[0])
    const options: Record<string, unknown> = { rate, language }

    if (selectedProvider === 'piper' && sentencePause[0] > 0) {
      options.sentencePause = sentencePause[0]
    }
    if (selectedProvider === 'silero' && pitch[0] !== 1.0) {
      options.pitch = pitch[0]
    }
    if (selectedProvider === 'silero' && timeStretch[0] !== 1.0) {
      options.timeStretch = timeStretch[0]
    }

    // Add ruaccent option for Silero
    if (selectedProvider === 'silero' && ruaccentEnabled) {
      options.useRuaccent = true
    }

    // Add custom voice ID for voice cloning
    if (voiceCloningEnabled && selectedProvider === 'coqui' && selectedCustomVoice) {
      options.customVoiceId = selectedCustomVoice
    }

    const result = await window.electronAPI.convertToSpeech(
      bookContent.fullText,
      voiceToUse,
      outputPath,
      options
    )

    setIsConverting(false)

    if (!result.success) {
      setError(result.error || 'Conversion failed')
      setLastOutputPath(null)
    } else {
      setStatus(t.conversion.completed)
      setLastOutputPath(outputPath)
    }
  }

  const handleCancel = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.abortConversion()
    setIsConverting(false)
    setStatus(t.conversion.cancelled)
  }

  const handlePreviewVoice = async () => {
    // For voice cloning mode, check custom voice; otherwise check regular voice
    const voiceToUse = voiceCloningEnabled && selectedProvider === 'coqui'
      ? selectedCustomVoice
      : selectedVoice

    if (!window.electronAPI || !voiceToUse || isPreviewing) return

    if (previewAudio) {
      previewAudio.pause()
      previewAudio.onended = null
      previewAudio.onerror = null
      previewAudio.src = ''
      setPreviewAudio(null)
    }

    previewAbortedRef.current = false
    setIsPreviewing(true)
    setError(null)

    try {
      const rate = formatSpeedRate(speed[0])
      const options: Record<string, unknown> = { rate, language }

      if (selectedProvider === 'piper' && sentencePause[0] > 0) {
        options.sentencePause = sentencePause[0]
      }
      if (selectedProvider === 'silero' && pitch[0] !== 1.0) {
        options.pitch = pitch[0]
      }
      if (selectedProvider === 'silero' && timeStretch[0] !== 1.0) {
        options.timeStretch = timeStretch[0]
      }

      // Add ruaccent option for Silero
      if (selectedProvider === 'silero' && ruaccentEnabled) {
        options.useRuaccent = true
      }

      // Add custom voice ID for voice cloning
      if (voiceCloningEnabled && selectedProvider === 'coqui' && selectedCustomVoice) {
        options.customVoiceId = selectedCustomVoice
      }

      const result = await window.electronAPI.previewVoice(previewText, voiceToUse, options)

      if (previewAbortedRef.current) return

      if (result.success && result.audioData) {
        const audio = new Audio(result.audioData)

        audio.onended = () => {
          setIsPreviewing(false)
        }
        audio.onerror = () => {
          if (audio.currentTime === 0) {
            setIsPreviewing(false)
            setError(t.errors.failedToPlayPreview)
          }
        }

        setPreviewAudio(audio)
        await audio.play()
      } else {
        setError(result.error || 'Failed to generate preview')
        setIsPreviewing(false)
      }
    } catch (err) {
      if (previewAbortedRef.current) return
      setIsPreviewing(false)
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    }
  }

  const stopPreviewVoice = async () => {
    previewAbortedRef.current = true
    if (window.electronAPI) {
      await window.electronAPI.abortPreview()
    }
    if (previewAudio) {
      previewAudio.pause()
      previewAudio.onended = null
      previewAudio.onerror = null
      previewAudio.src = ''
      setPreviewAudio(null)
    }
    setIsPreviewing(false)
  }

  // ==================== CUSTOM VOICE HANDLERS ====================
  const handleAddCustomVoice = () => {
    setEditingCustomVoice(null)
    setShowCustomVoiceModal(true)
  }

  const handleEditCustomVoice = (voice: CustomVoiceMetadata) => {
    setEditingCustomVoice(voice)
    setShowCustomVoiceModal(true)
  }

  const handleCustomVoiceSaved = (voice: CustomVoiceMetadata) => {
    setCustomVoices(prev => {
      const exists = prev.find(v => v.id === voice.id)
      if (exists) {
        return prev.map(v => v.id === voice.id ? voice : v)
      }
      return [...prev, voice]
    })
    setSelectedCustomVoice(voice.id)
    setShowCustomVoiceModal(false)
    setEditingCustomVoice(null)
  }

  const handleCustomVoiceDeleted = (voiceId: string) => {
    setCustomVoices(prev => prev.filter(v => v.id !== voiceId))
    if (selectedCustomVoice === voiceId) {
      setSelectedCustomVoice('')
    }
    setShowCustomVoiceModal(false)
    setEditingCustomVoice(null)
  }

  const handleLoadModel = async (engine: 'silero' | 'coqui', language?: string) => {
    if (!window.electronAPI) return
    const loadKey = language ? `${engine}-${language}` : engine
    setIsLoadingModel(loadKey)
    setModelLoadProgress(0)
    try {
      const result = await window.electronAPI.ttsModelLoad(engine, language)
      if (!result.success && result.error) {
        setError(result.error)
      }
      await refreshServerStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingModel(null)
      setModelLoadProgress(0)
    }
  }

  const handleUnloadModel = async (engine: 'silero' | 'coqui' | 'all', language?: string) => {
    if (!window.electronAPI) return
    const loadKey = language ? `${engine}-${language}` : engine
    setIsLoadingModel(loadKey)
    try {
      await window.electronAPI.ttsModelUnload(engine, language)
      const status = await window.electronAPI.ttsServerStatus()
      updateDeviceState(status)

      const hasLoadedModels = status.silero.ru_loaded || status.silero.en_loaded || status.coqui.loaded
      if (status.running && !hasLoadedModels) {
        await window.electronAPI.ttsServerStop()
        setTtsServerStatus(prev => prev ? { ...prev, running: false } : null)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingModel(null)
    }
  }

  const handleReinstallWithAccelerator = async (engine: 'silero' | 'coqui', accelerator: 'cuda' | 'directml') => {
    if (!window.electronAPI) return

    setShowReinstallConfirm(null)
    setIsReinstalling(engine)
    setReinstallProgress({ stage: 'installing', message: 'Подготовка к установке...' })

    const unsubscribe = window.electronAPI.onReinstallProgress((progress) => {
      setReinstallProgress(progress)
    })

    try {
      const result = engine === 'silero'
        ? await window.electronAPI.reinstallSileroWithAccelerator(accelerator)
        : await window.electronAPI.reinstallCoquiWithAccelerator(accelerator)

      if (result.success) {
        const newAcc = engine === 'silero'
          ? await window.electronAPI.getCurrentSileroAccelerator()
          : await window.electronAPI.getCurrentCoquiAccelerator()

        if (engine === 'silero') {
          setSileroAccelerator(newAcc)
        } else {
          setCoquiAccelerator(newAcc)
        }

        await window.electronAPI.ttsServerStart()
        await refreshServerStatus()
      } else {
        setError(result.error || 'Reinstallation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsReinstalling(null)
      setReinstallProgress(null)
      unsubscribe()
    }
  }

  // Provider installations
  const handleInstallSilero = async () => {
    if (!window.electronAPI) return
    setIsInstallingSilero(true)
    setSileroInstallProgress('Starting installation...')
    setSileroInstallPercent(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
      setSileroInstallProgress(details)
      setSileroInstallPercent(progress)
    })

    try {
      const result = await window.electronAPI.installSilero(sileroInstallAccelerator)
      if (result.success) {
        setSileroInstalled(true)
        const acc = await window.electronAPI.getCurrentSileroAccelerator()
        setSileroAccelerator(acc)
      } else {
        setError(result.error || 'Silero installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstallingSilero(false)
      setSileroInstallProgress('')
      setSileroInstallPercent(0)
      unsubscribe()
    }
  }

  const handleInstallCoqui = async () => {
    if (!window.electronAPI) return
    setIsInstallingCoqui(true)
    setCoquiInstallProgress('Starting installation...')
    setCoquiInstallPercent(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
      setCoquiInstallProgress(details)
      setCoquiInstallPercent(progress)
    })

    try {
      let result = await window.electronAPI.installCoqui(coquiInstallAccelerator)

      if (result.needsBuildTools) {
        setCoquiInstallProgress('Installing Visual Studio Build Tools...')
        const buildToolsResult = await window.electronAPI.installBuildTools()

        if (!buildToolsResult.success) {
          setError(buildToolsResult.error || 'Failed to install Build Tools')
          return
        }

        if (buildToolsResult.requiresRestart) {
          setError('Build Tools installed successfully. Please restart your computer and try again.')
          return
        }

        setCoquiInstallProgress('Retrying Coqui installation...')
        result = await window.electronAPI.installCoqui(coquiInstallAccelerator)
      }

      if (result.success) {
        setCoquiInstalled(true)
        const acc = await window.electronAPI.getCurrentCoquiAccelerator()
        setCoquiAccelerator(acc)
      } else {
        setError(result.error || 'Coqui installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstallingCoqui(false)
      setCoquiInstallProgress('')
      setCoquiInstallPercent(0)
      unsubscribe()
    }
  }

  const handleInstallBark = async () => {
    if (!window.electronAPI) return
    setIsInstallingBark(true)
    setBarkInstallProgress('Starting installation...')
    setBarkInstallPercent(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
      setBarkInstallProgress(details)
      setBarkInstallPercent(progress)
    })

    try {
      const result = await window.electronAPI.installBark(barkInstallAccelerator)
      if (result.success) {
        setBarkInstalled(true)
      } else {
        setError(result.error || 'Bark installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstallingBark(false)
      setBarkInstallProgress('')
      setBarkInstallPercent(0)
      unsubscribe()
    }
  }

  const handleInstallPiper = async () => {
    if (!window.electronAPI) return
    setIsInstallingPiperCore(true)
    setPiperCoreInstallProgress('Starting installation...')
    setPiperCoreInstallPercent(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
      setPiperCoreInstallProgress(details)
      setPiperCoreInstallPercent(progress)
    })

    try {
      const result = await window.electronAPI.installPiper()
      if (result.success) {
        setPiperInstalled(true)
      } else {
        setError(result.error || 'Piper installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstallingPiperCore(false)
      setPiperCoreInstallProgress('')
      setPiperCoreInstallPercent(0)
      unsubscribe()
    }
  }

  const handleInstallRHVoice = async () => {
    if (!window.electronAPI) return
    setIsInstallingRHVoiceCore(true)
    setRhvoiceCoreInstallProgress('Starting installation...')
    setRhvoiceCoreInstallPercent(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
      setRhvoiceCoreInstallProgress(details)
      setRhvoiceCoreInstallPercent(progress)
    })

    try {
      const result = await window.electronAPI.installRHVoiceCore()
      if (result.success) {
        setRhvoiceCoreInstalled(true)
      } else {
        setError(result.error || 'RHVoice installation failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstallingRHVoiceCore(false)
      setRhvoiceCoreInstallProgress('')
      setRhvoiceCoreInstallPercent(0)
      unsubscribe()
    }
  }

  const handleInstallPiperVoice = async (voice: VoiceInfo) => {
    if (!window.electronAPI) return
    const previousVoice = selectedVoice
    setSelectedVoice(voice.shortName)
    setVoiceSelectOpen(false)
    setInstallingVoice(voice.shortName)
    setVoiceInstallProgress(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress }) => {
      setVoiceInstallProgress(progress)
    })

    try {
      const voiceName = voice.shortName.replace('piper-', '')
      const lang = language === 'ru-RU' ? 'ru_RU' : 'en_US'
      const quality = voiceName === 'amy' ? 'low' : 'medium'

      const result = await window.electronAPI.installPiperVoice(lang, voiceName, quality)

      if (result.success) {
        const loadedVoices = await window.electronAPI.getVoices(language)
        setVoices(loadedVoices)
      } else {
        setError(result.error || 'Voice installation failed')
        setSelectedVoice(previousVoice)
      }
    } catch (err) {
      setError((err as Error).message)
      setSelectedVoice(previousVoice)
    } finally {
      setInstallingVoice(null)
      setVoiceInstallProgress(0)
      unsubscribe()
    }
  }

  const handleInstallRHVoiceVoice = async (voice: VoiceInfo) => {
    if (!window.electronAPI) return
    const previousVoice = selectedVoice
    setSelectedVoice(voice.shortName)
    setVoiceSelectOpen(false)
    setInstallingRHVoice(voice.shortName)
    setRHVoiceInstallProgress(0)

    const unsubscribe = window.electronAPI.onSetupProgress(({ progress }) => {
      setRHVoiceInstallProgress(progress)
    })

    try {
      const result = await window.electronAPI.installRHVoice(voice.shortName, language)

      if (result.success) {
        const loadedVoices = await window.electronAPI.getVoices(language)
        setVoices(loadedVoices)
      } else {
        setError(result.error || 'Voice installation failed')
        setSelectedVoice(previousVoice)
      }
    } catch (err) {
      setError((err as Error).message)
      setSelectedVoice(previousVoice)
    } finally {
      setInstallingRHVoice(null)
      setRHVoiceInstallProgress(0)
      unsubscribe()
    }
  }

  const handleSaveApiKey = async (key: string) => {
    if (!window.electronAPI) return
    await window.electronAPI.setElevenLabsApiKey(key)
    setElevenLabsApiKey(key)
    setHasApiKey(true)
  }

  // ==================== COMPUTED VALUES ====================
  const filteredVoices = voices.filter(v => v.provider === selectedProvider)

  const isProviderReady = (() => {
    switch (selectedProvider) {
      case 'silero': return sileroInstalled
      case 'coqui': return coquiInstalled
      case 'bark': return barkInstalled
      case 'elevenlabs': return hasApiKey
      case 'piper': return piperInstalled
      case 'rhvoice': return rhvoiceCoreInstalled
      default: return true
    }
  })()

  const isSelectedVoiceValid = (() => {
    if (!selectedVoice) return false
    if (selectedProvider !== 'piper' && selectedProvider !== 'rhvoice') return true
    const voice = filteredVoices.find(v => v.shortName === selectedVoice)
    return voice?.isInstalled !== false
  })()

  const isAnyInstallationInProgress =
    isInstallingSilero || isInstallingCoqui || isInstallingBark || isInstallingPiperCore ||
    isInstallingRHVoiceCore || installingVoice !== null || installingRHVoice !== null

  const isModelLoadedForLanguage = (() => {
    if (selectedProvider === 'silero') {
      const langCode = language.startsWith('ru') ? 'ru' : 'en'
      return langCode === 'ru'
        ? ttsServerStatus?.silero.ru_loaded === true
        : ttsServerStatus?.silero.en_loaded === true
    }
    if (selectedProvider === 'coqui') {
      return ttsServerStatus?.coqui.loaded === true
    }
    return true
  })()

  // ==================== RENDER ====================
  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (needsSetup) {
    return <SetupScreen onSetupComplete={() => setNeedsSetup(false)} />
  }

  return (
    <div className={`h-screen flex flex-col bg-background overflow-hidden ${!isMaximized ? 'rounded-[10px]' : ''}`}>
      <TitleBar
        isMaximized={isMaximized}
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettingsDialog(true)}
            aria-label={t.titleBar.settings}
            className="h-8 w-8 relative"
            title={t.titleBar.settings}
            tabIndex={-1}
          >
            <Settings className="h-4 w-4" />
            {updateInfo?.hasUpdate && (
              <span className="absolute top-0 right-0 h-1.5 w-1.5 bg-primary rounded-full" />
            )}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4">
        <div className={`max-w-4xl mx-auto ${!file ? 'h-full flex items-center justify-center' : 'space-y-4'}`}>
          {/* File Drop Zone */}
          <FileDropZone
            file={file}
            bookContent={bookContent}
            isConverting={isConverting}
            onFileSelect={handleFileSelect}
            onFileDrop={loadFile}
            onClear={clearFile}
          />

          {/* Settings */}
          {file && bookContent && (
            <Card>
              <CardContent className="space-y-4 py-6">
                {/* Provider Selection */}
                <ProviderSelector
                  providers={availableProviders}
                  selectedProvider={selectedProvider}
                  voices={voices}
                  disabled={isConverting || isAnyInstallationInProgress}
                  onSelect={setSelectedProvider}
                />

                {/* ElevenLabs API Key */}
                {selectedProvider === 'elevenlabs' && (
                  <ElevenLabsSetup
                    apiKey={elevenLabsApiKey}
                    hasApiKey={hasApiKey}
                    onSaveApiKey={handleSaveApiKey}
                  />
                )}

                {/* Silero Setup */}
                {selectedProvider === 'silero' && !sileroInstalled && (
                  <SileroSetup
                    isInstalling={isInstallingSilero}
                    installProgress={sileroInstallProgress}
                    installPercent={sileroInstallPercent}
                    pythonAvailable={pythonAvailable}
                    availableAccelerators={availableAccelerators}
                    selectedAccelerator={sileroInstallAccelerator}
                    onAcceleratorChange={setSileroInstallAccelerator}
                    onInstall={handleInstallSilero}
                    onRefreshAccelerators={refreshAccelerators}
                    onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                  />
                )}

                {/* Coqui Setup */}
                {selectedProvider === 'coqui' && !coquiInstalled && (
                  <CoquiSetup
                    isInstalling={isInstallingCoqui}
                    installProgress={coquiInstallProgress}
                    installPercent={coquiInstallPercent}
                    pythonAvailable={pythonAvailable}
                    buildToolsAvailable={coquiBuildToolsAvailable}
                    availableAccelerators={availableAccelerators}
                    selectedAccelerator={coquiInstallAccelerator}
                    onAcceleratorChange={setCoquiInstallAccelerator}
                    onInstall={handleInstallCoqui}
                    onRefreshAccelerators={refreshAccelerators}
                    onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                  />
                )}

                {/* Bark Setup */}
                {selectedProvider === 'bark' && !barkInstalled && (
                  <BarkSetup
                    isInstalling={isInstallingBark}
                    installProgress={barkInstallProgress}
                    installPercent={barkInstallPercent}
                    pythonAvailable={pythonAvailable}
                    availableAccelerators={availableAccelerators}
                    selectedAccelerator={barkInstallAccelerator}
                    onAcceleratorChange={setBarkInstallAccelerator}
                    onInstall={handleInstallBark}
                    onRefreshAccelerators={refreshAccelerators}
                    onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                  />
                )}

                {/* Piper Setup */}
                {selectedProvider === 'piper' && !piperInstalled && (
                  <PiperSetup
                    isInstalling={isInstallingPiperCore}
                    installProgress={piperCoreInstallProgress}
                    installPercent={piperCoreInstallPercent}
                    onInstall={handleInstallPiper}
                  />
                )}

                {/* RHVoice Setup */}
                {selectedProvider === 'rhvoice' && !rhvoiceCoreInstalled && (
                  <RHVoiceSetup
                    isInstalling={isInstallingRHVoiceCore}
                    installProgress={rhvoiceCoreInstallProgress}
                    installPercent={rhvoiceCoreInstallPercent}
                    onInstall={handleInstallRHVoice}
                  />
                )}

                {/* TTS Model Panel */}
                {((selectedProvider === 'silero' && sileroInstalled) ||
                  (selectedProvider === 'coqui' && coquiInstalled)) && (
                  <TTSModelPanel
                    provider={selectedProvider as 'silero' | 'coqui'}
                    serverStatus={ttsServerStatus}
                    accelerator={selectedProvider === 'silero' ? sileroAccelerator : coquiAccelerator}
                    availableAccelerators={availableAccelerators}
                    isLoadingModel={isLoadingModel}
                    modelLoadProgress={modelLoadProgress}
                    isAnyInstalling={isAnyInstallationInProgress}
                    isReinstalling={isReinstalling !== null}
                    gpuPopoverOpen={selectedProvider === 'silero' ? sileroGpuPopoverOpen : coquiGpuPopoverOpen}
                    onGpuPopoverChange={selectedProvider === 'silero' ? setSileroGpuPopoverOpen : setCoquiGpuPopoverOpen}
                    onLoadModel={handleLoadModel}
                    onUnloadModel={handleUnloadModel}
                    onShowReinstallConfirm={(engine, acc) => setShowReinstallConfirm({ engine, accelerator: acc })}
                  />
                )}

                {/* Language & Voice Selection */}
                {isProviderReady && (
                  <div className="space-y-4">
                    <VoiceSelector
                      language={language}
                      onLanguageChange={setLanguage}
                      selectedVoice={selectedVoice}
                      onVoiceChange={setSelectedVoice}
                      voices={voices}
                      selectedProvider={selectedProvider}
                      isLoadingVoices={isLoadingVoices}
                      isConverting={isConverting}
                      isAnyInstalling={isAnyInstallationInProgress}
                      isProviderReady={isProviderReady}
                      isModelLoadedForLanguage={isModelLoadedForLanguage}
                      isSelectedVoiceValid={isSelectedVoiceValid}
                      isPreviewing={isPreviewing}
                      installingVoice={installingVoice}
                      installingRHVoice={installingRHVoice}
                      voiceInstallProgress={voiceInstallProgress}
                      rhvoiceInstallProgress={rhvoiceInstallProgress}
                      voiceSelectOpen={voiceSelectOpen}
                      onVoiceSelectOpenChange={setVoiceSelectOpen}
                      onPreview={handlePreviewVoice}
                      onStopPreview={stopPreviewVoice}
                      onInstallPiperVoice={handleInstallPiperVoice}
                      onInstallRHVoice={handleInstallRHVoiceVoice}
                      settingsOpen={settingsOpen}
                      onSettingsOpenChange={setSettingsOpen}
                      voiceCloningEnabled={voiceCloningEnabled}
                      onVoiceCloningChange={setVoiceCloningEnabled}
                      customVoices={customVoices}
                      selectedCustomVoice={selectedCustomVoice}
                      onCustomVoiceChange={setSelectedCustomVoice}
                      onAddCustomVoice={handleAddCustomVoice}
                      onEditCustomVoice={handleEditCustomVoice}
                      settingsContent={
                        <PlaybackSettingsContent
                          speed={speed}
                          onSpeedChange={setSpeed}
                          pitch={pitch}
                          onPitchChange={setPitch}
                          timeStretch={timeStretch}
                          onTimeStretchChange={setTimeStretch}
                          sentencePause={sentencePause}
                          onSentencePauseChange={setSentencePause}
                          ruaccentEnabled={ruaccentEnabled}
                          onRuaccentChange={setRuaccentEnabled}
                          previewText={previewText}
                          onPreviewTextChange={setPreviewText}
                          selectedProvider={selectedProvider}
                          isConverting={isConverting}
                          isPreviewing={isPreviewing}
                        />
                      }
                    />
                  </div>
                )}

                {/* Installation Warning */}
                {isAnyInstallationInProgress && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-medium">{t.installation.inProgress}</p>
                      <p className="text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                        {t.installation.doNotClose}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {isProviderReady && !isConverting && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleConvert}
                      disabled={!isModelLoadedForLanguage || !isSelectedVoiceValid}
                      className="flex-1 h-12 text-base gap-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                      title={!isModelLoadedForLanguage ? t.voice.loadModelFirst : ''}
                    >
                      <Play className="h-5 w-5" />
                      {!isModelLoadedForLanguage ? t.conversion.loadModelToConvert : t.conversion.convertToMp3}
                    </Button>
                    {status === t.conversion.completed && lastOutputPath && (
                      <Button
                        variant="outline"
                        className="h-12 gap-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => window.electronAPI.openExternal(`file:///${lastOutputPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '')}`)}
                      >
                        <FolderOpen className="h-5 w-5" />
                        {t.conversion.openFolder}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Conversion Progress */}
          {isConverting && (
            <ConversionProgress progress={progress} status={status} onCancel={handleCancel} />
          )}

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="py-3">
                <p className="text-destructive text-center text-sm">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Reinstall Confirmation Dialog */}
        {showReinstallConfirm && (
          <ReinstallConfirmDialog
            engine={showReinstallConfirm.engine}
            accelerator={showReinstallConfirm.accelerator}
            availableAccelerators={availableAccelerators}
            isCheckingToolkit={isCheckingToolkit}
            onConfirm={() => handleReinstallWithAccelerator(showReinstallConfirm.engine, showReinstallConfirm.accelerator)}
            onCancel={() => setShowReinstallConfirm(null)}
            onRefreshAccelerators={refreshAccelerators}
            onOpenExternal={(url) => window.electronAPI.openExternal(url)}
          />
        )}

        {/* Reinstall Progress Dialog */}
        {isReinstalling && (
          <ReinstallProgressDialog
            engine={isReinstalling}
            progress={reinstallProgress}
            onClose={() => {
              setIsReinstalling(null)
              setReinstallProgress(null)
            }}
          />
        )}

        {/* Custom Voice Modal */}
        <CustomVoiceModal
          isOpen={showCustomVoiceModal}
          onClose={() => {
            setShowCustomVoiceModal(false)
            setEditingCustomVoice(null)
          }}
          onVoiceSaved={handleCustomVoiceSaved}
          onVoiceDeleted={handleCustomVoiceDeleted}
          editingVoice={editingCustomVoice}
        />

        {/* Update Modal */}
        {showUpdateModal && updateInfo && (
          <UpdateModal
            updateInfo={updateInfo}
            isDownloading={isDownloadingUpdate}
            downloadProgress={updateDownloadProgress}
            onDownload={downloadAndInstallUpdate}
            onClose={() => setShowUpdateModal(false)}
          />
        )}

        {/* Settings Dialog */}
        <SettingsDialog
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
          theme={theme}
          onThemeChange={setTheme}
          isCheckingUpdate={isCheckingUpdate}
          hasUpdate={updateInfo?.hasUpdate ?? false}
          latestVersion={updateInfo?.latestVersion}
          onCheckUpdate={() => checkForUpdates(true)}
          currentVersion="1.1.10"
        />
      </div>
    </div>
  )
}

export default App
