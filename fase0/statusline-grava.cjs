// Comando de status line: recebe o JSON pela entrada padrão e anexa num arquivo.
const fs = require("node:fs");
const path = require("node:path");
let dados = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (p) => (dados += p));
process.stdin.on("end", () => {
  const out = path.resolve(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  fs.appendFileSync(path.resolve(out, "05-statusline.jsonl"), dados.trim() + "\n");
  process.stdout.write("claudio");
});
