import {
  CheckCircleIcon,
  ClockCountdownIcon,
  ProhibitIcon,
  QuestionIcon,
  SkullIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { Verdict } from '../../engine';
import type { MessageKey } from '../../i18n';

export const VERDICT_LABEL: Record<Verdict, MessageKey> = {
  ok: 'verdict.ok',
  error: 'verdict.error',
  inconclusive: 'verdict.inconclusive',
  crashed: 'verdict.crashed',
  timeout: 'verdict.timeout',
  unavailable: 'verdict.unavailable',
};

export const VERDICT_STYLE: Record<Verdict, { icon: ComponentType<{ className?: string; weight?: 'fill' | 'regular' | 'bold' }>; tone: string }> = {
  ok: { icon: CheckCircleIcon, tone: 'text-success' },
  error: { icon: XCircleIcon, tone: 'text-destructive' },
  inconclusive: { icon: QuestionIcon, tone: 'text-warning' },
  crashed: { icon: SkullIcon, tone: 'text-destructive' },
  timeout: { icon: ClockCountdownIcon, tone: 'text-warning' },
  unavailable: { icon: ProhibitIcon, tone: 'text-muted-foreground' },
};

