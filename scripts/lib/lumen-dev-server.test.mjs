import assert from 'node:assert/strict';
import http from 'node:http';
import {test} from 'node:test';
import {isDevServerRunning, isOwnedServerReceipt, withLumenDevServer} from './lumen-dev-server.mjs';

test('owned readiness rejects terminated or disconnected children', () => {
  const running = {exitCode: null, signalCode: null, connected: true};
  assert.equal(isDevServerRunning(running, true), true);
  assert.equal(isDevServerRunning({...running, exitCode: 1}, true), false);
  assert.equal(isDevServerRunning({...running, signalCode: 'SIGTERM'}, true), false);
  assert.equal(isDevServerRunning({...running, connected: false}, true), false);
  assert.equal(isDevServerRunning({...running, connected: false}, false), true);
});

test('owned startup rejects non-loopback and implicit HTTP endpoints', async () => {
  for (const url of ['http://0.0.0.0:1420', 'https://127.0.0.1:1420', 'http://127.0.0.1']) {
    await assert.rejects(withLumenDevServer(() => assert.fail('must not admit invalid endpoint'), url, {reuseExistingServer: false}), /explicit loopback HTTP port/);
  }
});

test('owned readiness requires the exact child, source, endpoint and fresh IPC token', () => {
  const expected = {pid: 42, root: 'C:\\Lumen', host: '127.0.0.1', port: 1420, token: 'fresh-token'};
  const receipt = {type: 'lumen-owned-vite-ready', ...expected, address: expected.host, listening: true};
  assert.equal(isOwnedServerReceipt(receipt, expected), true);
  for (const invalid of [null, {}, {...receipt, pid: 43}, {...receipt, root: 'C:\\Other'},
    {...receipt, token: 'stale-token'}, {...receipt, host: 'localhost'}, {...receipt, address: '0.0.0.0'},
    {...receipt, port: 1421}, {...receipt, listening: false}]) {
    assert.equal(isOwnedServerReceipt(invalid, expected), false);
  }
});

async function serverFixture(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {url, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })};
}

test('owned mode refuses a server that became ready after native preflight', async () => {
  let ready = false;
  const server = await serverFixture((_request, response) => { response.statusCode = ready ? 200 : 503; response.end('competing checkout'); });
  try {
    assert.equal((await fetch(server.url)).ok, false);
    ready = true;
    let calls = 0;
    await assert.rejects(withLumenDevServer(async () => { calls += 1; }, server.url, {reuseExistingServer: false}), /already ready; owned startup required/);
    assert.equal(calls, 0);
    assert.equal(await (await fetch(server.url)).text(), 'competing checkout');
  } finally { await server.close(); }
});

test('owned mode never accepts competing readiness while its Vite child fails to bind', async () => {
  let requests = 0;
  const server = await serverFixture((_request, response) => {
    response.statusCode = requests++ === 0 ? 503 : 200;
    response.end('competing checkout');
  });
  try {
    let calls = 0;
    await assert.rejects(withLumenDevServer(async () => { calls += 1; }, server.url, {reuseExistingServer: false}), /stopped \((1|lost its IPC channel)\)/);
    assert.equal(calls, 0);
    assert.equal(await (await fetch(server.url)).text(), 'competing checkout');
  } finally { await server.close(); }
});

test('existing callers retain intentional server reuse', async () => {
  const server = await serverFixture((_request, response) => response.end('existing checkout'));
  try {
    const result = await withLumenDevServer(async (url) => (await fetch(url)).text(), server.url);
    assert.equal(result, 'existing checkout');
  } finally { await server.close(); }
});

test('owned mode enters the callback after its own Vite startup and cleans it up', async () => {
  const reservation = await serverFixture((_request, response) => response.end());
  const url = reservation.url;
  await reservation.close();
  let calls = 0;
  await withLumenDevServer(async (ownedUrl, receipt) => {
    calls += 1;
    assert.equal(ownedUrl, url);
    assert.equal(receipt.port, Number(new URL(url).port));
    assert.equal(receipt.listening, true);
    assert.match(await (await fetch(ownedUrl)).text(), /Lumen/);
  }, url, {reuseExistingServer: false});
  assert.equal(calls, 1);
  await assert.rejects(fetch(url));
});

test('owned mode verifies the canonical native fixture port and cleans it up', async () => {
  const url = 'http://127.0.0.1:1420';
  await assert.rejects(fetch(url));
  let calls = 0;
  await withLumenDevServer(async (ownedUrl, receipt) => {
    calls += 1;
    assert.equal(ownedUrl, url);
    assert.equal(receipt.port, 1420);
    assert.equal(receipt.listening, true);
    assert.match(await (await fetch(`${ownedUrl}/scripts/native-performance.html`)).text(), /src\/test\/native-performance\.tsx/);
  }, url, {reuseExistingServer: false});
  assert.equal(calls, 1);
  await assert.rejects(fetch(url));
});
