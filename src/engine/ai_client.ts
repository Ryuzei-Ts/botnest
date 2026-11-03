import net from 'node:net';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const SOCKET_PATH = process.env.BOTNEST_IPC_SOCKET || '/tmp/botnest_ipc.sock';

export interface IPCRequest {
  command: 'tokenize' | 'sentiment' | string;
  text: string;
  platform?: string;
  [key: string]: any;
}

export interface IPCResponse<T = any> {
  status: 'ok' | 'error';
  platform?: string;
  runtime?: string;
  latency_ms?: number;
  result?: T;
  error?: string;
}

export class AIWorkerClient {
  private workerProcess: ChildProcess | null = null;
  private isStarting = false;

  constructor(private pythonScriptPath: string = path.resolve('workers/ai_worker.py')) {}

  public async ensureWorker(): Promise<void> {
    if (fs.existsSync(SOCKET_PATH)) {
      const alive = await this.pingSocket();
      if (alive) return;
      try {
        fs.unlinkSync(SOCKET_PATH);
      } catch (_) {}
    }

    if (this.isStarting) return;
    this.isStarting = true;

    this.workerProcess = spawn('python3', [this.pythonScriptPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false
    });

    this.workerProcess.on('exit', () => {
      this.workerProcess = null;
      if (fs.existsSync(SOCKET_PATH)) {
        try {
          fs.unlinkSync(SOCKET_PATH);
        } catch (_) {}
      }
    });

    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.existsSync(SOCKET_PATH)) {
        const ok = await this.pingSocket();
        if (ok) {
          this.isStarting = false;
          return;
        }
      }
      attempts++;
    }

    this.isStarting = false;
    throw new Error('No se pudo establecer conexión con el worker de Python.');
  }

  private pingSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = net.createConnection({ path: SOCKET_PATH }, () => {
        client.end();
        resolve(true);
      });
      client.on('error', () => resolve(false));
      client.setTimeout(300, () => {
        client.destroy();
        resolve(false);
      });
    });
  }

  public async send<T = any>(payload: IPCRequest, timeoutMs = 5000): Promise<IPCResponse<T>> {
    await this.ensureWorker();

    return new Promise((resolve, reject) => {
      const client = net.createConnection({ path: SOCKET_PATH });
      let rawData = '';

      const timer = setTimeout(() => {
        client.destroy();
        reject(new Error(`Timeout de ${timeoutMs}ms esperando respuesta del worker IPC.`));
      }, timeoutMs);

      client.on('connect', () => {
        client.write(JSON.stringify(payload) + '\n');
      });

      client.on('data', (chunk) => {
        rawData += chunk.toString('utf-8');
        if (rawData.includes('\n')) {
          clearTimeout(timer);
          client.end();
          try {
            const parsed = JSON.parse(rawData.trim());
            resolve(parsed);
          } catch (err) {
            reject(new Error('Respuesta IPC corrupta o malformada.'));
          }
        }
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  public stop(): void {
    if (this.workerProcess) {
      this.workerProcess.kill('SIGTERM');
      this.workerProcess = null;
    }
    if (fs.existsSync(SOCKET_PATH)) {
      try {
        fs.unlinkSync(SOCKET_PATH);
      } catch (_) {}
    }
  }
}

export const aiWorker = new AIWorkerClient();
