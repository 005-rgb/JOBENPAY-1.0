if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

import('./app.js').catch((err) => {
  console.error('Failed to load ES module startup script (app.js):', err);
  process.exit(1);
});
