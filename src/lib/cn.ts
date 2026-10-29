import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** clsx + tailwind-merge: a caller's className overrides a component's own. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
