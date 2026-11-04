// Harmless integration test: actual Electron launcher + PowerShell helper,
// temporary fake installer; no Hub runtime, settings, database, or real installer.
const { app } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

app.whenReady().then(async () => {
  const root = resolve(process.argv[2]);
  const scenario = process.argv[3];
  fs.mkdirSync(root, { recursive: true });
  const { writeWindowsInstallerHandoff, psQuote } = await import(pathToFileURL(resolve(__dirname, '../dist/update/windows-update-handoff.js')));
  const { launchUpdateProcess } = await import(pathToFileURL(resolve(__dirname, '../dist/update/launch-update-process.js')));
  const installedPath = join(root, 'fake-installer-ran');
  const command = `[System.IO.File]::WriteAllText(${psQuote(installedPath)}, 'installed')`;
  const input = {
    scriptPath: join(root, "O'Hara & é", 'Install Gaurav POS Update.ps1'),
    logPath: join(root, 'install-handoff.log'),
    parentPid: process.pid,
    appExecutablePath: join(root, 'not-a-running-app.exe'),
    installer: { filePath: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')] }
  };
  if (scenario === 'rollback') {
    const fakeRollback = join(root, "O'Hara & é", 'Fake rollback.cmd');
    fs.mkdirSync(resolve(fakeRollback, '..'), { recursive: true });
    fs.writeFileSync(fakeRollback, `@echo off\r\n> "${installedPath}" echo installed\r\nexit /b 0\r\n`);
    input.installer = { filePath: fakeRollback, args: [] };
  }
  const plan = writeWindowsInstallerHandoff(input);
  if (scenario === 'success' || scenario === 'rollback') {
    await launchUpdateProcess(plan, root);
    if (fs.existsSync(installedPath)) throw new Error('Installer ran before Electron exited');
    fs.writeFileSync(join(root, 'authorized'), 'ready and go, parent still alive');
  } else if (scenario === 'cancel') {
    let rejected = false;
    try {
      await launchUpdateProcess(plan, root, { startupTimeoutMs: 1, pollIntervalMs: 1 });
    } catch { rejected = true; }
    if (!rejected || fs.readFileSync(plan.handoff.decisionPath, 'utf8') !== 'cancel') throw new Error('Timeout did not cancel');
    // Re-run the real script as though the first helper started late. It must
    // honor cancellation even after the parent exits.
    const latePlan = writeWindowsInstallerHandoff({ ...input,
      scriptPath: join(root, "O'Hara & é", 'Late helper.ps1'),
      logPath: join(root, 'late-install-handoff.log')
    });
    const late = spawn('cmd.exe', ['/d', '/s', '/c', `start "" /min powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(`& ${psQuote(latePlan.args.at(-1))}`, 'utf16le').toString('base64')}`], { stdio: 'ignore', windowsVerbatimArguments: true });
    await new Promise((resolve, reject) => { late.once('spawn', resolve); late.once('error', reject); });
    late.unref();
    fs.writeFileSync(join(root, 'cancelled'), 'cancel persisted before parent exit');
  } else throw new Error(`Unknown scenario ${scenario}`);
  app.exit(0);
}).catch(error => {
  fs.writeFileSync(join(resolve(process.argv[2]), 'failure.log'), error.stack || String(error));
  app.exit(1);
});
