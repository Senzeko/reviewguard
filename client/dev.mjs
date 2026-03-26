#!/usr/bin/env node
import { createServer } from 'vite';
const server = await createServer({
  configFile: '/Users/SIGNO/Desktop/ReviewGuard/reviewguard/client/vite.config.ts',
  root: '/Users/SIGNO/Desktop/ReviewGuard/reviewguard/client',
  server: { port: 5173 },
});
await server.listen();
server.printUrls();
