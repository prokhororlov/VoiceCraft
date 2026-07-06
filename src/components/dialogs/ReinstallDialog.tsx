import { Zap, AlertTriangle, X, RefreshCw, ExternalLink, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { AcceleratorInfo, ReinstallProgress } from '@/types'
import { useI18n } from '@/i18n'

interface ReinstallConfirmDialogProps {
  engine: 'silero' | 'coqui'
  accelerator: 'cuda' | 'directml'
  availableAccelerators: AcceleratorInfo | null
  isCheckingToolkit: boolean
  onConfirm: () => void
  onCancel: () => void
  onRefreshAccelerators: () => void
  onOpenExternal: (url: string) => void
}

export function ReinstallConfirmDialog({
  engine,
  accelerator,
  availableAccelerators,
  isCheckingToolkit,
  onConfirm,
  onCancel,
  onRefreshAccelerators,
  onOpenExternal,
}: ReinstallConfirmDialogProps) {
  const { t } = useI18n()
  const isDirectMl = accelerator === 'directml'
  const isToolkitMissing = accelerator === 'cuda' && availableAccelerators?.cuda.toolkitMissing
  const title = isDirectMl ? 'AMD DirectML Installation' : t.reinstall.cudaInstallation
  const description = isDirectMl
    ? `AMD GPU: ${availableAccelerators?.directml.name || 'DirectML'}`
    : t.reinstall.cudaRequired

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>
            {engine === 'silero' ? 'Silero TTS' : 'Coqui XTTS-v2'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              {description}
            </p>

            {isToolkitMissing && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs flex-1">
                  <p className="font-medium">{t.reinstall.cudaNotInstalled}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      onClick={() =>
                        onOpenExternal(availableAccelerators!.cuda.toolkitUrl!)
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.common.download}
                    </button>
                    <span className="text-muted-foreground">•</span>
                    <button
                      className="text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={onRefreshAccelerators}
                      disabled={isCheckingToolkit}
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isCheckingToolkit ? 'animate-spin' : ''}`}
                      />
                      {t.common.check}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isToolkitMissing && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-medium">{t.common.warning}</p>
                  <p className="mt-0.5">
                    {t.reinstall.downloadWarning}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              {t.common.cancel}
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={isToolkitMissing}
              onClick={onConfirm}
            >
              <Zap className="h-4 w-4" />
              {t.common.install}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ReinstallProgressDialogProps {
  engine: 'silero' | 'coqui'
  progress: ReinstallProgress | null
  onClose: () => void
}

export function ReinstallProgressDialog({
  engine,
  progress,
  onClose,
}: ReinstallProgressDialogProps) {
  const { t } = useI18n()
  const isComplete = progress?.stage === 'complete'
  const isError = progress?.stage === 'error'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {isComplete ? (
              <CheckCircle className="h-5 w-5 text-primary" />
            ) : isError ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {t.reinstall.title} {engine === 'silero' ? 'Silero' : 'Coqui'}
          </CardTitle>
          {!isComplete && !isError && (
            <CardDescription>{t.reinstall.downloadWarning.split('.')[0]}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {progress && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">
                    {progress.stage === 'installing' && t.reinstall.installing}
                    {progress.stage === 'complete' && t.common.success}
                    {progress.stage === 'error' && t.common.error}
                  </span>
                  {progress.progress !== undefined && (
                    <span className="text-muted-foreground">{progress.progress}%</span>
                  )}
                </div>
                {progress.progress !== undefined && (
                  <Progress value={progress.progress} className="h-2" />
                )}
                <p className="text-xs text-muted-foreground">{progress.message}</p>
              </div>
              {isError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium">{t.errors.setup}</p>
                    <p className="mt-0.5 select-text">{progress.message}</p>
                  </div>
                </div>
              )}
              {isComplete && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/30 text-primary">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-xs font-medium">{t.reinstall.installSuccess}</p>
                </div>
              )}
              {(isComplete || isError) && (
                <Button className="w-full" onClick={onClose}>
                  {t.common.close}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
