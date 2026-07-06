import { Volume2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/i18n'

interface ConversionProgressProps {
  progress: number
  status: string
  onCancel?: () => void
}

export function ConversionProgress({ progress, status, onCancel }: ConversionProgressProps) {
  const { t } = useI18n()
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm font-medium">{t.conversion.converting}</span>
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{status.includes(' | ') ? status.split(' | ')[0] : ''}</span>
          <div className="flex items-center gap-3">
            <span>{status.split(' | ')[1] || status}</span>
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 text-red-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>{t.common.cancel}</span>
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
