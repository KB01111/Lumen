import assert from 'node:assert/strict';
import http from 'node:http';
import {mock, test} from 'node:test';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {withLumenDevServer} from './lumen-dev-server.mjs';

// Owned startup verifies the listening process with Get-NetTCPConnection, so these
// cases only have meaning on Windows. `withLumenDevServer` itself refuses owned mode
// elsewhere; skipping keeps a POSIX checkout from reporting a false failure.
const ownedStartupTest = process.platform === 'win32' ? test : test.skip;

async function serverFixture(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {url, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })};
}

ownedStartupTest('owned mode refuses a server that became ready after native preflight', async () => {
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

ownedStartupTest('owned mode never accepts competing readiness while its Vite child fails to bind', async () => {
  let requests = 0;
  const server = await serverFixture((_request, response) => {
    response.statusCode = requests++ === 0 ? 503 : 200;
    response.end('competing checkout');
  });
  try {
    let calls = 0;
    await assert.rejects(withLumenDevServer(async () => { calls += 1; }, server.url, {reuseExistingServer: false}), /exited with code 1/);
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

ownedStartupTest('owned mode enters the callback after its own Vite startup and cleans it up', async () => {
  const reservation = await serverFixture((_request, response) => response.end());
  const url = reservation.url;
  await reservation.close();
  let calls = 0;
  await withLumenDevServer(async (ownedUrl) => {
    calls += 1;
    assert.equal(ownedUrl, url);
    assert.match(await (await fetch(ownedUrl)).text(), /Lumen/);
  }, url, {reuseExistingServer: false});
  assert.equal(calls, 1);
  await assert.rejects(fetch(url));
});

test('owned startup retries an unobserved listener before admitting its real child', async () => {
  const reservation = await serverFixture((_request, response) => response.end());
  const url = reservation.url;
  await reservation.close();
  const originalSpawn = childProcess.spawn;
  let child;
  let probes = 0;
  let calls = 0;
  const spawn = mock.method(childProcess, 'spawn', (...args) => {
    child = originalSpawn(...args);
    return child;
  });
  const ownership = mock.method(childProcess, 'execFileSync', () => {
    probes += 1;
    return JSON.stringify(probes === 1 ? [] : [child.pid]);
  });
  syncBuiltinESMExports();
  try {
    await withLumenDevServer(async (ownedUrl) => {
      calls += 1;
      assert.ok(probes >= 2, 'HTTP readiness cannot bypass listener ownership');
      assert.match(await (await fetch(ownedUrl)).text(), /Lumen/);
    }, url, {reuseExistingServer: false});
    assert.equal(calls, 1);
    await assert.rejects(fetch(url));
  } finally {
    ownership.mock.restore();
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
});
