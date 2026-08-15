import { spawn } from 'node:child_process';

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Wrap `spawn` so analyzer subprocesses (Blender, ffprobe, python helpers)
 * are bounded by a wall-clock timeout and produce a structured result. We
 * deliberately do NOT pipe stdin — every tool reads its input from disk so
 * scratch dirs stay the single source of truth.
 */
export async function runSubprocess(
  bin: string,
  args: string[],
  options: { timeoutMs: number; env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (timedOut) {
        reject(new Error(`Subprocess ${bin} timed out after ${options.timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}
