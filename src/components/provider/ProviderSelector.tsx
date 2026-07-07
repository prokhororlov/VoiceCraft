import type { ProviderInfo, VoiceInfo } from '@/types'
import { useI18n } from '@/i18n'

interface ProviderSelectorProps {
  providers: ProviderInfo[]
  selectedProvider: string
  voices: VoiceInfo[]
  disabled: boolean
  onSelect: (providerId: string) => void
}

export function ProviderSelector({
  providers,
  selectedProvider,
  voices,
  disabled,
  onSelect,
}: ProviderSelectorProps) {
  const { t } = useI18n()

  const getProviderDescription = (providerId: string): string => {
    switch (providerId) {
      case 'silero':
        return t.providers.silero.description
      case 'coqui':
        return t.providers.coqui.description
      case 'bark':
        return t.providers.bark.description
      case 'piper':
        return t.providers.piper.description
      case 'rhvoice':
        return t.providers.rhvoice.description
      case 'elevenlabs':
        return t.providers.elevenlabs.description
      default:
        return ''
    }
  }

  const getProviderAvailability = (providerId: string) => {
    if (providerId === 'silero' || providerId === 'coqui' || providerId === 'bark') {
      return true
    }
    return voices.some((v) => v.provider === providerId)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 lg:flex-nowrap">
        {providers.map((provider) => {
          const isAvailable = getProviderAvailability(provider.id)
          const isSelected = selectedProvider === provider.id
          return (
            <button
              key={provider.id}
              onClick={() => isAvailable && !disabled && onSelect(provider.id)}
              disabled={!isAvailable || disabled}
              className={`flex flex-col items-center gap-1 border rounded-lg p-3 transition-colors flex-1 min-w-[calc(50%-4px)] sm:min-w-0 ${
                isSelected ? 'border-primary bg-accent' : 'border-border'
              } ${
                isAvailable && !disabled
                  ? 'hover:bg-accent cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              {provider.icon}
              <span className="text-xs font-medium">{provider.name}</span>
            </button>
          )
        })}
      </div>
      {selectedProvider && (
        <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md border border-border/50 leading-relaxed mt-1">
          {getProviderDescription(selectedProvider)}
        </div>
      )}
    </div>
  )
}
