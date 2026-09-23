import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.ts";

mkdirSync(dirname(resolve(config.dbPath)), { recursive: true });
export const db = new DatabaseSync(resolve(config.dbPath));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const migracoes: string[] = [
  `
  CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    repo TEXT,
    caminho TEXT,
    instrucoes TEXT,
    modelo_padrao TEXT,
    visivel INTEGER NOT NULL DEFAULT 1,
    satelite_de INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ordens (
    id INTEGER PRIMARY KEY,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    prompt TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('pontual','continua')),
    ligada INTEGER NOT NULL DEFAULT 0,
    prioridade INTEGER NOT NULL DEFAULT 5,
    estado TEXT NOT NULL DEFAULT 'fila',
    unidade TEXT,
    progresso_feito INTEGER NOT NULL DEFAULT 0,
    progresso_total INTEGER,
    criterio_fim TEXT,
    session_id TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS execucoes (
    id INTEGER PRIMARY KEY,
    ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
    session_id TEXT,
    modelo TEXT,
    effort TEXT,
    inicio TEXT NOT NULL DEFAULT (datetime('now')),
    fim TEXT,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    tokens_cache INTEGER NOT NULL DEFAULT 0,
    custo_usd REAL NOT NULL DEFAULT 0,
    resultado TEXT,
    resumo TEXT,
    erro TEXT
  );
  CREATE TABLE IF NOT EXISTS decisoes (
    id INTEGER PRIMARY KEY,
    execucao_id INTEGER REFERENCES execucoes(id) ON DELETE CASCADE,
    conversa_id INTEGER REFERENCES conversas(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('permissao','pergunta')),
    payload TEXT NOT NULL,
    resposta TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    respondido_em TEXT
  );
  CREATE TABLE IF NOT EXISTS pastas (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    pai_id INTEGER REFERENCES pastas(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS conversas (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    pasta_id INTEGER REFERENCES pastas(id) ON DELETE SET NULL,
    projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
    ordem_id INTEGER UNIQUE REFERENCES ordens(id) ON DELETE CASCADE,
    session_id TEXT,
    lida INTEGER NOT NULL DEFAULT 1,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    papel TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'livre',
    texto TEXT NOT NULL,
    lida INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS uso (
    id INTEGER PRIMARY KEY,
    momento TEXT NOT NULL DEFAULT (datetime('now')),
    h5_pct REAL, h5_reset INTEGER,
    d7_pct REAL, d7_reset INTEGER,
    fonte TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS estrategias (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT (datetime('now')),
    texto TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS assinaturas_push (
    id INTEGER PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    dados TEXT NOT NULL,
    aparelho TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_envio TEXT
  );
  `,
];

db.exec("CREATE TABLE IF NOT EXISTS _migracoes (n INTEGER PRIMARY KEY)");
const aplicadas = new Set((db.prepare("SELECT n FROM _migracoes").all() as { n: number }[]).map((r) => r.n));
migracoes.forEach((sql, i) => {
  if (aplicadas.has(i)) return;
  db.exec(sql);
  db.prepare("INSERT INTO _migracoes (n) VALUES (?)").run(i);
});

export function um<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as any[])) as T | undefined;
}
export function todos<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as any[])) as T[];
}
export function executar(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as any[]));
}
export function lerConfig(chave: string, padrao: string): string {
  return um<{ valor: string }>("SELECT valor FROM config WHERE chave = ?", chave)?.valor ?? padrao;
}
export function gravarConfig(chave: string, valor: string) {
  executar("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", chave, valor);
}
