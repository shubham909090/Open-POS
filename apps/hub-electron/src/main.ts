import { spawn } from "node:child_process";
import { startHub } from "./runtime.js";

await startHub({
  requestRestart: () => {
    const child = spawn(process.execPath, process.argv.slice(1), {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "inherit"
    });
    child.unref();
    process.exit(0);
  }
});
