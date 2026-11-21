#!/usr/bin/env node
// Publica uma versão nova do app para a atualização automática (R13).
//
// 1. Sobe a "version" do apps/desktop/package.json (patch por padrão: 0.1.0 -> 0.1.1).
// 2. Gera o instalador (npm run dist), que já sai com o endereço de atualização do .env.production.
// 3. Copia instalador + .blockmap + latest.yml para a pasta de atualizações do servidor (o latest.yml por último:
//    é ele que "liga" a versão nova, então os outros arquivos já estão lá quando a API começa a cobrar).
//
// Uso (na raiz do repositório ou em apps/desktop com npm run release:local):
//   node scripts/publicar-versao.mjs              -> patch (0.1.0 -> 0.1.1)
//   node scripts/publicar-versao.mjs --minor      -> 0.1.0 -> 0.2.0
//   node scripts/publicar-versao.mjs --major      -> 0.1.0 -> 1.0.0
//   node scripts/publicar-versao.mjs --destino D:\resenha-updates
//
// Pasta de destino, nesta ordem: --destino, variável RESENHA_UPDATES_DIR, RESENHA_UPDATES_DIR do deploy/.env,
// e por fim deploy/updates (a pasta que o docker-compose monta por padrão). Nada disso vai para o Git.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps", "desktop");
const args = process.argv.slice(2);

const bump = args.includes("--major") ? "major" : args.includes("--minor") ? "minor" : "patch";
const destination = resolveDestination();

const packageJson = join(desktop, "package.json");
const packageLock = join(desktop, "package-lock.json");
const original = { json: readFileSync(packageJson, "utf8"), lock: readFileSync(packageLock, "utf8") };
const current = JSON.parse(original.json).version;
const next = bumpVersion(current, bump);

console.log(`\nPublicando o Resenha ${current} -> ${next}`);
console.log(`Endereço de atualização gravado no app: ${updatesUrlFromEnv()}`);
console.log(`Pasta de atualizações do servidor: ${destination}\n`);
if (!existsSync(join(desktop, ".env.production")))
  console.warn("Aviso: não achei apps/desktop/.env.production. O instalador vai procurar o servidor em localhost (só serve para teste nesta máquina).\n");

// 1. Versão nova (só package.json e package-lock.json; quem faz o commit é você).
setVersion(next);

// 2. Instalador. Se falhar, volta a versão como estava.
const dist = spawnSync("npm run dist", { cwd: desktop, stdio: "inherit", shell: true });
if (dist.status !== 0) {
  writeFileSync(packageJson, original.json);
  writeFileSync(packageLock, original.lock);
  fail(`O npm run dist falhou. A versão voltou para ${current}.`);
}

// 3. Cópia para o servidor.
const release = join(desktop, "release");
const installer = `Resenha-Setup-${next}.exe`;
for (const file of [installer, `${installer}.blockmap`, "latest.yml"])
  if (!existsSync(join(release, file))) fail(`Não achei ${file} em apps/desktop/release.`);

mkdirSync(destination, { recursive: true });
copyFileSync(join(release, installer), join(destination, installer));
copyFileSync(join(release, `${installer}.blockmap`), join(destination, `${installer}.blockmap`));
// latest.yml por último e de uma vez (copia com outro nome e renomeia), para a API nunca ler um arquivo pela metade.
const temp = join(destination, "latest.yml.tmp");
copyFileSync(join(release, "latest.yml"), temp);
renameSync(temp, join(destination, "latest.yml"));

// Instaladores antigos não servem mais (todo mundo é obrigado a ir para a versão nova). Os .blockmap antigos ficam:
// o electron-updater usa o da versão instalada para baixar só o que mudou.
for (const file of readdirSync(destination))
  if (/^Resenha-Setup-.+\.exe$/i.test(file) && file !== installer) rmSync(join(destination, file));

console.log(`\nPronto: versão ${next} publicada.`);
console.log("- Quem abrir o Resenha agora atualiza sozinho; quem já está com o app aberto atualiza na próxima ação.");
console.log("- Lembre de fazer commit da versão nova (apps/desktop/package.json e package-lock.json).");

// ---------------------------------------------------------------------------

function resolveDestination() {
  const flag = args.indexOf("--destino");
  if (flag >= 0) {
    if (!args[flag + 1]) fail("Faltou a pasta depois de --destino.");
    return absolute(args[flag + 1]);
  }
  if (process.env.RESENHA_UPDATES_DIR) return absolute(process.env.RESENHA_UPDATES_DIR);
  const fromDeploy = readEnvFile(join(root, "deploy", ".env")).RESENHA_UPDATES_DIR;
  if (fromDeploy) return isAbsolute(fromDeploy) ? fromDeploy : resolve(root, "deploy", fromDeploy);
  return join(root, "deploy", "updates");
}

function absolute(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/** KEY=valor por linha, ignorando comentários. Só para ler o que já está no .env, nunca para imprimir. */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith("#")) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

/** Mesmo cálculo do electron-builder.ts (VITE_API_URL do .env/.env.production, padrão localhost:5280). */
function updatesUrlFromEnv() {
  const env = {};
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"])
    Object.assign(env, readEnvFile(join(desktop, name)));
  return `${(env.VITE_API_URL || "http://localhost:5280").replace(/\/+$/, "")}/updates`;
}

function bumpVersion(version, part) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`A versão atual (${version}) não está no formato 1.2.3.`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Troca a versão no package.json e no package-lock.json sem mexer no resto (o npm version também mexeria no Git). */
function setVersion(version) {
  const json = JSON.parse(original.json);
  json.version = version;
  writeFileSync(packageJson, JSON.stringify(json, null, 2) + "\n");
  const lock = JSON.parse(original.lock);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeFileSync(packageLock, JSON.stringify(lock, null, 2) + "\n");
}

function fail(message) {
  console.error(`\n[publicar-versao] ${message}\n`);
  process.exit(1);
}
