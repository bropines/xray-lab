import { ArrowSquareOutIcon, CpuIcon, HardDrivesIcon, LockSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { ENGINE_KIND, WASM_BASE_URL, engine, useEngine } from '../engine';
import { useLang, useT } from '../i18n';
import { formatBytes } from '../lib/format';

const LINKS = {
  site: 'https://github.com/bropines/xray-lab',
  library: 'https://github.com/bropines/xray-wasm',
  core: 'https://github.com/XTLS/Xray-core',
  schema: 'https://github.com/bropines/xray-schema',
  prior: 'https://github.com/mmmray/xray-online',
  xterm: 'https://xtermjs.org/',
  codemirror: 'https://codemirror.net/',
  shadcn: 'https://ui.shadcn.com/',
  phosphor: 'https://phosphoricons.com/',
  geist: 'https://vercel.com/font',
  geo: 'https://github.com/Loyalsoldier/v2ray-rules-dat',
};

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline">
      {children}
      <ArrowSquareOutIcon className="size-3.5" />
    </a>
  );
}

export default function AboutPage() {
  const t = useT();
  const lang = useLang(s => s.lang);
  const tags = useEngine(s => s.tags);
  const [cached, setCached] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let live = true;
    engine.cachedBytes().then(n => live && setCached(n), () => live && setCached(0));
    return () => {
      live = false;
    };
  }, [tags]);

  const cachedCount = Object.values(tags).filter(s => s.phase === 'cached' || s.phase === 'ready').length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('about.title')}</h1>
        <p className="text-muted-foreground">{t('about.lead')}</p>
      </header>

      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <LockSimpleIcon className="size-5 text-success" />
            {t('about.privacyTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-5 text-sm text-muted-foreground">
          <p>{t('about.privacy1')}</p>
          <p>{t('about.privacy2')}</p>
          <p>{t('about.privacy3')}</p>
        </CardContent>
      </Card>

      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <CpuIcon className="size-5 text-primary" />
            {t('about.howTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-5 text-sm text-muted-foreground">
          <p>{t('about.how1')}</p>
          <pre className="custom-scroll overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">{`XTLS/Xray-core (tag)  ──go build js/wasm──▶  xray-wasm release
                                               │  manifest.json, *.xray.wasm.gz
                                               ▼
   this page  ──fetch once, cache──▶  Web Worker: Go runtime + xray
      │                                        │
      └── config / CLI args, files in memory ──┘ → verdict, stdout, files`}</pre>
          <p>{t('about.how2')}</p>
          <p>{t('about.how3')}</p>
        </CardContent>
      </Card>

      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrivesIcon className="size-5 text-muted-foreground" />
            {t('about.storageTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <p className="text-muted-foreground">
            {cached === null ? '…' : t('about.storage', { n: cachedCount, size: formatBytes(cached, lang) })}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={clearing || !cached}
            onClick={async () => {
              setClearing(true);
              await engine.clearCache();
              setCached(await engine.cachedBytes());
              setClearing(false);
            }}
          >
            <TrashIcon />
            {t('about.clearCache')}
          </Button>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <dt>{t('about.engine')}</dt>
            <dd className="font-mono">{ENGINE_KIND === 'fake' ? t('about.engineFake') : 'xray-wasm'}</dd>
            <dt>{t('about.binaries')}</dt>
            <dd className="font-mono break-all">{new URL(WASM_BASE_URL, location.href).href}</dd>
            <dt>{t('about.version')}</dt>
            <dd className="font-mono">{__APP_VERSION__}</dd>
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-2 text-sm">
        <h2 className="text-base font-semibold">{t('about.linksTitle')}</h2>
        <ul className="space-y-1.5 text-muted-foreground">
          <li>
            <Ext href={LINKS.site}>xray-lab</Ext> — {t('about.linkSite')}
          </li>
          <li>
            <Ext href={LINKS.library}>xray-wasm</Ext> — {t('about.linkLibrary')}
          </li>
          <li>
            <Ext href={LINKS.schema}>xray-schema</Ext> — {t('about.linkSchema')}
          </li>
          <li>
            <Ext href={LINKS.core}>XTLS/Xray-core</Ext> — {t('about.linkCore')}
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-base font-semibold">{t('about.creditsTitle')}</h2>
        <p className="text-muted-foreground">{t('about.credits')}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li><Ext href={LINKS.xterm}>xterm.js</Ext></li>
          <li><Ext href={LINKS.codemirror}>CodeMirror</Ext></li>
          <li><Ext href={LINKS.shadcn}>shadcn/ui</Ext></li>
          <li><Ext href={LINKS.phosphor}>Phosphor Icons</Ext></li>
          <li><Ext href={LINKS.geist}>Geist</Ext></li>
          <li><Ext href={LINKS.geo}>v2ray-rules-dat</Ext></li>
        </ul>
        <p className="pt-2 text-muted-foreground">
          {t('about.prior')} <Ext href={LINKS.prior}>mmmray/xray-online</Ext>
          {t('about.priorTail')}
        </p>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">{t('about.license')}</p>
    </div>
  );
}
