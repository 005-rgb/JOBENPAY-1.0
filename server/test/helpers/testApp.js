import { once } from 'node:events';

import app from '../../src/app.js';

export async function startTestApp() {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

export async function closeTestApp(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
