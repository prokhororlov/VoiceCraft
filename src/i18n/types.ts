export type Language = 'en' | 'ru';

export interface Translations {
  // Common
  common: {
    cancel: string;
    confirm: string;
    close: string;
    retry: string;
    download: string;
    install: string;
    refresh: string;
    check: string;
    details: string;
    warning: string;
    error: string;
    success: string;
    loading: string;
    save: string;
    settings: string;
    language: string;
    theme: string;
    checkUpdates: string;
    later: string;
    pleaseWait: string;
    startWork: string;
    downloadAndInstall: string;
    apply: string;
  };

  // Title bar
  titleBar: {
    settings: string;
    minimize: string;
    maximize: string;
    close: string;
    subtitle: string;
  };

  // Settings dialog
  settings: {
    title: string;
    language: string;
    languageDescription: string;
    theme: string;
    themeDescription: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    updates: string;
    updatesDescription: string;
    checkNow: string;
    version: string;
  };

  // Setup screen
  setup: {
    title: string;
    preparing: string;
    downloading: string;
    installing: string;
    completed: string;
    failed: string;
    retrySetup: string;
    checkingDependencies: string;
    downloadingPyTorch: string;
    downloadingModels: string;
    installingDependencies: string;
    findingDependencies: string;
    initialSetup: string;
    initialSetupDescription: string;
    oneTimeSetup: string;
    willDownload: string;
    ffmpegConverter: string;
    ttsEnginesNote: string;
    ffmpegInstallSuccess: string;
    installingFFmpeg: string;
    installationError: string;
    checkInternetAndRetry: string;
  };

  // TTS Providers
  providers: {
    selectProvider: string;
    silero: {
      name: string;
      description: string;
      setupRequired: string;
      waitMinutes: string;
      forSileroWork: string;
      pythonEmbedded: string;
      pytorchCuda: string;
      pytorchCpu: string;
      dependencies: string;
      modelsOnFirstUse: string;
      russianModel: string;
      englishModel: string;
      initialDownload: string;
      fasterOnGpu: string;
    };
    coqui: {
      name: string;
      description: string;
      setupRequired: string;
      waitMinutes: string;
      forCoquiWork: string;
      buildTools: string;
      coquiLibrary: string;
      xttsModel: string;
      totalDownload: string;
      includesBuildTools: string;
      slowGeneration: string;
      multilingualNeural: string;
    };
    piper: {
      name: string;
      description: string;
      setupRequired: string;
      forPiperWork: string;
      voicesSeparately: string;
      initialDownload: string;
    };
    rhvoice: {
      name: string;
      description: string;
      setupRequired: string;
      forRHVoiceWork: string;
      voicePacksSeparately: string;
    };
    elevenlabs: {
      name: string;
      description: string;
      apiKeyLabel: string;
      apiKeyPlaceholder: string;
      getApiKey: string;
    };
  };

  // GPU & Acceleration
  gpu: {
    accelerationAvailable: string;
    accelerationEnabled: string;
    gpuDetected: string;
    cpuMode: string;
    cpuModeDescription: string;
    cudaMode: string;
    cudaModeDescription: string;
    xpuMode: string;
    xpuModeDescription: string;
    toolkitRequired: string;
    toolkitInstalled: string;
    sileroSpeedup: string;
    coquiSpeedup: string;
    downloadSize: string;
  };

  // Toolkit dialogs
  toolkit: {
    required: string;
    notInstalled: string;
    restartRequired: string;
    installSteps: string;
    afterInstall: string;
    downloadCuda: string;
    downloadOneApi: string;
    useCpu: string;
  };

  // Reinstall dialog
  reinstall: {
    title: string;
    cudaInstallation: string;
    cudaRequired: string;
    cudaNotInstalled: string;
    downloadWarning: string;
    installing: string;
    installSuccess: string;
  };

  // Errors
  errors: {
    setup: string;
    generation: string;
    api: string;
    network: string;
    access: string;
    disk: string;
    gpu: string;
    cudaToolkit: string;
    // Recovery suggestions
    tryReinstall: string;
    tryAgainOrChangeVoice: string;
    installToolkitOrUseCpu: string;
    checkInternet: string;
    runAsAdmin: string;
    freeDiskSpace: string;
    checkApiKey: string;
    failedToPlayPreview: string;
  };

  // File operations
  file: {
    dropZone: string;
    dropZoneHint: string;
    supportedFormats: string;
    selectFile: string;
    fileSelected: string;
    outputFolder: string;
    selectOutputFolder: string;
    chapters: string;
  };

  // Conversion
  conversion: {
    start: string;
    starting: string;
    converting: string;
    paused: string;
    completed: string;
    failed: string;
    cancel: string;
    resume: string;
    pause: string;
    progress: string;
    chapter: string;
    timeRemaining: string;
    retrying: string;
    loadModelToConvert: string;
    convertToMp3: string;
    cancelled: string;
    audioSaved: string;
    openFolder: string;
  };

  // Voice selector
  voice: {
    selectVoice: string;
    preview: string;
    previewText: string;
    language: string;
    gender: string;
    male: string;
    female: string;
    quality: string;
    speed: string;
    selectLanguage: string;
    setupRequired: string;
    loadModelFirst: string;
    loadingVoices: string;
    noVoices: string;
    stopPreview: string;
    previewVoice: string;
    playbackSettings: string;
  };

  // Playback settings
  playback: {
    title: string;
    rate: string;
    pitch: string;
    volume: string;
    autoEnabled: string;
    splitByChapters: string;
    normalizeAudio: string;
    pitchVeryLow: string;
    pitchLow: string;
    pitchNormal: string;
    pitchHigh: string;
    pitchVeryHigh: string;
    timeStretch: string;
    timeStretchDescription: string;
    autoYo: string;
    autoStress: string;
    numbersToWords: string;
    sentencePause: string;
    previewTextLabel: string;
    ruaccent: string;
    ruaccentDescription: string;
  };

  // Updates
  updates: {
    available: string;
    downloading: string;
    readyToInstall: string;
    installNow: string;
    installLater: string;
    upToDate: string;
    checkFailed: string;
    newVersion: string;
    currentVersion: string;
    releaseNotes: string;
    noUpdates: string;
    versionAvailable: string;
    latestVersion: string;
    fullChangelog: string;
    downloadAndInstall: string;
  };

  // Languages (for TTS voice selection)
  languages: {
    'ru-RU': string;
    'en-US': string;
    'en-GB': string;
    'de-DE': string;
    'fr-FR': string;
    'es-ES': string;
    'it-IT': string;
    'pt-BR': string;
    'pl-PL': string;
    'uk-UA': string;
    'zh-CN': string;
    'ja-JP': string;
    'ko-KR': string;
  };

  // UI Languages (for settings dropdown)
  uiLanguages: {
    russian: string;
    english: string;
  };

  // FSM states
  fsm: {
    preparing: string;
    startingSetup: string;
    startingConversion: string;
    retryingConversion: string;
    switchingToCpu: string;
  };

  // TTS Model Panel
  ttsPanel: {
    loadModelsForGeneration: string;
    neuralVoices: string;
    russianModel: string;
    englishModel: string;
    bothModelsLoaded: string;
    russianModelLoaded: string;
    englishModelLoaded: string;
    clickToLoadModel: string;
    loadModelForLanguage: string;
    modelLoadedReady: string;
    clickToLoad: string;
    loadModelToEnable: string;
  };

  // Installation warnings
  installation: {
    inProgress: string;
    doNotClose: string;
  };

  // Voice Cloning
  voiceCloning: {
    toggle: string;
    addVoice: string;
    editVoice: string;
    voiceName: string;
    voiceNamePlaceholder: string;
    selectFile: string;
    dropFile: string;
    requirements: string;
    formats: string;
    maxSize: string;
    duration: string;
    validating: string;
    valid: string;
    invalidDuration: string;
    invalidFormat: string;
    fileTooLarge: string;
    replaceAudio: string;
    deleteVoice: string;
    deleteConfirm: string;
    noVoices: string;
    errorAdding: string;
    errorUpdating: string;
    errorDeleting: string;
  };
}

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}
