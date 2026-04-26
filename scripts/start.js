const { spawn } = require('child_process');

const isProductionLike = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_STATIC_URL ||
  process.env.PORT ||
  process.env.NODE_ENV === 'production'
);

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
}

if (isProductionLike) {
  console.log('Starting SMART2 in production mode: backend only');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', 'backend', 'start']);
} else {
  console.log('Starting SMART2 in development mode: backend + frontend');
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'concurrently',
    '-n',
    'backend,frontend',
    '-c',
    'blue,magenta',
    'npm run backend',
    'npm run frontend'
  ]);
}
