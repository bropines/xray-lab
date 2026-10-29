/**
 * The real library. Imported only from engine/index.ts, and only when the
 * site is not built with the fake engine.
 *
 * The two assignments are the type check against the contract: if the
 * library's exports drift from src/engine/contract.ts, `tsc` fails here.
 */
import { createXray as libCreateXray, loadManifest as libLoadManifest } from 'xray-wasm';
import type { CreateXray, LoadManifest } from './contract';

export const createXray: CreateXray = libCreateXray;
export const loadManifest: LoadManifest = libLoadManifest;
