// Projetos: importação a partir do GitHub, clones locais e regra dos satélites.
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.ts";
import { executar, todos, um } from "./db.ts";
import type { Projeto } from "./tipos.ts";

const execFileAsync = promisify(execFile);
const shell = false;
const GH = process.platform === "win32" ? "gh.exe" : "gh";

interface RepoGithub {
  name: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
}

export async function listarReposGithub(): Promise<RepoGithub[]> {
  const { stdout } = await execFileAsync(
    GH,
    ["repo", "list", config.usuarioGithub, "--limit", "200", "--json", "name,url,description,isPrivate"],
    { windowsHide: true, shell },
  );
  return JSON.parse(stdout);
}

function normalizarRemoto(url: string): string {
  return url
    .trim()
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .toLowerCase();
}

/** Mapa remoto-normalizado -> caminho local, varrendo as pastas irmãs. */
export async function mapearClonesLocais(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  // Varre a pasta dos projetos e, um nível abaixo, subpastas (ex.: espanhol/app, espanhol/dados).
  const listar = (base: string): string[] => {
    try {
      return readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
        .map((d) => resolve(base, d.name));
    } catch {
      return [];
    }
  };
  const entradas: string[] = [];
  for (const pasta of listar(config.pastaProjetos)) {
    entradas.push(pasta);
    if (!existsSync(resolve(pasta, ".git"))) entradas.push(...listar(pasta));
  }
  for (const pasta of entradas) {
    if (!existsSync(resolve(pasta, ".git"))) continue;
    try {
      const { stdout } = await execFileAsync("git", ["-C", pasta, "remote", "get-url", "origin"], { windowsHide: true });
      if (stdout.trim()) mapa.set(normalizarRemoto(stdout), pasta);
    } catch {
      /* sem remoto */
    }
  }
  return mapa;
}

/** Devolve o nome do repositório-base se `nome` for satélite; senão null. */
export function baseDoSatelite(nome: string, nomes: Set<string>): string | null {
  for (const sufixo of config.sufixosSatelite) {
    if (nome.endsWith(sufixo)) {
      const base = nome.slice(0, -sufixo.length);
      if (nomes.has(base)) return base;
    }
  }
  return null;
}

/** Cria/atualiza projetos a partir do GitHub. Não apaga nada; só acrescenta, acha clones e liga satélites. */
export async function importarDoGithub(): Promise<{ criados: string[]; satelites: string[]; clones: string[] }> {
  const [repos, clones] = await Promise.all([listarReposGithub(), mapearClonesLocais()]);
  const nomes = new Set(repos.map((r) => r.name));
  const criados: string[] = [];
  const satelites: string[] = [];
  const clonesAchados: string[] = [];

  for (const r of repos) {
    const existente = um<Projeto>("SELECT * FROM projetos WHERE nome = ?", r.name);
    const caminho = clones.get(normalizarRemoto(r.url)) ?? null;
    if (!existente) {
      executar("INSERT INTO projetos (nome, repo, caminho) VALUES (?, ?, ?)", r.name, r.url, caminho);
      criados.push(r.name);
      if (caminho) clonesAchados.push(`${r.name} = ${caminho}`);
    } else if (caminho && existente.caminho !== caminho && !(existente.caminho && existsSync(existente.caminho))) {
      executar("UPDATE projetos SET caminho = ? WHERE id = ?", caminho, existente.id);
      clonesAchados.push(`${r.name} = ${caminho}`);
    }
  }
  for (const r of repos) {
    const base = baseDoSatelite(r.name, nomes);
    if (!base) continue;
    const projBase = um<Projeto>("SELECT * FROM projetos WHERE nome = ?", base);
    const sat = um<Projeto>("SELECT * FROM projetos WHERE nome = ?", r.name);
    if (projBase && sat && sat.satelite_de === null && sat.visivel === 1) {
      executar("UPDATE projetos SET satelite_de = ?, visivel = 0 WHERE id = ?", projBase.id, sat.id);
      satelites.push(`${r.name} -> ${base}`);
    }
  }
  return { criados, satelites, clones: clonesAchados };
}

/** Garante um clone local do projeto e devolve o caminho. */
export async function garantirClone(projeto: Projeto, pastaPai = config.pastaProjetos): Promise<string> {
  if (projeto.caminho && existsSync(projeto.caminho)) return projeto.caminho;
  if (!projeto.repo) throw new Error(`Projeto ${projeto.nome} não tem repositório nem caminho local`);
  const destino = resolve(pastaPai, projeto.nome);
  if (!existsSync(destino)) {
    await execFileAsync(GH, ["repo", "clone", projeto.repo, destino], { windowsHide: true, shell });
  }
  executar("UPDATE projetos SET caminho = ? WHERE id = ?", destino, projeto.id);
  return destino;
}

export function satelitesDe(projetoId: number): Projeto[] {
  return todos<Projeto>("SELECT * FROM projetos WHERE satelite_de = ?", projetoId);
}
