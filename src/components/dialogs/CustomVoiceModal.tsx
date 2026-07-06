import { useState, useEffect, useCallback } from 'react'
import { X, Upload, Loader2, Check, AlertCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n'

export interface CustomVoiceMetadata {
  id: string
  name: string
  fileName: string
  originalFileName: string
  duration: number
  createdAt: string
  updatedAt: string
}

interface CustomVoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onVoiceSaved: (voice: CustomVoiceMetadata) => void
  onVoiceDeleted?: (voiceId: string) => void
  editingVoice?: CustomVoiceMetadata | null
}

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

export function CustomVoiceModal({
  isOpen,
  onClose,
  onVoiceSaved,
  onVoiceDeleted,
  editingVoice
}: CustomVoiceModalProps) {
  const { t } = useI18n()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string>('')
  const [voiceName, setVoiceName] = useState('')
  const [validationState, setValidationState] = useState<ValidationState>('idle')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const isEditMode = !!editingVoice

  // Reset state when modal opens/closes or editingVoice changes
  useEffect(() => {
    if (isOpen) {
      if (editingVoice) {
        setVoiceName(editingVoice.name)
        setSelectedFile(null)
        setSelectedFileName(editingVoice.originalFileName)
        setAudioDuration(editingVoice.duration)
        setValidationState('idle')
      } else {
        setVoiceName('')
        setSelectedFile(null)
        setSelectedFileName('')
        setAudioDuration(null)
        setValidationState('idle')
      }
      setValidationError(null)
      setShowDeleteConfirm(false)
    }
  }, [isOpen, editingVoice])

  const validateFile = async (filePath: string) => {
    if (!window.electronAPI) return

    setValidationState('validating')
    setValidationError(null)

    try {
      const result = await window.electronAPI.validateAudioFile(filePath)

      if (result.valid) {
        setValidationState('valid')
        setAudioDuration(result.duration || null)
      } else {
        setValidationState('invalid')
        // Use translation key if available
        const errorKey = result.error as keyof typeof t.voiceCloning
        const errorMessage = t.voiceCloning[errorKey] || result.error || 'Unknown error'
        setValidationError(errorMessage)
      }
    } catch (error) {
      setValidationState('invalid')
      setValidationError((error as Error).message)
    }
  }

  const handleSelectFile = async () => {
    if (!window.electronAPI) return

    const filePath = await window.electronAPI.openAudioFileDialog()
    if (filePath) {
      setSelectedFile(filePath)
      setSelectedFileName(filePath.split(/[\\/]/).pop() || '')
      await validateFile(filePath)

      // Auto-fill voice name from filename if empty
      if (!voiceName) {
        const nameWithoutExt = (filePath.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '')
        setVoiceName(nameWithoutExt)
      }
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0] as File & { path?: string }
      if (file.path) {
        setSelectedFile(file.path)
        setSelectedFileName(file.name)
        await validateFile(file.path)

        // Auto-fill voice name from filename if empty
        if (!voiceName) {
          const nameWithoutExt = file.name.replace(/\.[^.]+$/, '')
          setVoiceName(nameWithoutExt)
        }
      }
    }
  }, [voiceName])

  const handleSubmit = async () => {
    if (!window.electronAPI) return
    if (!voiceName.trim()) return

    // In edit mode, file is optional (only if replacing)
    if (!isEditMode && !selectedFile) return
    if (!isEditMode && validationState !== 'valid') return

    setIsSubmitting(true)

    try {
      if (isEditMode && editingVoice) {
        // Update existing voice
        const updates: { name?: string; newFilePath?: string } = {}

        if (voiceName.trim() !== editingVoice.name) {
          updates.name = voiceName.trim()
        }

        if (selectedFile && validationState === 'valid') {
          updates.newFilePath = selectedFile
        }

        if (Object.keys(updates).length > 0) {
          const result = await window.electronAPI.updateCustomVoice(editingVoice.id, updates)
          if (!result.success) {
            setValidationError(result.error || t.voiceCloning.errorUpdating)
            return
          }
        }

        // Return updated voice metadata
        onVoiceSaved({
          ...editingVoice,
          name: voiceName.trim(),
          originalFileName: selectedFile ? selectedFileName : editingVoice.originalFileName,
          duration: audioDuration || editingVoice.duration,
          updatedAt: new Date().toISOString()
        })
      } else {
        // Add new voice
        const result = await window.electronAPI.addCustomVoice(selectedFile!, voiceName.trim())

        if (result.success && result.voice) {
          onVoiceSaved(result.voice)
        } else {
          setValidationError(result.error || t.voiceCloning.errorAdding)
          return
        }
      }

      onClose()
    } catch (error) {
      setValidationError((error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!window.electronAPI || !editingVoice || !onVoiceDeleted) return

    setIsSubmitting(true)

    try {
      const result = await window.electronAPI.deleteCustomVoice(editingVoice.id)

      if (result.success) {
        onVoiceDeleted(editingVoice.id)
        onClose()
      } else {
        setValidationError(result.error || t.voiceCloning.errorDeleting)
      }
    } catch (error) {
      setValidationError((error as Error).message)
    } finally {
      setIsSubmitting(false)
      setShowDeleteConfirm(false)
    }
  }

  const canSubmit = () => {
    if (!voiceName.trim()) return false
    if (isEditMode) {
      // In edit mode, allow submit if name changed or new file is valid
      const nameChanged = voiceName.trim() !== editingVoice?.name
      const hasValidNewFile = selectedFile && validationState === 'valid'
      return nameChanged || hasValidNewFile
    }
    return selectedFile && validationState === 'valid'
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md mx-4 shadow-xl">
        <Button
          variant="ghost-icon"
          size="icon"
          onClick={onClose}
          className="absolute right-3 top-3 h-10 w-10"
          disabled={isSubmitting}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">{t.common.close}</span>
        </Button>

        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {isEditMode ? t.voiceCloning.editVoice : t.voiceCloning.addVoice}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Voice Name Input */}
          <div className="space-y-2">
            <Label htmlFor="voice-name">{t.voiceCloning.voiceName}</Label>
            <input
              id="voice-name"
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder={t.voiceCloning.voiceNamePlaceholder}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
            />
          </div>

          {/* File Drop Zone */}
          <div className="space-y-2">
            <Label>{isEditMode ? t.voiceCloning.replaceAudio : t.voiceCloning.selectFile}</Label>
            <div
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
                ${isSubmitting ? 'opacity-50 pointer-events-none' : ''}
              `}
              onClick={handleSelectFile}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {validationState === 'validating' ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t.voiceCloning.validating}</span>
                </div>
              ) : selectedFile || (isEditMode && selectedFileName) ? (
                <div className="flex flex-col items-center gap-2">
                  {validationState === 'valid' ? (
                    <Check className="h-8 w-8 text-green-500" />
                  ) : validationState === 'invalid' ? (
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium truncate max-w-full px-2">
                    {selectedFileName}
                  </span>
                  {audioDuration && (
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(audioDuration)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t.voiceCloning.dropFile}</span>
                </div>
              )}
            </div>

            {/* Validation Error */}
            {validationError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {validationError}
              </p>
            )}
          </div>

          {/* Requirements */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium">{t.voiceCloning.requirements}:</p>
            <p>{t.voiceCloning.formats}</p>
            <p>{t.voiceCloning.maxSize}</p>
            <p>{t.voiceCloning.duration}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {isEditMode && onVoiceDeleted && (
              <>
                {showDeleteConfirm ? (
                  <div className="flex gap-2 flex-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isSubmitting}
                    >
                      {t.common.cancel}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleDelete}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t.common.confirm}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSubmitting}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}

            {!showDeleteConfirm && (
              <>
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className={isEditMode && onVoiceDeleted ? '' : 'flex-1'}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit() || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isEditMode ? (
                    t.common.save
                  ) : (
                    t.common.apply
                  )}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
