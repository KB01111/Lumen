import {Buffer} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function parseTcpListeners(bytes) {
  if (bytes.length < 4) throw new Error('Truncated TCP listener table');
  const count = bytes.readUInt32LE(0);
  // MIB_TCPROW_OWNER_PID has six DWORD fields, aligned to DWORD after the count.
  if (count > (bytes.length - 4) / 24) throw new Error('Truncated TCP listener rows');
  return Array.from({length: count}, (_, index) => {
    const offset = 4 + index * 24;
    return {address: [...bytes.subarray(offset + 4, offset + 8)].join('.'),
      port: bytes.readUInt16BE(offset + 8), pid: bytes.readUInt32LE(offset + 20),
      rawState: bytes.readUInt32LE(offset)};
  });
}

export function requireOwnedTcpListener(listeners, port, owned) {
  const matches = listeners.filter(row => row.port === port && (row.address === '127.0.0.1' || row.address === '0.0.0.0'));
  if (matches.length !== 1 || matches[0].address !== '127.0.0.1' || !owned.has(matches[0].pid)) throw new Error('CDP listener is not uniquely owned by the fixture executable');
  return matches[0];
}

export function readWindowsTcpListeners() {
  if (process.platform !== 'win32') throw new Error('TCP listener verification requires Windows');
  const script = fileURLToPath(new URL('./windows-tcp-listeners.ps1', import.meta.url));
  const encoded = execFileSync('powershell.exe', ['-NoProfile', '-File', script], {encoding: 'utf8', windowsHide: true, timeout: 20_000}).trim();
  return parseTcpListeners(Buffer.from(encoded, 'base64'));
}
