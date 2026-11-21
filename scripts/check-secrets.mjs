#!/usr/bin/env node
// Verificação de segredos e dados pessoais antes de commit/push.
// O repositório é público: só o código pode ir para o Git.
//
// Uso:
//   node scripts/check-secrets.mjs            -> arquivos no stage (pre-commit)
//   node scripts/check-secrets.mjs --all      -> todos os arquivos versionados (pre-push)
//   node scripts/check-secrets.mjs --history  -> todo o histórico do Git (antes de publicar)
//
// Para liberar uma linha que é falso positivo, inclua o comentário "check-secrets: ignore" nela.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const mode = process.argv.includes("--history") ? "history" : process.argv.includes("--all") ? "all" : "staged";
const IGNORE_MARK = "check-secrets: ignore";

// 1) Caminhos que nunca podem ser versionados.
const FORBIDDEN_PATHS = [
  [/(^|\/)\.env(\.(?!example$)[^/]+)?$/i, "arquivo .env (use o .env.example)"],
  [/(^|\/)appsettings\.Development\.json$/i, "appsettings.Development.json (use o .example)"],
  [/(^|\/)appsettings\.[^/]*\.local\.json$/i, "appsettings local"],
  [/\.(db|db-shm|db-wal|sqlite|sqlite3)$/i, "banco de dados"],
  [/(^|\/)\.data\//, "dados locais (.data/: uploads, fotos)"],
  [/\.(pem|key|pfx|p12)$/i, "chave ou certificado"],
];

// 2) Padrões genéricos de segredo no conteúdo.
const CONTENT_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada"],
  [/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/, "token do GitHub"],
  [/\bAKIA[0-9A-Z]{16}\b/, "chave de acesso de nuvem"],
];

// 3) Valores reais dos segredos locais (arquivos ignorados). Se algum aparecer no conteúdo, bloqueia.
const knownSecrets = loadLocalSecrets();

const problems = [];

if (mode === "history") {
  checkHistory();
} else {
  const files = mode === "all"
    ? git(["ls-files", "-z"]).split("\0").filter(Boolean)
    : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean);
  for (const file of files) checkFile(file);
}

if (problems.length > 0) {
  console.error("\n[check-secrets] Bloqueado: encontrei possível segredo ou dado pessoal.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nTire o arquivo do stage (git restore --staged <arquivo>) ou mova o valor para .env / appsettings.Development.json.");
  console.error(`Se for falso positivo, adicione "${IGNORE_MARK}" na linha.\n`);
  process.exit(1);
}
console.log(`[check-secrets] OK (${mode}).`);

// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function checkFile(file) {
  for (const [re, label] of FORBIDDEN_PATHS) {
    if (re.test(file)) {
      problems.push(`${file}: ${label} não pode ser versionado`);
      return;
    }
  }
  let buf;
  try {
    buf = mode === "staged"
      ? execFileSync("git", ["show", `:${file}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
      : readFileSync(join(root, file));
  } catch {
    return; // arquivo removido ou ilegível
  }
  if (buf.includes(0)) return; // binário
  checkText(buf.toString("utf8"), file);
}

function checkText(text, where) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(IGNORE_MARK)) return;
    const loc = `${where}:${i + 1}`;
    for (const [re, label] of CONTENT_PATTERNS) {
      if (re.test(line)) problems.push(`${loc}: ${label}`);
    }
    for (const { value, source } of knownSecrets) {
      if (line.includes(value)) problems.push(`${loc}: contém o valor real de ${source}`);
    }
    for (const ip of line.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) {
      if (isPublicIp(ip)) problems.push(`${loc}: IP público ${ip} (deixe IPs em .env)`);
    }
  });
}

function checkHistory() {
  // Caminhos proibidos em qualquer commit.
  const allPaths = new Set(git(["log", "--all", "--name-only", "--format="]).split(/\r?\n/).filter(Boolean));
  for (const file of allPaths) {
    for (const [re, label] of FORBIDDEN_PATHS) {
      if (re.test(file)) problems.push(`histórico: ${file} (${label}) já foi commitado`);
    }
  }
  // Conteúdo adicionado em qualquer commit.
  const log = git(["log", "--all", "-p", "--no-color", "--format=commit %h"]);
  let commit = "?";
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith("commit ")) commit = line.slice(7);
    else if (line.startsWith("+") && !line.startsWith("+++")) checkText(line.slice(1), `commit ${commit}`);
  }
}

function isPublicIp(ip) {
  const p = ip.split(".").map(Number);
  if (p.some((n) => n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0 && p[2] === 2) return false; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark
  if (a === 198 && b === 51 && p[2] === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && p[2] === 113) return false; // TEST-NET-3
  return true;
}

function loadLocalSecrets() {
  const out = [];
  const add = (value, source) => {
    if (typeof value === "string" && value.length >= 8 && !/troque|change|example|exemplo/i.test(value)) {
      out.push({ value, source });
    }
  };
  // Arquivos .env locais: chaves com KEY/SECRET/PASSWORD/TOKEN/IP.
  for (const envFile of ["infra/.env", ".env", "apps/desktop/.env", "server/api/.env"]) {
    const path = join(root, envFile);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*?)"?\s*$/i);
      if (!m) continue;
      const [, name, value] = m;
      if (/KEY|SECRET|PASS|TOKEN/i.test(name)) add(value, `${envFile} (${name})`);
      if (/IP|HOST/i.test(name) && isPublicIp(value)) add(value, `${envFile} (${name})`);
    }
  }
  // appsettings locais: qualquer texto sob chaves com Key/Secret/Password/Connection.
  for (const jsonFile of ["server/api/appsettings.Development.json"]) {
    const path = join(root, jsonFile);
    if (!existsSync(path)) continue;
    try {
      walk(JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")), "", jsonFile);
    } catch {
      /* JSON inválido: ignora */
    }
  }
  return out;

  function walk(node, keyPath, source) {
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, keyPath ? `${keyPath}:${k}` : k, source);
    } else if (/key|secret|password|connection/i.test(keyPath)) {
      add(node, `${source} (${keyPath})`);
    }
  }
}
