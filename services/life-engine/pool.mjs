import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SIZE = 64;
export const CELLS = SIZE * SIZE;
export function validJob(value) {
  return (
    value &&
    typeof value.board === 'string' &&
    /^[01]{4096}$/.test(value.board) &&
    Number.isInteger(value.steps) &&
    value.steps >= 1 &&
    value.steps <= 100
  );
}
export class WorkerPool {
  constructor({
    binary = fileURLToPath(new URL('./dist/life-worker', import.meta.url)),
    threads = 2,
    size = 2,
    timeout = 10000,
  } = {}) {
    this.binary = binary;
    this.threads = threads;
    this.timeout = timeout;
    this.workers = Array.from({ length: size }, () => ({
      child: null,
      job: null,
      buffer: '',
    }));
    this.closed = false;
  }
  start(worker) {
    const child = spawn(this.binary, ['--threads', String(this.threads)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    worker.child = child;
    worker.buffer = '';
    const failed = () => {
      if (worker.child !== child) return;
      worker.child = null;
      worker.buffer = '';
      if (worker.job) worker.job.finish(new Error('Simulation worker stopped'));
    };
    child.on('error', failed);
    child.on('exit', failed);
    child.stdin.on('error', failed);
    child.stderr.resume();
    child.stdout.on('data', (chunk) => {
      if (worker.child !== child) return;
      worker.buffer += chunk.toString('ascii');
      if (worker.buffer.length > CELLS + 1) {
        child.kill();
        failed();
        return;
      }
      if (!worker.buffer.endsWith('\n')) return;
      const board = worker.buffer.slice(0, -1);
      worker.buffer = '';
      if (!/^[01]{4096}$/.test(board) || !worker.job) {
        child.kill();
        failed();
        return;
      }
      worker.job.finish(null, board);
    });
  }
  run(board, steps) {
    if (this.closed)
      return Promise.reject(new Error('Simulation service stopped'));
    const worker = this.workers.find((item) => !item.job);
    if (!worker)
      return Promise.reject(
        Object.assign(new Error('Simulation service is busy'), { status: 503 }),
      );
    if (!worker.child) this.start(worker);
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const timer = setTimeout(() => {
        const child = worker.child;
        worker.child = null;
        child?.kill('SIGKILL');
        worker.job?.finish(new Error('Simulation timed out'));
      }, this.timeout);
      worker.job = {
        finish: (error, result) => {
          clearTimeout(timer);
          worker.job = null;
          if (error) reject(error);
          else
            resolve({
              board: result,
              steps,
              elapsedMs: Math.round((performance.now() - started) * 100) / 100,
              threads: this.threads,
            });
        },
      };
      worker.child.stdin.write(`${steps}\n${board}\n`);
    });
  }
  async warm() {
    await Promise.all(this.workers.map(() => this.run('0'.repeat(CELLS), 0)));
  }
  close() {
    this.closed = true;
    for (const worker of this.workers) {
      worker.job?.finish(new Error('Simulation service stopped'));
      worker.child?.kill();
    }
  }
}
