type WorkerCallback = (line: string) => void;

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  id: number;
}

class StockfishPool {
  private workers: PooledWorker[] = [];
  private maxWorkers: number;
  private callbacks: Map<number, WorkerCallback> = new Map();
  private ready: Set<number> = new Set();

  constructor(maxWorkers = 2) {
    this.maxWorkers = maxWorkers;
  }

  private createWorker(id: number): PooledWorker {
    const worker = new Worker("/stockfish.js");
    worker.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === "string" ? e.data : "";
      if (line === "readyok") { this.ready.add(id); return; }
      const cb = this.callbacks.get(id);
      if (cb) cb(line);
    };
    worker.postMessage("uci");
    worker.postMessage("isready");
    const pooled: PooledWorker = { worker, busy: false, id };
    this.workers.push(pooled);
    return pooled;
  }

  acquire(callback: WorkerCallback): number {
    const free = this.workers.find(w => !w.busy);
    if (free) {
      free.busy = true;
      this.callbacks.set(free.id, callback);
      return free.id;
    }
    if (this.workers.length < this.maxWorkers) {
      const id = this.workers.length;
      const pooled = this.createWorker(id);
      pooled.busy = true;
      this.callbacks.set(id, callback);
      return id;
    }
    const oldest = this.workers[0];
    oldest.worker.postMessage("stop");
    oldest.worker.terminate();
    this.ready.delete(oldest.id);
    const id = oldest.id;
    const fresh = new Worker("/stockfish.js");
    fresh.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === "string" ? e.data : "";
      if (line === "readyok") { this.ready.add(id); return; }
      const cb = this.callbacks.get(id);
      if (cb) cb(line);
    };
    fresh.postMessage("uci");
    fresh.postMessage("isready");
    oldest.worker = fresh;
    oldest.busy = true;
    this.callbacks.set(id, callback);
    return id;
  }

  send(workerId: number, command: string) {
    const pooled = this.workers.find(w => w.id === workerId);
    if (pooled) pooled.worker.postMessage(command);
  }

  release(workerId: number) {
    const pooled = this.workers.find(w => w.id === workerId);
    if (pooled) {
      pooled.worker.postMessage("stop");
      pooled.busy = false;
      this.callbacks.delete(workerId);
    }
  }

  stopAll() {
    this.workers.forEach(w => {
      w.worker.postMessage("stop");
      w.busy = false;
    });
    this.callbacks.clear();
  }

  terminateAll() {
    this.workers.forEach(w => w.worker.terminate());
    this.workers = [];
    this.callbacks.clear();
    this.ready.clear();
  }
}

let globalPool: StockfishPool | null = null;

export function getStockfishPool(): StockfishPool {
  if (typeof window === "undefined") return null as any;
  if (!globalPool) globalPool = new StockfishPool(2);
  return globalPool;
}

export function stopAllEngines() {
  globalPool?.stopAll();
}

export type { StockfishPool };
