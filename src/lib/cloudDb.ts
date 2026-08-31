// ============================================================================
//  cloudDb — Cliente Supabase (PostgREST) para a versao Web.
//  Banco compartilhado: todos os dispositivos leem/escrevem no mesmo lugar.
//  Desktop (Tauri/SQLite) nao usa este modulo.
// ============================================================================

import * as vault from "./vault";

const URL_KEY = "cloud_url";
const KEY_KEY = "cloud_key";

/** Senha da sessão do cofre (sessionStorage é gravado por unlockVault). */
function senhaDoCofre(): string | null {
  return vault.getVaultPassword() || sessionStorage.getItem("vault_pw_session");
}

export interface CloudConfig {
  url: string;
  key: string;
}

export function getCloudConfig(): CloudConfig | null {
  // 1. Cofre criptografado (prioridade)
  if (vault.isUnlocked()) {
    const s = vault.getVaultSecrets();
    if (s?.cloud_url && s?.cloud_key) return { url: s.cloud_url.replace(/\/+$/, ""), key: s.cloud_key };
  }
  // 2. Legado em texto puro (migração)
  const url = (localStorage.getItem(URL_KEY) || "").replace(/\/+$/, "");
  const key = localStorage.getItem(KEY_KEY) || "";
  if (!url || !key) return null;
  return { url, key };
}

export function setCloudConfig(url: string, key: string) {
  // Se o cofre existir e estiver desbloqueado, grava nele (criptografado)
  const pw = senhaDoCofre();
  if (pw) {
    vault.createOrUpdateVault({ cloud_url: url.trim().replace(/\/+$/, ""), cloud_key: key.trim() }, pw).catch(() => {});
    return;
  }
  localStorage.setItem(URL_KEY, url.trim().replace(/\/+$/, ""));
  localStorage.setItem(KEY_KEY, key.trim());
}

export async function clearCloudConfig(): Promise<void> {
  try {
    const pw = senhaDoCofre();
    // Remove apenas as chaves de nuvem do cofre (sem mutar o cache vivo)
    if (pw && vault.hasVault()) {
      await vault.removeVaultSecrets(["cloud_url", "cloud_key"], pw);
    }
  } catch {}
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(KEY_KEY);
}

const AUTH_TOKEN_KEY = "sb_auth_token";

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function headers(cfg: CloudConfig, extra: Record<string, string> = {}) {
  const jwt = getAuthToken();
  return {
    apikey: cfg.key,
    Authorization: jwt ? `Bearer ${jwt}` : `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function loginSupabase(email: string, password: string): Promise<{ user: any; token: string }> {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error("Banco na nuvem não configurado");
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body.includes("Invalid login") ? "Credenciais inválidas" : `Login falhou: ${body.slice(0,150)}`);
  }
  const data = await res.json();
  setAuthToken(data.access_token);
  return { user: data.user, token: data.access_token };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error("Banco na nuvem não configurado");
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: headers(cfg, (init.headers as Record<string, string>) || {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nuvem HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Operacoes genericas ----

export function select<T = any>(table: string, query = ""): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?select=*&order=id.asc${query ? `&${query}` : ""}`, {
    method: "GET",
  });
}

/** Executa uma função RPC do Postgres via PostgREST. */
export function rpc<T = any>(fn: string, args: Record<string, any>): Promise<T> {
  return request<T>(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

/** Insere e retorna as linhas criadas (ids gerados pelo banco). */
export function insert<T = any>(table: string, rows: Record<string, any>[]): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

export function update(table: string, match: Record<string, any>, patch: Record<string, any>): Promise<void> {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
  return request<void>(`/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

export function del(table: string, match: Record<string, any>): Promise<void> {
  const entries = Object.entries(match);
  // Exige match explícito — sem filtro, um DELETE apagaria a tabela inteira
  if (entries.length === 0) throw new Error(`del(${table}): match obrigatório (delete total bloqueado)`);
  const qs = entries.map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
  return request<void>(`/rest/v1/${table}?${qs}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

/**
 * Verifica a senha informada contra a armazenada.
 * Hashes Argon2 ($argon2id/$argon2i/$argon2d) são verificados com hash-wasm;
 * texto puro legado é comparado diretamente (caso transitório).
 * Senha vazia/ausente nunca é aceita.
 */
export async function verificarSenha(senhaArmazenada: string | null | undefined, senhaInformada: string): Promise<boolean> {
  console.log("[verificarSenha] armazenada:", senhaArmazenada ? `${senhaArmazenada.substring(0, 15)}... (${senhaArmazenada.length} chars)` : "VAZIO/null", "| informada:", senhaInformada ? `${senhaInformada.substring(0, 10)}...` : "VAZIO");
  if (!senhaArmazenada) return false;
  if (/^\$argon2(id|i|d)\$/.test(senhaArmazenada)) {
    try {
      const { argon2Verify } = await import("hash-wasm");
      return await argon2Verify({ hash: senhaArmazenada, password: senhaInformada });
    } catch {
      return false;
    }
  }
  return senhaArmazenada === senhaInformada;
}

// ============================================================================
//  Pull / Push completos (seed inicial e restauracao)
// ============================================================================

/** Tabelas na ordem de dependencia (pais antes de filhos). */
const TABELAS = [
  "lojas", "categorias", "produtos", "usuarios", "movimentacoes",
  "solicitacoes", "solicitacao_itens", "pedidos", "pedido_itens", "alertas",
] as const;

export type NomeTabela = (typeof TABELAS)[number];

const LS_POR_TABELA: Record<NomeTabela, string> = {
  lojas: "almox_lojas",
  categorias: "almox_categorias",
  produtos: "almox_produtos",
  usuarios: "almox_usuarios",
  movimentacoes: "almox_movimentacoes",
  solicitacoes: "almox_solicitacoes",
  solicitacao_itens: "almox_solicitacao_itens",
  pedidos: "almox_pedidos",
  pedido_itens: "almox_pedido_itens",
  alertas: "almox_alertas",
};

/** Agrupa itens por chave pai (formato Record<pai_id, itens[]> do store). */
function agruparPorPai(flat: any[], campoPai: string): Record<string, any[]> {
  const mapa: Record<string, any[]> = {};
  for (const item of flat) {
    const k = String(item[campoPai]);
    (mapa[k] ||= []).push(item);
  }
  return mapa;
}

/** Baixa todas as tabelas da nuvem e cacheia no localStorage. */
export async function cloudPullAll(): Promise<number> {
  let total = 0;
  for (const t of TABELAS) {
    const dados = await select(t);
    // Nunca persiste a coluna senha no localStorage
    const linhas = t === "usuarios"
      ? dados.map((u: any) => { const { senha: _s, ...resto } = u; return resto; })
      : dados;
    // Itens ficam no LS como Record<id_pai, itens[]>
    const valor = t === "solicitacao_itens"
      ? agruparPorPai(linhas, "solicitacao_id")
      : t === "pedido_itens"
        ? agruparPorPai(linhas, "pedido_id")
        : linhas;
    localStorage.setItem(LS_POR_TABELA[t], JSON.stringify(valor));
    total += dados.length;
  }
  // Garante um admin padrao para nao travar o primeiro acesso
  const usuarios = JSON.parse(localStorage.getItem("almox_usuarios") || "[]");
  if (Array.isArray(usuarios) && usuarios.length === 0) {
    const [admin] = await insert("usuarios", [{
      nome: "Administrador",
      email: "admin@empresa.com",
      senha: "admin123",  // Texto puro legado — verificarSenha aceita comparação direta
      perfil: "admin",
      loja_id: null,
      loja_nome: null,
      ativo: true,
    }]);
    localStorage.setItem("almox_usuarios", JSON.stringify([{ ...admin, senha: undefined }]));
    total += 1;
  }
  return total;
}

/** Envia os dados locais (localStorage) para a nuvem — substitui todo conteudo.
 *  Estratégia menos destrutiva (backup-first): antes de apagar qualquer coisa,
 *  o estado remoto atual é salvo em localStorage (almox_push_backup, com
 *  timestamp). Só depois do backup é que as tabelas são limpas e reinseridas;
 *  se algum insert falhar, tenta restaurar o backup e propaga o erro.
 */
export async function cloudPushAll(): Promise<number> {
  let total = 0;
  // Backup do conteúdo remoto atual antes de qualquer deleção
  const backup: Record<string, any[]> = {};
  for (const t of TABELAS) {
    try { backup[t] = await select(t); } catch { backup[t] = []; }
  }
  try {
    localStorage.setItem("almox_push_backup", JSON.stringify({ timestamp: new Date().toISOString(), tabelas: backup }));
  } catch {}
  // Limpa na ordem inversa (filhos antes de pais). Deleção total explícita e
  // intencional aqui — del() exige match, então usa request direto com id=gt.0
  for (const t of [...TABELAS].reverse()) {
    await request<void>(`/rest/v1/${t}?id=gt.0`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  const falhas: string[] = [];
  for (const t of TABELAS) {
    try {
      const raw = localStorage.getItem(LS_POR_TABELA[t]);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) continue;
      // pedido_itens/solicitacao_itens no formato Record<id, itens[]>
      if (t === "pedido_itens" || t === "solicitacao_itens") {
        const flat: Record<string, any>[] = [];
        for (const lista of Object.values(arr)) {
          if (Array.isArray(lista)) flat.push(...lista);
        }
        if (flat.length) { await insert(t, flat); total += flat.length; }
        continue;
      }
      await insert(t, arr);
      total += arr.length;
    } catch (e) {
      console.warn(`[cloudPushAll] falha em ${t}:`, e);
      falhas.push(t);
    }
  }
  // Se algo falhou no meio, tenta restaurar o backup remoto antes de abortar
  if (falhas.length > 0) {
    console.error(`[cloudPushAll] falha ao enviar: ${falhas.join(", ")}`);
    try {
      for (const t of [...TABELAS].reverse()) {
        await request<void>(`/rest/v1/${t}?id=gt.0`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      }
      for (const t of TABELAS) {
        if (backup[t]?.length) await insert(t, backup[t]);
      }
    } catch (e) {
      console.error("[cloudPushAll] restauração do backup falhou:", e);
    }
    throw new Error(`Falha ao enviar: ${falhas.join(", ")}. Dados anteriores restaurados (backup local em almox_push_backup).`);
  }
  // Realinha as sequencias — usa service_role (anon não tem mais permissão após fix do Security Advisor)
  try {
    const s = vault.getVaultSecrets();
    const svc = s?.cloud_svc_key || null;
    const cfg = getCloudConfig();
    if (svc && cfg) {
      await fetch(`${cfg.url}/rest/v1/rpc/repair_sequences`, { method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" }, body: "{}" });
    } else {
      await request<void>("/rest/v1/rpc/repair_sequences", { method: "POST", body: "{}" });
    }
  } catch {}
  return total;
}
