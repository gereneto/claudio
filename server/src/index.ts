import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { app } from "./api.ts";
import { config } from "./config.ts";
import { iniciarEscalonador, pararEscalonador } from "./escalonador.ts";
import { atualizarLimites, encerrarSentinela } from "./sentinela.ts";

// PWA compilado (web/dist), quando existir.
const dist = resolve(config.raiz, "web", "dist");
if (existsSync(dist)) {
  const raizRelativa = relative(process.cwd(), dist).replace(/\\/g, "/");
  app.use("/*", serveStatic({ root: raizRelativa }));
  app.get("*", serveStatic({ root: raizRelativa, path: "index.html" }));
} else {
  app.get("/", (c) => c.text("Claudio: API no ar. O PWA ainda não foi compilado (web/dist)."));
}

// Sem hostname: ouve em IPv4 e IPv6 (localhost no Windows resolve primeiro para ::1).
const servidor = serve({ fetch: app.fetch, port: config.porta }, (info) => {
  console.log(`Claudio ouvindo em http://localhost:${info.port} (banco: ${config.dbPath})`);
  if (process.env.CLAUDIO_SEM_ESCALONADOR !== "1") {
    iniciarEscalonador();
    if (process.env.CLAUDIO_SEM_SENTINELA !== "1") void atualizarLimites("início");
  }
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    pararEscalonador();
    encerrarSentinela();
    servidor.close();
    process.exit(0);
  });
}
