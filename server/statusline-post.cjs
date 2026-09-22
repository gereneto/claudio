// Comando de status line usado pela sessão sentinela do Claudio: envia o JSON recebido ao servidor.
const http = require("node:http");
const porta = Number(process.env.CLAUDIO_PORTA || 3737);
let dados = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (p) => (dados += p));
process.stdin.on("end", () => {
  const req = http.request(
    { host: "127.0.0.1", port: porta, path: "/hooks/statusline", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(dados) } },
    (res) => res.resume(),
  );
  req.on("error", () => undefined);
  req.end(dados);
  process.stdout.write("claudio");
});
