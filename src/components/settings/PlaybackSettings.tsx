import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/i18n'

interface PlaybackSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  speed: number[]
  onSpeedChange: (value: number[]) => void
  pitch: number[]
  onPitchChange: (value: number[]) => void
  timeStretch: number[]
  onTimeStretchChange: (value: number[]) => void
  sentencePause: number[]
  onSentencePauseChange: (value: number[]) => void
  ruaccentEnabled: boolean
  onRuaccentChange: (enabled: boolean) => void
  previewText: string
  onPreviewTextChange: (text: string) => void
  selectedProvider: string
  isConverting: boolean
  isPreviewing: boolean
  trigger: React.ReactNode
}

export function PlaybackSettings({
  open,
  onOpenChange,
  speed,
  onSpeedChange,
  pitch,
  onPitchChange,
  timeStretch,
  onTimeStretchChange,
  sentencePause,
  onSentencePauseChange,
  ruaccentEnabled,
  onRuaccentChange,
  previewText,
  onPreviewTextChange,
  selectedProvider,
  isConverting,
  isPreviewing,
  trigger,
}: PlaybackSettingsProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <PlaybackSettingsContent
          speed={speed}
          onSpeedChange={onSpeedChange}
          pitch={pitch}
          onPitchChange={onPitchChange}
          timeStretch={timeStretch}
          onTimeStretchChange={onTimeStretchChange}
          sentencePause={sentencePause}
          onSentencePauseChange={onSentencePauseChange}
          ruaccentEnabled={ruaccentEnabled}
          onRuaccentChange={onRuaccentChange}
          previewText={previewText}
          onPreviewTextChange={onPreviewTextChange}
          selectedProvider={selectedProvider}
          isConverting={isConverting}
          isPreviewing={isPreviewing}
        />
      </PopoverContent>
    </Popover>
  )
}

interface PlaybackSettingsContentProps {
  speed: number[]
  onSpeedChange: (value: number[]) => void
  pitch: number[]
  onPitchChange: (value: number[]) => void
  timeStretch: number[]
  onTimeStretchChange: (value: number[]) => void
  sentencePause: number[]
  onSentencePauseChange: (value: number[]) => void
  ruaccentEnabled: boolean
  onRuaccentChange: (enabled: boolean) => void
  previewText: string
  onPreviewTextChange: (text: string) => void
  selectedProvider: string
  isConverting: boolean
  isPreviewing: boolean
}

export function PlaybackSettingsContent({
  speed,
  onSpeedChange,
  pitch,
  onPitchChange,
  timeStretch,
  onTimeStretchChange,
  sentencePause,
  onSentencePauseChange,
  ruaccentEnabled,
  onRuaccentChange,
  previewText,
  onPreviewTextChange,
  selectedProvider,
  isConverting,
  isPreviewing,
}: PlaybackSettingsContentProps) {
  const { t } = useI18n()

  const getPitchLabel = (value: number) => {
    if (value <= 0.6) return t.playback.pitchVeryLow
    if (value <= 0.8) return t.playback.pitchLow
    if (value <= 1.2) return t.playback.pitchNormal
    if (value <= 1.5) return t.playback.pitchHigh
    return t.playback.pitchVeryHigh
  }

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-sm">{t.playback.title}</h4>

      {/* Speed Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{t.playback.rate}</Label>
          <span className="text-xs text-muted-foreground">{speed[0].toFixed(1)}x</span>
        </div>
        <Slider
          value={speed}
          onValueChange={onSpeedChange}
          min={0.5}
          max={2.0}
          step={0.1}
          disabled={isConverting}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>0.5x</span>
          <span>1.0x</span>
          <span>1.5x</span>
          <span>2.0x</span>
        </div>
      </div>

      {/* Pitch Control (Silero only) */}
      {selectedProvider === 'silero' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t.playback.pitch}</Label>
            <span className="text-xs text-muted-foreground">
              {getPitchLabel(pitch[0])}
            </span>
          </div>
          <Slider
            value={pitch}
            onValueChange={onPitchChange}
            min={0.5}
            max={2.0}
            step={0.1}
            disabled={isConverting}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>{t.playback.pitchLow}</span>
            <span>{t.playback.pitchNormal}</span>
            <span>{t.playback.pitchHigh}</span>
          </div>
        </div>
      )}

      {/* Time Stretch Control (Silero only) */}
      {selectedProvider === 'silero' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t.playback.timeStretch}</Label>
            <span className="text-xs text-muted-foreground">
              {timeStretch[0].toFixed(1)}x
            </span>
          </div>
          <Slider
            value={timeStretch}
            onValueChange={onTimeStretchChange}
            min={0.5}
            max={2.0}
            step={0.1}
            disabled={isConverting}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>1.5x</span>
            <span>2.0x</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t.playback.timeStretchDescription}
          </p>
        </div>
      )}

      {/* Sentence Pause (Piper only) */}
      {selectedProvider === 'piper' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t.playback.sentencePause}</Label>
            <span className="text-xs text-muted-foreground">
              {sentencePause[0].toFixed(1)}s
            </span>
          </div>
          <Slider
            value={sentencePause}
            onValueChange={onSentencePauseChange}
            min={0}
            max={2.0}
            step={0.1}
            disabled={isConverting}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>0s</span>
            <span>0.5s</span>
            <span>1.0s</span>
            <span>1.5s</span>
            <span>2.0s</span>
          </div>
        </div>
      )}

      {/* Russian Stress Marks (Silero only) */}
      {selectedProvider === 'silero' && (
        <div className="flex items-center justify-between py-2">
          <div className="space-y-0.5">
            <Label className="text-sm">{t.playback.ruaccent}</Label>
            <p className="text-[10px] text-muted-foreground">
              {t.playback.ruaccentDescription}
            </p>
          </div>
          <Switch
            checked={ruaccentEnabled}
            onCheckedChange={onRuaccentChange}
            disabled={isConverting || isPreviewing}
          />
        </div>
      )}

      {/* Preview Text */}
      <PreviewTextEditor
        previewText={previewText}
        onPreviewTextChange={onPreviewTextChange}
        isConverting={isConverting}
        isPreviewing={isPreviewing}
      />
    </div>
  )
}

interface PreviewTextEditorProps {
  previewText: string
  onPreviewTextChange: (text: string) => void
  isConverting: boolean
  isPreviewing: boolean
}

function PreviewTextEditor({
  previewText,
  onPreviewTextChange,
  isConverting,
  isPreviewing,
}: PreviewTextEditorProps) {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [tempText, setTempText] = useState('')

  const startEditing = () => {
    setTempText(previewText)
    setIsEditing(true)
  }

  const save = () => {
    if (tempText.trim()) {
      onPreviewTextChange(tempText.trim())
    }
    setIsEditing(false)
  }

  const cancel = () => {
    setIsEditing(false)
    setTempText('')
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">{t.playback.previewTextLabel}</Label>
      <div
        className={`relative text-xs italic border rounded-md transition-colors py-2 px-2 ${
          isEditing
            ? 'border-ring bg-background'
            : 'bg-muted/30 text-muted-foreground'
        }`}
      >
        {!isEditing ? (
          <span className="block pr-8">{previewText}</span>
        ) : (
          <textarea
            value={tempText}
            onChange={(e) => setTempText(e.target.value.slice(0, 500))}
            maxLength={500}
            className="w-full pr-8 text-xs italic bg-transparent resize-none focus:outline-none text-foreground leading-[inherit] p-0 m-0 block"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            rows={1}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              }
              if (e.key === 'Escape') {
                cancel()
              }
            }}
          />
        )}
        <div className="absolute top-1 right-1 flex gap-0.5">
          {!isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-foreground hover:text-foreground hover:bg-transparent"
              onClick={startEditing}
              disabled={isConverting || isPreviewing}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                onClick={cancel}
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                onClick={save}
              >
                <Check className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
