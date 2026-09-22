import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..", "..");

export const config = {
  porta: Number(process.env.CLAUDIO_PORTA ?? 3737),
  dbPath: process.env.CLAUDIO_DB ?? resolve(raiz, "dados", "claudio.db"),
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  /** Onde ficam os clones dos projetos (irmãos da pasta do Claudio por padrão). */
  pastaProjetos: process.env.CLAUDIO_PROJETOS ?? resolve(raiz, ".."),
  usuarioGithub: process.env.CLAUDIO_GITHUB ?? "gereneto",
  /** Sufixos de repositório que marcam um satélite do repositório de mesmo prefixo. */
  sufixosSatelite: ["-dados", "-revisao"],
  raiz,
};
