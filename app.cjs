(async () => {
  const { startServer } = await import('./server/src/server.js');
  startServer();
})().catch((error) => {
  console.error('Failed to start JOBENPAY server:', error);
  process.exit(1);
});
