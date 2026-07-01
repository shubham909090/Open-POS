import { stopThenSpawnReplacement } from "./process-restart.js";
import { startHub } from "./runtime.js";

let hub: Awaited<ReturnType<typeof startHub>>;
let restartRequested = false;
hub = await startHub({
  requestExit: () => {
    void hub.stop().finally(() => process.exit(0));
  },
  requestRestart: () => {
    if (restartRequested) return;
    restartRequested = true;
    void stopThenSpawnReplacement({
      stop: () => hub.stop(),
      execPath: process.execPath,
      args: process.argv.slice(1),
      cwd: process.cwd(),
      env: process.env,
      exitProcess: process.exit
    });
  }
});
