import { useState } from 'react';
import { Settings, Sun, Moon, Monitor, RefreshCw, Loader2, Globe, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n, Language } from '@/i18n';

type Theme = 'light' | 'dark' | 'system';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  isCheckingUpdate: boolean;
  hasUpdate: boolean;
  latestVersion?: string;
  onCheckUpdate: () => void;
  currentVersion: string;
}

export function SettingsDialog({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  isCheckingUpdate,
  hasUpdate,
  latestVersion,
  onCheckUpdate,
  currentVersion,
}: SettingsDialogProps) {
  const { language, setLanguage, t } = useI18n();

  if (!isOpen) return null;

  const effectiveTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md mx-4 shadow-xl">
        <Button
          variant="ghost-icon"
          size="icon"
          onClick={onClose}
          className="absolute right-3 top-3 h-10 w-10"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">{t.common.close}</span>
        </Button>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t.settings.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          {/* Language Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4" />
              {t.settings.language}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.languageDescription}
            </p>
            <Select value={language} onValueChange={(value) => handleLanguageChange(value as Language)}>
              <SelectTrigger className="w-full mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t.uiLanguages.english}</SelectItem>
                <SelectItem value="ru">{t.uiLanguages.russian}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Theme Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {effectiveTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {t.settings.theme}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.themeDescription}
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onThemeChange('light')}
              >
                <Sun className="h-4 w-4" />
                {t.settings.themeLight}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onThemeChange('dark')}
              >
                <Moon className="h-4 w-4" />
                {t.settings.themeDark}
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onThemeChange('system')}
              >
                <Monitor className="h-4 w-4" />
                {t.settings.themeSystem}
              </Button>
            </div>
          </div>

          {/* Updates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-4 w-4" />
              {t.settings.updates}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.updatesDescription}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {t.settings.version}: {currentVersion}
                {hasUpdate && latestVersion && (
                  <span className="ml-2 text-primary">
                    → {latestVersion}
                  </span>
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onCheckUpdate}
                disabled={isCheckingUpdate}
                className="gap-2"
              >
                {isCheckingUpdate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t.settings.checkNow}
              </Button>
            </div>
            {hasUpdate && (
              <p className="text-xs text-primary mt-1">
                {t.updates.available}: v{latestVersion}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
