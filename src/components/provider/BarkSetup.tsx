import { AudioWaveform, Download, Cpu, Zap, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AcceleratorInfo } from '@/types'
import { useI18n } from '@/i18n'

interface BarkSetupProps {
  isInstalling: boolean
  installProgress: string
  installPercent: number
  pythonAvailable: boolean
  availableAccelerators: AcceleratorInfo | null
  selectedAccelerator: 'cpu' | 'cuda' | 'directml'
  onAcceleratorChange: (accelerator: 'cpu' | 'cuda' | 'directml') => void
  onInstall: () => void
  onRefreshAccelerators: () => void
  onOpenExternal: (url: string) => void
}

export function BarkSetup({
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
}: BarkSetupProps) {
  const { t } = useI18n()
  const isCudaDisabled = selectedAccelerator === 'cuda' && availableAccelerators?.cuda.toolkitMissing
  const hasGpu = Boolean(availableAccelerators?.cuda.name || availableAccelerators?.directml.name)
  const selectedLabel = selectedAccelerator === 'cuda'
    ? 'CUDA'
    : selectedAccelerator === 'directml'
      ? 'DirectML'
      : 'CPU'
  const selectedTorchSize = selectedAccelerator === 'cuda'
    ? '2.3 GB'
    : selectedAccelerator === 'directml'
      ? '250 MB'
      : '200 MB'

  return (
    <div className="space-y-3 p-4 border rounded-md bg-muted/50">
      <div className="flex items-center gap-2">
        <AudioWaveform className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{t.providers.bark.setupRequired}</span>
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
            {t.providers.bark.waitMinutes}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{t.providers.bark.forBarkWork}</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
              {!pythonAvailable && <li>{t.providers.silero.pythonEmbedded}</li>}
              <li>PyTorch {selectedLabel} - ~{selectedTorchSize}</li>
              <li>{t.providers.bark.transformersLibrary}</li>
              <li>{t.providers.bark.barkModel}</li>
            </ul>
          </div>

          {hasGpu && (
            <div className="p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                <span>{t.gpu.gpuDetected}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.providers.bark.gpuNote}
              </p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="barkAccelerator"
                    checked={selectedAccelerator === 'cpu'}
                    onChange={() => onAcceleratorChange('cpu')}
                    className="text-primary"
                  />
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t.gpu.cpuMode} (~200 MB)</span>
                </label>
                {availableAccelerators?.directml.name && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="barkAccelerator"
                      checked={selectedAccelerator === 'directml'}
                      onChange={() => onAcceleratorChange('directml')}
                      className="text-primary"
                    />
                    <Zap className="h-3.5 w-3.5 text-green-500" />
                    <span>DirectML (~250 MB) - AMD Radeon</span>
                    <span className="text-muted-foreground">
                      ({availableAccelerators.directml.name})
                    </span>
                  </label>
                )}
                {availableAccelerators?.cuda.name && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="barkAccelerator"
                      checked={selectedAccelerator === 'cuda'}
                      onChange={() => onAcceleratorChange('cuda')}
                      className="text-primary"
                    />
                    <Zap className="h-3.5 w-3.5 text-green-500" />
                    <span>{t.gpu.cudaMode} (~2.3 GB)</span>
                    <span className="text-muted-foreground">
                      ({availableAccelerators.cuda.name})
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          {isCudaDisabled && (
            <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{t.gpu.toolkitRequired}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {availableAccelerators?.cuda.toolkitMessage}
              </p>
              {availableAccelerators?.cuda.toolkitUrl && (
                <button
                  onClick={() => onOpenExternal(availableAccelerators.cuda.toolkitUrl!)}
                  className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer text-xs"
                >
                  {t.toolkit.downloadCuda}
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
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

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t.providers.bark.initialDownload}: ~{selectedAccelerator === 'cuda' ? '6.8 GB' : '4.8 GB'}
            </span>
            <Button
              variant="default"
              size="sm"
              disabled={isCudaDisabled}
              onClick={onInstall}
            >
              <Download className="h-4 w-4 mr-2" />
              {t.common.install} Bark
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
