import { Cpu, Zap, Circle, CheckCircle, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TTSServerStatus, AcceleratorConfig, AcceleratorInfo } from '@/types'
import { useI18n } from '@/i18n'

interface TTSModelPanelProps {
  provider: 'silero' | 'coqui'
  serverStatus: TTSServerStatus | null
  accelerator: AcceleratorConfig | null
  availableAccelerators: AcceleratorInfo | null
  isLoadingModel: string | null
  modelLoadProgress: number
  isAnyInstalling: boolean
  isReinstalling: boolean
  gpuPopoverOpen: boolean
  onGpuPopoverChange: (open: boolean) => void
  onLoadModel: (engine: 'silero' | 'coqui', language?: string) => void
  onUnloadModel: (engine: 'silero' | 'coqui' | 'all', language?: string) => void
  onShowReinstallConfirm: (engine: 'silero' | 'coqui', accelerator: 'cuda' | 'directml') => void
}

export function TTSModelPanel({
  provider,
  serverStatus,
  accelerator,
  availableAccelerators,
  isLoadingModel,
  modelLoadProgress,
  isAnyInstalling,
  isReinstalling,
  gpuPopoverOpen,
  onGpuPopoverChange,
  onLoadModel,
  onUnloadModel,
  onShowReinstallConfirm,
}: TTSModelPanelProps) {
  const { t } = useI18n()
  const isDisabled = isLoadingModel !== null || isAnyInstalling || isReinstalling

  const canUpgradeToCuda =
    (accelerator?.accelerator === 'cpu' || !accelerator) &&
    (availableAccelerators?.cuda.available || availableAccelerators?.cuda.name)
  const canUpgradeToDirectMl =
    provider === 'coqui' &&
    (accelerator?.accelerator === 'cpu' || !accelerator) &&
    Boolean(availableAccelerators?.directml.available || availableAccelerators?.directml.name)
  const canUpgradeToGpu = canUpgradeToCuda || canUpgradeToDirectMl

  if (provider === 'silero') {
    return (
      <div className="space-y-3 p-3 border rounded-md bg-gradient-to-b from-muted/40 to-muted/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" />
          <span>{t.ttsPanel.loadModelsForGeneration}</span>
        </div>

        <div className="p-3 rounded-lg border bg-background/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm">Silero TTS</div>
              <span className="text-xs text-muted-foreground">{t.ttsPanel.neuralVoices}</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded cursor-default ${
                  accelerator?.accelerator === 'cuda' || accelerator?.accelerator === 'directml'
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                    : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                <Cpu className="h-3 w-3" />
                {(accelerator?.accelerator || 'cpu').toUpperCase()}
              </div>
              {canUpgradeToGpu && (
                <Popover open={gpuPopoverOpen} onOpenChange={onGpuPopoverChange}>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1 px-1.5 py-1 text-xs rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      title={t.gpu.accelerationAvailable}
                    >
                      <Zap className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="end">
                    <div className="text-xs font-medium mb-2">{t.gpu.accelerationEnabled}</div>
                    <div className="text-[11px] text-muted-foreground mb-3">
                      {t.gpu.sileroSpeedup}
                    </div>
                    <button
                      className="w-full flex items-center gap-2 text-xs p-2 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left cursor-pointer"
                      onClick={() => {
                        onGpuPopoverChange(false)
                        onShowReinstallConfirm('silero', 'cuda')
                      }}
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <div className="flex-1">
                        <div className="font-medium">NVIDIA CUDA</div>
                        <div className="text-[10px] text-muted-foreground">
                          {availableAccelerators?.cuda.name} · ~2.5 GB
                        </div>
                      </div>
                    </button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ModelChip
              label={t.ttsPanel.russianModel}
              isLoaded={serverStatus?.silero.ru_loaded === true}
              isLoading={isLoadingModel === 'silero-ru'}
              disabled={isDisabled}
              onClick={() =>
                serverStatus?.silero.ru_loaded
                  ? onUnloadModel('silero', 'ru')
                  : onLoadModel('silero', 'ru')
              }
            />
            <ModelChip
              label={t.ttsPanel.englishModel}
              isLoaded={serverStatus?.silero.en_loaded === true}
              isLoading={isLoadingModel === 'silero-en'}
              disabled={isDisabled}
              onClick={() =>
                serverStatus?.silero.en_loaded
                  ? onUnloadModel('silero', 'en')
                  : onLoadModel('silero', 'en')
              }
            />
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            {serverStatus?.silero.ru_loaded && serverStatus?.silero.en_loaded
              ? t.ttsPanel.bothModelsLoaded
              : serverStatus?.silero.ru_loaded
                ? t.ttsPanel.russianModelLoaded
                : serverStatus?.silero.en_loaded
                  ? t.ttsPanel.englishModelLoaded
                  : t.ttsPanel.clickToLoadModel}
          </div>
        </div>

        {serverStatus?.running && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span className="font-mono">RAM: {serverStatus.memory_gb.toFixed(2)} GB</span>
          </div>
        )}

        {(!serverStatus?.running ||
          (!serverStatus?.silero.ru_loaded && !serverStatus?.silero.en_loaded)) && (
          <p className="text-xs text-muted-foreground text-center py-1">
            {t.ttsPanel.loadModelForLanguage}
          </p>
        )}
      </div>
    )
  }

  // Coqui panel
  return (
    <div className="space-y-3 p-3 border rounded-md bg-gradient-to-b from-muted/40 to-muted/20">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Cpu className="h-3.5 w-3.5" />
        <span>{t.ttsPanel.loadModelsForGeneration}</span>
      </div>

      <div className="p-3 rounded-lg border bg-background/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="font-medium text-sm">Coqui XTTS-v2</div>
            <span className="text-xs text-muted-foreground">{t.providers.coqui.multilingualNeural}</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded ${
                accelerator?.accelerator === 'cuda' || accelerator?.accelerator === 'directml'
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              <Cpu className="h-3 w-3" />
              {(accelerator?.accelerator || 'cpu').toUpperCase()}
            </div>
            {canUpgradeToGpu && (
              <Popover open={gpuPopoverOpen} onOpenChange={onGpuPopoverChange}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1 px-1.5 py-1 text-xs rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    title={t.gpu.accelerationAvailable}
                  >
                    <Zap className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="end">
                  <div className="text-xs font-medium mb-2">{t.gpu.accelerationEnabled}</div>
                  <div className="text-[11px] text-muted-foreground mb-3">
                    {t.gpu.coquiSpeedup}
                  </div>
                  <div className="space-y-2">
                    {canUpgradeToDirectMl && (
                      <button
                        className="w-full flex items-center gap-2 text-xs p-2 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left cursor-pointer"
                        onClick={() => {
                          onGpuPopoverChange(false)
                          onShowReinstallConfirm('coqui', 'directml')
                        }}
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <div className="flex-1">
                          <div className="font-medium">AMD DirectML</div>
                          <div className="text-[10px] text-muted-foreground">
                            {availableAccelerators?.directml.name} · ~2.7 GB
                          </div>
                        </div>
                      </button>
                    )}
                    {canUpgradeToCuda && (
                      <button
                        className="w-full flex items-center gap-2 text-xs p-2 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left cursor-pointer"
                        onClick={() => {
                          onGpuPopoverChange(false)
                          onShowReinstallConfirm('coqui', 'cuda')
                        }}
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <div className="flex-1">
                          <div className="font-medium">NVIDIA CUDA</div>
                          <div className="text-[10px] text-muted-foreground">
                            {availableAccelerators?.cuda.name} · ~4.5 GB
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ModelChip
            label="XTTS v2"
            isLoaded={serverStatus?.coqui.loaded === true}
            isLoading={isLoadingModel === 'coqui'}
            disabled={isDisabled}
            onClick={() =>
              serverStatus?.coqui.loaded ? onUnloadModel('coqui') : onLoadModel('coqui')
            }
          />
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {serverStatus?.coqui.loaded
            ? t.ttsPanel.modelLoadedReady
            : t.ttsPanel.clickToLoad}
        </div>
      </div>

      {serverStatus?.running && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span className="font-mono">RAM: {serverStatus.memory_gb.toFixed(2)} GB</span>
        </div>
      )}

      {(!serverStatus?.running || !serverStatus?.coqui.loaded) && (
        <p className="text-xs text-muted-foreground text-center py-1">
          {t.ttsPanel.loadModelToEnable}
        </p>
      )}
    </div>
  )
}

interface ModelChipProps {
  label: string
  isLoaded: boolean
  isLoading: boolean
  disabled: boolean
  onClick: () => void
}

function ModelChip({
  label,
  isLoaded,
  isLoading,
  disabled,
  onClick,
}: ModelChipProps) {
  return (
    <button
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
        isLoaded
          ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
          : 'bg-muted/50 border-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : isLoaded ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span>{label}</span>
    </button>
  )
}
