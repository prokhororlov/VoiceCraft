import { Sparkles, Download, Cpu, Zap, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AcceleratorInfo } from '@/types'
import { useI18n } from '@/i18n'

interface SileroSetupProps {
  isInstalling: boolean
  installProgress: string
  installPercent: number
  pythonAvailable: boolean
  availableAccelerators: AcceleratorInfo | null
  selectedAccelerator: 'cpu' | 'cuda'
  onAcceleratorChange: (accelerator: 'cpu' | 'cuda') => void
  onInstall: () => void
  onRefreshAccelerators: () => void
  onOpenExternal: (url: string) => void
}

export function SileroSetup({
  isInstalling,
  installProgress,
  installPercent,
  pythonAvailable,
  availableAccelerators,
  selectedAccelerator,
  onAcceleratorChange,
  onInstall,
  onRefreshAccelerators,
  onOpenExternal,
}: SileroSetupProps) {
  const { t } = useI18n()
  const isCudaDisabled = selectedAccelerator === 'cuda' && availableAccelerators?.cuda.toolkitMissing

  return (
    <div className="space-y-3 p-4 border rounded-md bg-muted/50">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{t.providers.silero.setupRequired}</span>
      </div>
      {isInstalling ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {installProgress || t.setup.installing}
              </span>
              <span className="font-medium">{installPercent}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${installPercent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.providers.silero.waitMinutes}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>{t.providers.silero.forSileroWork}</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
              {!pythonAvailable && <li>{t.providers.silero.pythonEmbedded}</li>}
              <li>
                PyTorch {selectedAccelerator === 'cuda' ? 'CUDA' : 'CPU'} — ~
                {selectedAccelerator === 'cuda' ? '2.3 GB' : '150 MB'}
              </li>
              <li>{t.providers.silero.dependencies}</li>
              <li>ruaccent ({t.playback.ruaccent}) — ~300 MB</li>
            </ul>
          </div>

          {availableAccelerators?.cuda.name && (
            <div className="p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                <span>{t.gpu.gpuDetected}</span>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="sileroAccelerator"
                    checked={selectedAccelerator === 'cpu'}
                    onChange={() => onAcceleratorChange('cpu')}
                    className="text-primary"
                  />
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t.gpu.cpuMode} (~150 MB) — {t.gpu.cpuModeDescription}</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="sileroAccelerator"
                    checked={selectedAccelerator === 'cuda'}
                    onChange={() => onAcceleratorChange('cuda')}
                    className="text-primary"
                  />
                  <Zap className="h-3.5 w-3.5 text-green-500" />
                  <span>{t.gpu.cudaMode} (~2.3 GB) — {t.providers.silero.fasterOnGpu}</span>
                  <span className="text-muted-foreground">
                    ({availableAccelerators.cuda.name})
                  </span>
                </label>
              </div>
            </div>
          )}

          {isCudaDisabled && (
            <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{t.gpu.toolkitRequired}</span>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">
                    {availableAccelerators?.cuda.toolkitMessage}
                  </p>
                  <p>
                    {t.reinstall.cudaRequired}
                  </p>
                  {availableAccelerators?.cuda.toolkitUrl && (
                    <button
                      onClick={() =>
                        onOpenExternal(availableAccelerators.cuda.toolkitUrl!)
                      }
                      className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer text-xs"
                    >
                      {t.toolkit.downloadCuda}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] mt-2">
                  {t.toolkit.afterInstall}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshAccelerators}
                className="w-full text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {t.common.refresh}
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="font-medium">{t.providers.silero.modelsOnFirstUse}</span>
            </div>
            <ul className="list-disc list-inside ml-5 space-y-0.5">
              <li>{t.providers.silero.russianModel}</li>
              <li>{t.providers.silero.englishModel}</li>
            </ul>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t.providers.silero.initialDownload}: ~{selectedAccelerator === 'cuda' ? '2.8 GB' : '455 MB'}
            </span>
            <Button
              variant="default"
              size="sm"
              disabled={isCudaDisabled}
              onClick={onInstall}
            >
              <Download className="h-4 w-4 mr-2" />
              {t.common.install} Silero
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
