export type EngineMessage = {
  type: "bestmove" | "info" | "ready";
  move?: string;
  depth?: number;
  score?: number;
  pv?: string[];
};

export class StockfishEngine {
  private worker: Worker | null = null;
  private onMessage: ((msg: EngineMessage) => void) | null = null;
  private ready = false;

  async init(onMessage: (msg: EngineMessage) => void) {
    this.onMessage = onMessage;
    this.worker = new Worker("/stockfish.js");

    this.worker.onmessage = (e: MessageEvent) => {
      const line: string = e.data;
      if (line === "readyok") {
        this.ready = true;
        this.onMessage?.({ type: "ready" });
      } else if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        this.onMessage?.({ type: "bestmove", move: parts[1] });
      } else if (line.startsWith("info")) {
        const depthMatch = line.match(/depth (\d+)/);
        const scoreMatch = line.match(/score cp (-?\d+)/);
        const pvMatch = line.match(/pv (.+)/);
        this.onMessage?.({
          type: "info",
          depth: depthMatch ? parseInt(depthMatch[1]) : undefined,
          score: scoreMatch ? parseInt(scoreMatch[1]) : undefined,
          pv: pvMatch ? pvMatch[1].split(" ") : undefined,
        });
      }
    };

    this.send("uci");
    this.send("isready");
  }

  send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  setPosition(fen: string, moves: string[] = []) {
    const movesStr = moves.length ? `moves ${moves.join(" ")}` : "";
    this.send(`position fen ${fen} ${movesStr}`);
  }

  getBestMove(depth = 15, elo?: number) {
    if (elo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${elo}`);
    } else {
      this.send("setoption name UCI_LimitStrength value false");
    }
    this.send(`go depth ${depth}`);
  }

  stop() {
    this.send("stop");
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
  }
}
