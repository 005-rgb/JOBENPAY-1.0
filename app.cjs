import('./app.js').catch((err) => {
  console.error('Failed to load ES module startup script (app.js):', err);
  process.exit(1);
});
