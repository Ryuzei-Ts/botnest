/**
 * @file src/engine/bridge.ts
 * @description Low-latency Unix domain socket client bridge to Python workers.
 */

import net from 'node:net'

export interface WorkerRequest {
  command: string
  text: string
  platform: string
}

export interface WorkerResponse {
  status: 'ok' | 'error'
  platform?: string
  runtime?: string
  latency_ms?: number
  result?: Record<string, unknown>
  error?: string
}

export class PythonBridge {
  constructor(private readonly socketPath: string = '/tmp/botnest_ipc.sock') {}

  public execute(request: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection({ path: this.socketPath }, () => {
        client.write(JSON.stringify(request) + '\n')
      })

      let buffer = ''

      client.on('data', (chunk) => {
        buffer += chunk.toString()
        if (buffer.includes('\n')) {
          client.end()
        }
      })

      client.on('end', () => {
        try {
          const parsed = JSON.parse(buffer.trim()) as WorkerResponse
          resolve(parsed)
        } catch (err) {
          reject(new Error(`Failed to parse worker response: ${buffer}`))
        }
      })

      client.on('error', (err) => {
        reject(err)
      })
    })
  }
}
