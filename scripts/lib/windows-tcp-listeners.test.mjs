import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import http from 'node:http';
import {test} from 'node:test';
import {parseTcpListeners, readWindowsTcpListeners, requireOwnedTcpListener} from './windows-tcp-listeners.mjs';

test('listener table decoding preserves network byte order and rejects truncation', () => {
  const bytes = Buffer.alloc(28);
  bytes.writeUInt32LE(1, 0);
  bytes.set([127, 0, 0, 1], 8);
  bytes.writeUInt16BE(43210, 12);
  bytes.writeUInt32LE(42, 24);
  assert.deepEqual(parseTcpListeners(bytes), [{address: '127.0.0.1', port: 43210, pid: 42, rawState: 0}]);
  assert.throws(() => parseTcpListeners(bytes.subarray(0, 3)), /Truncated/);
  assert.throws(() => parseTcpListeners(bytes.subarray(0, 27)), /Truncated/);
});

test('listener admission rejects missing, foreign, wildcard and ambiguous owners', () => {
  const row = {address: '127.0.0.1', port: 43210, pid: 42, rawState: 0};
  const owned = new Set([42]);
  assert.equal(requireOwnedTcpListener([row], 43210, owned), row);
  for (const rows of [[], [{...row, pid: 43}], [{...row, address: '0.0.0.0'}], [row, {...row, pid: 43}],
    [row, {...row, address: '0.0.0.0', pid: 43}], [row, {...row, address: '0.0.0.0'}]]) {
    assert.throws(() => requireOwnedTcpListener(rows, 43210, owned), /not uniquely owned/);
  }
});

test('Windows listener-only API proves an actual loopback server and removes it on close', {skip: process.platform !== 'win32'}, async () => {
  const server = http.createServer((_request, response) => response.end('owned listener'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const rows = readWindowsTcpListeners();
    assert.equal(requireOwnedTcpListener(rows, port, new Set([process.pid])).pid, process.pid);
    assert.throws(() => requireOwnedTcpListener(rows, port, new Set([process.pid + 1])), /not uniquely owned/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'owned listener');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.throws(() => requireOwnedTcpListener(readWindowsTcpListeners(), port, new Set([process.pid])), /not uniquely owned/);
});
