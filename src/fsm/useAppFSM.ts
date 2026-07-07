import { useReducer, useEffect, useCallback, useMemo } from 'react'
import { appReducer } from './reducer'
import { useNetworkStatus } from './useNetworkStatus'
import {
  initialContext,
  type FSMContext,
  type AppAction,
  type AppState,
  type TTSProvider,
  type SetupError,
  type ConversionError,
  type ProviderError,
  type ToolkitError,
  OFFLINE_PROVIDERS
} from './types'
import type { AcceleratorType, ReinstallProgress } from '../../electron/services/setup/types'
import { classifyConversionError, classifyProviderError, classifySetupError, parseToolkitError } from './errorClassifier'

/**
 * Main FSM hook for managing application state
 */
export function useAppFSM() {
  const [context, dispatch] = useReducer(appReducer, initialContext)
  const { isOnline } = useNetworkStatus()

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    const init = async () => {
      if (!window.electronAPI) {
        // No Electron API - running in browser, go to READY
        dispatch({
          type: 'STARTUP_CHECK_COMPLETE',
          needsSetup: false,
          isOnline: true
        })
        return
      }

      try {
        const needsSetup = await window.electronAPI.needsSetup()

        if (needsSetup) {
          dispatch({
            type: 'STARTUP_CHECK_COMPLETE',
            needsSetup: true
          })
          return
        }

        // Load all dependency info
        const [dependencies, accelerators, sileroAccelerator, coquiAccelerator] = await Promise.all([
          window.electronAPI.checkDependenciesAsync(),
          window.electronAPI.getAvailableAccelerators(),
          window.electronAPI.getCurrentSileroAccelerator(),
          window.electronAPI.getCurrentCoquiAccelerator()
        ])

        dispatch({
          type: 'STARTUP_CHECK_COMPLETE',
          needsSetup: false,
          dependencies,
          accelerators,
          currentAccelerators: {
            silero: sileroAccelerator,
            coqui: coquiAccelerator
          },
          isOnline
        })
      } catch (error) {
        console.error('Failed to initialize FSM:', error)
        // On error, assume setup is needed
        dispatch({
          type: 'STARTUP_CHECK_COMPLETE',
          needsSetup: true
        })
      }
    }

    init()
  }, []) // Only run once on mount

  // ==================== NETWORK STATUS SYNC ====================

  useEffect(() => {
    if (isOnline !== context.isOnline) {
      dispatch({ type: isOnline ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE' })
    }
  }, [isOnline, context.isOnline])

  // ==================== SETUP PROGRESS LISTENER ====================

  useEffect(() => {
    if (!window.electronAPI) return

    const unsubscribe = window.electronAPI.onSetupProgress((data) => {
      if (context.state.type === 'SETUP_INSTALLING') {
        let stage: 'downloading' | 'extracting' | 'verifying' = 'downloading'
        if (data.stage.includes('extract') || data.stage.includes('распаков')) {
          stage = 'extracting'
        } else if (data.stage.includes('verif') || data.stage.includes('провер')) {
          stage = 'verifying'
        }

        dispatch({
          type: 'SETUP_PROGRESS',
          progress: data.progress,
          details: data.details,
          stage
        })
      }
    })

    return unsubscribe
  }, [context.state.type])

  // ==================== REINSTALL PROGRESS LISTENER ====================

  useEffect(() => {
    if (!window.electronAPI) return

    const unsubscribe = window.electronAPI.onReinstallProgress((data: ReinstallProgress) => {
      if (context.state.type === 'REINSTALLING_ACCELERATOR') {
        dispatch({
          type: 'REINSTALL_PROGRESS',
          progress: data
        })
      }
    })

    return unsubscribe
  }, [context.state.type])

  // ==================== STATE HELPERS ====================

  const state = context.state

  const isLoading = state.type === 'LOADING'
  const needsSetup = state.type === 'SETUP_REQUIRED'
  const isSetupInstalling = state.type === 'SETUP_INSTALLING'
  const isSetupComplete = state.type === 'SETUP_COMPLETE'
  const isSetupError = state.type === 'SETUP_ERROR'
  const isReady = state.type === 'READY'
  const isOffline = state.type === 'OFFLINE'
  const isConverting = state.type === 'CONVERTING'
  const isConversionError = state.type === 'CONVERSION_ERROR'
  const isInstallingProvider = state.type === 'INSTALLING_PROVIDER'
  const isProviderError = state.type === 'PROVIDER_ERROR'
  const isReinstallingAccelerator = state.type === 'REINSTALLING_ACCELERATOR'
  const isToolkitError = state.type === 'TOOLKIT_ERROR'

  const hasError = isSetupError || isConversionError || isProviderError || isToolkitError
  const canWork = isReady || isOffline

  // ==================== ACTIONS ====================

  // Setup actions
  const startSetup = useCallback(async () => {
    if (!window.electronAPI) return

    dispatch({ type: 'START_SETUP' })

    try {
      const result = await window.electronAPI.installFfmpeg()

      if (result.success) {
        dispatch({ type: 'SETUP_SUCCESS' })
      } else {
        const error = classifySetupError(result.error || 'Unknown error', 'ffmpeg')
        dispatch({ type: 'SETUP_FAILED', error })
      }
    } catch (error) {
      const setupError = classifySetupError(error as Error, 'ffmpeg')
      dispatch({ type: 'SETUP_FAILED', error: setupError })
    }
  }, [])

  const retrySetup = useCallback(() => {
    dispatch({ type: 'RETRY_SETUP' })
  }, [])

  const completeSetup = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const [dependencies, accelerators, sileroAccelerator, coquiAccelerator] = await Promise.all([
        window.electronAPI.checkDependenciesAsync(),
        window.electronAPI.getAvailableAccelerators(),
        window.electronAPI.getCurrentSileroAccelerator(),
        window.electronAPI.getCurrentCoquiAccelerator()
      ])

      dispatch({
        type: 'COMPLETE_SETUP',
        dependencies,
        accelerators,
        currentAccelerators: {
          silero: sileroAccelerator,
          coqui: coquiAccelerator
        }
      })
    } catch (error) {
      console.error('Failed to complete setup:', error)
    }
  }, [])

  // Conversion actions
  const startConversion = useCallback((outputPath: string) => {
    dispatch({ type: 'START_CONVERSION', outputPath })
  }, [])

  const updateConversionProgress = useCallback((progress: number, status: string) => {
    dispatch({ type: 'CONVERSION_PROGRESS', progress, status })
  }, [])

  const conversionSuccess = useCallback(() => {
    dispatch({ type: 'CONVERSION_SUCCESS' })
  }, [])

  const conversionFailed = useCallback((error: Error | string, provider: TTSProvider) => {
    const classifiedError = classifyConversionError(error, provider)
    dispatch({ type: 'CONVERSION_FAILED', error: classifiedError })
  }, [])

  const cancelConversion = useCallback(() => {
    dispatch({ type: 'CANCEL_CONVERSION' })
  }, [])

  const retryConversion = useCallback(() => {
    dispatch({ type: 'RETRY_CONVERSION' })
  }, [])

  const dismissConversionError = useCallback(() => {
    dispatch({ type: 'DISMISS_CONVERSION_ERROR' })
  }, [])

  // Provider installation actions
  const startProviderInstall = useCallback((provider: TTSProvider, accelerator?: AcceleratorType) => {
    dispatch({ type: 'START_PROVIDER_INSTALL', provider, accelerator })
  }, [])

  const updateProviderInstallProgress = useCallback((progress: number, details: string) => {
    dispatch({ type: 'PROVIDER_INSTALL_PROGRESS', progress, details })
  }, [])

  const providerInstallSuccess = useCallback(async (provider: TTSProvider) => {
    if (!window.electronAPI) return

    try {
      const [dependencies, accelerators, sileroAccelerator, coquiAccelerator] = await Promise.all([
        window.electronAPI.checkDependenciesAsync(),
        window.electronAPI.getAvailableAccelerators(),
        window.electronAPI.getCurrentSileroAccelerator(),
        window.electronAPI.getCurrentCoquiAccelerator()
      ])

      dispatch({
        type: 'PROVIDER_INSTALL_SUCCESS',
        provider,
        dependencies,
        accelerators,
        currentAccelerators: {
          silero: sileroAccelerator,
          coqui: coquiAccelerator
        }
      })
    } catch (error) {
      console.error('Failed to refresh after provider install:', error)
    }
  }, [])

  const providerInstallFailed = useCallback((error: Error | string, provider: TTSProvider, stage?: 'download' | 'extract' | 'install' | 'verify') => {
    const classifiedError = classifyProviderError(error, provider, stage)
    dispatch({ type: 'PROVIDER_INSTALL_FAILED', error: classifiedError })
  }, [])

  const retryProviderInstall = useCallback(() => {
    dispatch({ type: 'RETRY_PROVIDER_INSTALL' })
  }, [])

  const dismissProviderError = useCallback(() => {
    dispatch({ type: 'DISMISS_PROVIDER_ERROR' })
  }, [])

  const goToSetup = useCallback(() => {
    dispatch({ type: 'GO_TO_SETUP' })
  }, [])

  // Accelerator reinstall actions
  const startAcceleratorReinstall = useCallback((engine: 'silero' | 'coqui', accelerator: AcceleratorType) => {
    dispatch({ type: 'START_ACCELERATOR_REINSTALL', engine, accelerator })
  }, [])

  const reinstallSuccess = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const [sileroAccelerator, coquiAccelerator] = await Promise.all([
        window.electronAPI.getCurrentSileroAccelerator(),
        window.electronAPI.getCurrentCoquiAccelerator()
      ])

      dispatch({
        type: 'REINSTALL_SUCCESS',
        currentAccelerators: {
          silero: sileroAccelerator,
          coqui: coquiAccelerator
        }
      })
    } catch (error) {
      console.error('Failed to refresh after reinstall:', error)
    }
  }, [])

  const reinstallFailed = useCallback((error: Error | string) => {
    // Try to parse as toolkit error
    const errorMessage = typeof error === 'string' ? error : error.message
    const toolkitError = parseToolkitError(errorMessage)

    if (toolkitError) {
      dispatch({ type: 'TOOLKIT_ERROR_OCCURRED', error: toolkitError })
    } else {
      // Regular provider error
      const providerError = classifyProviderError(error, 'silero', 'install')
      dispatch({ type: 'REINSTALL_FAILED', error: providerError })
    }
  }, [])

  const dismissToolkitError = useCallback(() => {
    dispatch({ type: 'DISMISS_TOOLKIT_ERROR' })
  }, [])

  const retryAfterToolkit = useCallback(() => {
    dispatch({ type: 'RETRY_AFTER_TOOLKIT' })
  }, [])

  const useCpuFallback = useCallback((engine: 'silero' | 'coqui') => {
    dispatch({ type: 'USE_CPU_FALLBACK', engine })
  }, [])

  // Refresh actions
  const refreshDependencies = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const dependencies = await window.electronAPI.checkDependenciesAsync()
      dispatch({ type: 'REFRESH_DEPENDENCIES', dependencies })
    } catch (error) {
      console.error('Failed to refresh dependencies:', error)
    }
  }, [])

  const refreshAccelerators = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const [accelerators, sileroAccelerator, coquiAccelerator] = await Promise.all([
        window.electronAPI.getAvailableAccelerators(),
        window.electronAPI.getCurrentSileroAccelerator(),
        window.electronAPI.getCurrentCoquiAccelerator()
      ])

      dispatch({
        type: 'REFRESH_ACCELERATORS',
        accelerators,
        currentAccelerators: {
          silero: sileroAccelerator,
          coqui: coquiAccelerator
        }
      })
    } catch (error) {
      console.error('Failed to refresh accelerators:', error)
    }
  }, [])

  // ==================== DERIVED DATA ====================

  // Available providers based on network status
  const availableProviders = useMemo((): TTSProvider[] => {
    if (context.isOnline) {
      return ['rhvoice', 'piper', 'silero', 'coqui', 'bark', 'elevenlabs']
    }
    return [...OFFLINE_PROVIDERS]
  }, [context.isOnline])

  // Check if a provider is available (installed and can be used)
  const isProviderAvailable = useCallback((provider: TTSProvider): boolean => {
    const deps = context.dependencies
    if (!deps) return false

    switch (provider) {
      case 'rhvoice':
        return deps.rhvoiceCore && deps.rhvoiceVoices.length > 0
      case 'piper':
        return deps.piper && deps.ffmpeg
      case 'silero':
        return deps.silero && deps.ffmpeg
      case 'coqui':
        return deps.coqui && deps.ffmpeg
      case 'bark':
        return deps.bark && deps.ffmpeg
      case 'elevenlabs':
        return context.isOnline
      default:
        return false
    }
  }, [context.dependencies, context.isOnline])

  return {
    // State
    state,
    context,
    dispatch,

    // State type checks
    isLoading,
    needsSetup,
    isSetupInstalling,
    isSetupComplete,
    isSetupError,
    isReady,
    isOffline,
    isConverting,
    isConversionError,
    isInstallingProvider,
    isProviderError,
    isReinstallingAccelerator,
    isToolkitError,
    hasError,
    canWork,

    // Data
    dependencies: context.dependencies,
    accelerators: context.accelerators,
    currentAccelerators: context.currentAccelerators,
    isOnline: context.isOnline,
    availableProviders,
    isProviderAvailable,

    // Setup actions
    startSetup,
    retrySetup,
    completeSetup,

    // Conversion actions
    startConversion,
    updateConversionProgress,
    conversionSuccess,
    conversionFailed,
    cancelConversion,
    retryConversion,
    dismissConversionError,

    // Provider installation actions
    startProviderInstall,
    updateProviderInstallProgress,
    providerInstallSuccess,
    providerInstallFailed,
    retryProviderInstall,
    dismissProviderError,
    goToSetup,

    // Accelerator reinstall actions
    startAcceleratorReinstall,
    reinstallSuccess,
    reinstallFailed,
    dismissToolkitError,
    retryAfterToolkit,
    useCpuFallback,

    // Refresh actions
    refreshDependencies,
    refreshAccelerators
  }
}

// Export types for consumers
export type { FSMContext, AppAction, AppState }
