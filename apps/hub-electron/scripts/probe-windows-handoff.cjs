// Run inside Electron on Windows; never opens the restaurant database or installer.
const { app } = require('electron');
const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync, existsSync, openSync, closeSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

app.whenReady().then(async () => {
  const root = resolve(process.argv[2]);
  mkdirSync(root, { recursive: true });
  const results = [];
  for (const variant of ['original', 'log-files', 'not-detached', 'cmd-start']) {
    const marker = join(root, `${variant}.ready`);
    const script = join(root, `${variant}.ps1`);
    const log = join(root, `${variant}.log`);
    writeFileSync(script, `\uFEFF[System.IO.File]::WriteAllText('${marker.replaceAll("'", "''")}', 'ready')\r\n`);
    const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script];
    const fd = openSync(log, 'a');
    const command = variant === 'cmd-start' ? 'cmd.exe' : 'powershell.exe';
    const encoded = Buffer.from(`& '${script.replaceAll("'", "''")}'`, 'utf16le').toString('base64');
    const args = variant === 'cmd-start'
      ? ['/d', '/s', '/c', `start "" /min powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`]
      : psArgs;
    const child = spawn(command, args, {
      detached: variant !== 'not-detached',
      stdio: variant === 'log-files' ? ['ignore', fd, fd] : 'ignore',
      windowsVerbatimArguments: variant === 'cmd-start',
      shell: false,
      cwd: root
    });
    closeSync(fd);
    let exit = null;
    let error = null;
    child.on('exit', (code, signal) => { exit = { code, signal }; });
    child.on('error', (value) => { error = value.message; });
    const deadline = Date.now() + 10000;
    while (!existsSync(marker) && Date.now() < deadline && !error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (exit === null) child.kill();
    const result = { variant, ready: existsSync(marker), exit, error, log: readFileSync(log, 'utf8') };
    results.push(result);
    writeFileSync(join(root, 'result.json'), JSON.stringify({ electron: process.versions, results }, null, 2));
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
