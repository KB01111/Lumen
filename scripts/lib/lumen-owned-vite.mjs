import {resolve} from 'node:path';
import {createServer} from 'vite';

const [host, portArgument, token] = process.argv.slice(2);
const port = Number(portArgument);
let server;
try {
  if (!process.send || !token || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Owned Vite startup requires its parent IPC channel and exact port');
  server = await createServer({root: process.cwd(), clearScreen: false, server: {host, port, strictPort: true}});
  await server.listen();
  const address = server.httpServer?.address();
  if (!server.httpServer?.listening || typeof address !== 'object' || address === null || address.port !== port || address.address !== host) throw new Error('Owned Vite listener does not match the requested endpoint');
  process.send({type: 'lumen-owned-vite-ready', pid: process.pid, token, root: resolve(server.config.root),
    host, address: address.address, port: address.port, listening: true});
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  await server?.close();
  process.disconnect?.();
  process.exitCode = 1;
}
