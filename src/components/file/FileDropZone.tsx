import { useCallback, useState } from 'react'
import { Book, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { BookContent, FileInfo } from '@/types'
import { formatFileSize } from '@/utils'
import { useI18n } from '@/i18n'

interface FileDropZoneProps {
  file: FileInfo | null
  bookContent: BookContent | null
  isConverting: boolean
  onFileSelect: () => void
  onFileDrop: (filePath: string) => void
  onClear: () => void
}

export function FileDropZone({
  file,
  bookContent,
  isConverting,
  onFileSelect,
  onFileDrop,
  onClear,
}: FileDropZoneProps) {
  const { t } = useI18n()
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        const filePath = (files[0] as File & { path?: string }).path
        if (filePath) {
          onFileDrop(filePath)
        }
      }
    },
    [onFileDrop]
  )

  return (
    <Card>
      <CardContent className="p-6">
        {!file ? (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
              ${isDragging ? 'border-primary bg-accent' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            onClick={onFileSelect}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">
              {t.file.dropZone}
            </p>
            <p className="text-sm text-muted-foreground">
              {t.file.supportedFormats}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Book className="h-12 w-12 text-primary flex-shrink-0" />
            <div className="flex-grow min-w-0">
              <h3 className="font-medium text-lg truncate">
                {bookContent?.title || file.name}
              </h3>
              {bookContent?.author && (
                <p className="text-base text-muted-foreground truncate">
                  {bookContent.author}
                </p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <span className="uppercase">{file.extension}</span>
                <span>•</span>
                <span>{formatFileSize(file.size)}</span>
                {bookContent && (
                  <>
                    <span>•</span>
                    <span>{bookContent.chapters.length} {t.file.chapters}</span>
                  </>
                )}
              </div>
            </div>
            <Button
              variant="ghost-icon"
              size="icon"
              className="h-10 w-10"
              onClick={onClear}
              disabled={isConverting}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
