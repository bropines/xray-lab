import {
  CheckSquareOffsetIcon,
  DesktopIcon,
  GithubLogoIcon,
  InfoIcon,
  MoonIcon,
  SunIcon,
  TerminalWindowIcon,
  TranslateIcon,
  WarningIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { hrefOf, useLocation, type Route } from './app/router';
import { useTheme, type ThemePreference } from './app/theme';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Skeleton,
} from './components/ui';
import { ENGINE_KIND } from './engine';
import { LANGS, useLang, useT, type MessageKey } from './i18n';
import { cn } from './lib/cn';

const CheckPage = lazy(() => import('./pages/CheckPage'));
const TerminalPage = lazy(() => import('./pages/TerminalPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

const NAV: { route: Route; label: MessageKey; icon: ComponentType<{ className?: string; weight?: 'fill' | 'regular' }> }[] = [
  { route: 'check', label: 'nav.check', icon: CheckSquareOffsetIcon },
  { route: 'terminal', label: 'nav.terminal', icon: TerminalWindowIcon },
  { route: 'tools', label: 'nav.tools', icon: WrenchIcon },
  { route: 'about', label: 'nav.about', icon: InfoIcon },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path d="M9 10l6 6-6 6M17 22h7" fill="none" className="stroke-primary-foreground" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeMenu() {
  const t = useT();
  const preference = useTheme(s => s.preference);
  const resolved = useTheme(s => s.resolved);
  const setPreference = useTheme(s => s.setPreference);
  const Icon = preference === 'system' ? DesktopIcon : resolved === 'dark' ? MoonIcon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('shell.theme')} title={t('shell.theme')}>
          <Icon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={preference} onValueChange={v => setPreference(v as ThemePreference)}>
          <DropdownMenuRadioItem value="system">{t('shell.themeSystem')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t('shell.themeLight')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('shell.themeDark')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LangMenu() {
  const t = useT();
  const lang = useLang(s => s.lang);
  const setLang = useLang(s => s.setLang);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('shell.language')} title={t('shell.language')} className="gap-1.5 px-2">
          <TranslateIcon className="size-5" />
          <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={lang} onValueChange={v => setLang(v as typeof lang)}>
          {LANGS.map(l => (
            <DropdownMenuRadioItem key={l} value={l}>
              {l === 'en' ? 'English' : 'Русский'}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export default function App() {
  const t = useT();
  const { route } = useLocation();
  // The terminal stays mounted once opened: its scrollback, history and a
  // running command survive a visit to another page.
  const [terminalOpened, setTerminalOpened] = useState(route === 'terminal');
  if (route === 'terminal' && !terminalOpened) setTerminalOpened(true);

  useEffect(() => {
    const titles: Record<Route, MessageKey> = { check: 'nav.check', terminal: 'nav.terminal', tools: 'nav.tools', about: 'nav.about' };
    document.title = `${t(titles[route])} · Xray Lab`;
  }, [route, t]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t('shell.skip')}
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
          <a href={hrefOf('check')} className="mr-2 flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <Logo />
            <span className="tracking-tight">Xray Lab</span>
          </a>
          <nav aria-label={t('shell.nav')} className="hidden items-center gap-1 sm:flex">
            {NAV.map(item => (
              <a
                key={item.route}
                href={hrefOf(item.route)}
                aria-current={route === item.route ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                  route === item.route && 'bg-accent text-foreground',
                )}
              >
                <item.icon className="size-4" />
                {t(item.label)}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-0.5">
            <LangMenu />
            <ThemeMenu />
            <Button variant="ghost" size="icon" asChild>
              <a href="https://github.com/bropines/xray-lab" target="_blank" rel="noreferrer" aria-label={t('shell.source')} title={t('shell.source')}>
                <GithubLogoIcon className="size-5" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {ENGINE_KIND === 'fake' && (
        <div role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning">
          <WarningIcon className="mr-1.5 inline size-4 align-[-3px]" />
          {t('shell.fakeEngine')}
        </div>
      )}

      <main id="main" className="flex-1 pb-16 sm:pb-0">
        <Suspense fallback={<PageFallback />}>
          {route === 'check' && <CheckPage />}
          {route === 'tools' && <ToolsPage />}
          {route === 'about' && <AboutPage />}
          {terminalOpened && (
            <div hidden={route !== 'terminal'}>
              <TerminalPage />
            </div>
          )}
        </Suspense>
      </main>

      <nav aria-label={t('shell.nav')} className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="grid h-16 grid-cols-4">
          {NAV.map(item => {
            const active = route === item.route;
            return (
              <li key={item.route}>
                <a
                  href={hrefOf(item.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:bg-accent',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <item.icon className="size-6" weight={active ? 'fill' : 'regular'} />
                  {t(item.label)}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
