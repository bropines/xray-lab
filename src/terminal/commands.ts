/**
 * What `xray` understands, for Tab completion and the first-run hints.
 *
 * Written from main/commands/all/** of v26.10.21 (`commands.go` registers
 * api, base64, convert, tls, uuid, x25519, wg, mldsa65, mlkem768, vlessenc;
 * lua and ed25519 are commented out there). Older builds lack a few — the
 * core itself answers "unknown command" for those, so completion offering
 * one is harmless. Flags are given as the usage lines spell them.
 */
export interface CommandSpec {
  name: string;
  summary: string;
  flags?: string[];
  sub?: CommandSpec[];
  /** Positional arguments (or the value of `-c`, `-file`…) are file names. */
  files?: boolean;
  /** Needs the network, which the browser build does not have. */
  network?: boolean;
}

export const XRAY_COMMANDS: CommandSpec[] = [
  { name: 'run', summary: 'Run Xray with config (here: only with -test)', flags: ['-test', '-c', '-config', '-confdir', '-format', '-dump'], files: true },
  { name: 'version', summary: 'Show current version of Xray' },
  { name: 'help', summary: 'Show help for a command' },
  { name: 'uuid', summary: 'Generate UUIDv4 or UUIDv5 (VLESS)', flags: ['-i'] },
  { name: 'x25519', summary: 'Key pair for X25519 (REALITY, VLESS Encryption)', flags: ['-i', '--std-encoding'] },
  { name: 'wg', summary: 'Key pair for X25519 (WireGuard)', flags: ['-i'] },
  { name: 'mldsa65', summary: 'Key pair for ML-DSA-65 (REALITY)', flags: ['-i'] },
  { name: 'mlkem768', summary: 'Key pair for ML-KEM-768 (VLESS Encryption)', flags: ['-i'] },
  { name: 'vlessenc', summary: 'decryption/encryption pair (VLESS Encryption)' },
  {
    name: 'tls',
    summary: 'TLS tools',
    sub: [
      { name: 'cert', summary: 'Generate TLS certificates', flags: ['-domain', '-name', '-org', '-ca', '-json', '-file', '-expire'] },
      { name: 'ech', summary: 'Generate TLS-ECH certificates', flags: ['--serverName', '--pem', '-i'] },
      { name: 'hash', summary: 'Calculate TLS certificate hash', flags: ['--cert'], files: true },
      { name: 'ping', summary: 'Ping the domain with TLS handshake', network: true },
    ],
  },
  {
    name: 'convert',
    summary: 'Convert configs',
    sub: [
      { name: 'pb', summary: 'Convert multiple json configs to protobuf', flags: ['-outpbfile', '-debug', '-type'], files: true },
      { name: 'json', summary: 'Convert typedMessage to json', flags: ['-type'], files: true },
    ],
  },
  {
    name: 'base64',
    summary: 'Encode and decode Base64',
    sub: [
      { name: 'encode', summary: 'Encode as Base64', flags: ['-gzip'], files: true },
      { name: 'decode', summary: 'Decode Base64', files: true },
    ],
  },
  { name: 'api', summary: 'Call an API in an Xray process', network: true },
];

export interface BuiltinSpec {
  name: string;
  usage: string;
  summary: string;
  /** Arguments are file names (completion offers them). */
  files?: boolean;
  /** The argument is a core version. */
  version?: boolean;
}

export const BUILTINS: BuiltinSpec[] = [
  { name: 'help', usage: 'help', summary: 'this list' },
  { name: 'xray', usage: 'xray <command> …', summary: 'the core of the chosen version (xray@26.7.28 … for another)' },
  { name: 'use', usage: 'use [version]', summary: 'show or change the version `xray` runs', version: true },
  { name: 'versions', usage: 'versions', summary: 'list the cores, with download sizes' },
  { name: 'ls', usage: 'ls [dir]', summary: 'list files', files: true },
  { name: 'cat', usage: 'cat <file>…', summary: 'print files', files: true },
  { name: 'edit', usage: 'edit <file>', summary: 'open a file in the editor panel', files: true },
  { name: 'rm', usage: 'rm <file>…', summary: 'delete files', files: true },
  { name: 'cp', usage: 'cp <from> <to>', summary: 'copy a file', files: true },
  { name: 'mv', usage: 'mv <from> <to>', summary: 'rename a file', files: true },
  { name: 'upload', usage: 'upload', summary: 'add files from your device (geo .dat files go to /usr/share/xray)' },
  { name: 'download', usage: 'download <file>', summary: 'save a file to your device', files: true },
  { name: 'cd', usage: 'cd [dir]', summary: 'change directory', files: true },
  { name: 'pwd', usage: 'pwd', summary: 'print the working directory' },
  { name: 'echo', usage: 'echo …', summary: 'print the arguments' },
  { name: 'history', usage: 'history', summary: 'commands typed this session' },
  { name: 'clear', usage: 'clear', summary: 'clear the screen (Ctrl+L)' },
];

export function findCommand(path: readonly string[]): CommandSpec | undefined {
  let list: CommandSpec[] | undefined = XRAY_COMMANDS;
  let found: CommandSpec | undefined;
  for (const name of path) {
    found = list?.find(c => c.name === name);
    if (!found) return undefined;
    list = found.sub;
  }
  return found;
}
