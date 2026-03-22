// Tower Defense Multiplayer Server – PHP Launcher
// Startet server.php (kein npm-Paket nötig)

const { spawn } = require('child_process');
const path = require('path');

const php = spawn('php', [path.join(__dirname, 'server.php')], {
  stdio: 'inherit',
  env: process.env
});

php.on('close', code => process.exit(code || 0));
php.on('error', err => {
  console.error('PHP konnte nicht gestartet werden:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => php.kill('SIGTERM'));
process.on('SIGINT',  () => php.kill('SIGINT'));
