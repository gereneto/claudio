// Barramento de eventos do servidor -> PWA (via SSE).
import { EventEmitter } from "node:events";

export interface EventoClaudio {
  tipo: string;
  dados?: unknown;
}

class Barramento extends EventEmitter {
  publicar(tipo: string, dados?: unknown) {
    this.emit("evento", { tipo, dados } satisfies EventoClaudio);
  }
}

export const barramento = new Barramento();
barramento.setMaxListeners(100);
