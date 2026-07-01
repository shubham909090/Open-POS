import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

type SpawnProcess = typeof spawn;

export async function stopThenSpawnReplacement(input: {
  stop: () => Promise<void>;
  execPath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  spawnProcess?: SpawnProcess;
  exitProcess?: (code?: number) => never | void;
}): Promise<void> {
  await input.stop();
  const child = (input.spawnProcess ?? spawn)(input.execPath, input.args, {
    cwd: input.cwd,
    detached: true,
    env: input.env,
    stdio: "inherit"
  }) as ChildProcess;
  child.unref();
  (input.exitProcess ?? process.exit)(0);
}
