// ============================================================================
//  vault — Cofre criptografado para API keys (Supabase, GitHub, etc.)
//  Só quem tem a senha mestra consegue descriptografar.
//  Usa Web Crypto: PBKDF2 (100k iter) + AES-GCM 256. Nada vai para o disco
//  em texto puro. A senha fica apenas em memória (sessão).
// ============================================================================

const VAULT_KEY = "vault_enc";
// SEGURANÇA: Senha fica APENAS em memória (variável JS). Nunca em storage.
// Antes: sessionStorage (acessível via XSS). Agora: só em RAM.
let cachedPassword: string | null = null;
let cachedSecrets: Record<string, string> | null = null;

function b64encode(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptVault(obj: Record<string, string>, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt));
  // blob = salt(16) + iv(12) + ct
  const blob = new Uint8Array(salt.length + iv.length + ct.length);
  blob.set(salt, 0);
  blob.set(iv, salt.length);
  blob.set(ct, salt.length + iv.length);
  return b64encode(blob);
}

export async function decryptVault(blobB64: string, password: string): Promise<Record<string, string>> {
  const blob = b64decode(blobB64);
  const salt = blob.slice(0, 16);
  const iv = blob.slice(16, 28);
  const ct = blob.slice(28);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- API de sessão ----

export function hasVault(): boolean {
  return !!localStorage.getItem(VAULT_KEY);
}

export function isUnlocked(): boolean {
  return !!cachedSecrets && !!cachedPassword;
}

export async function unlockVault(password: string): Promise<boolean> {
  const blob = localStorage.getItem(VAULT_KEY);
  if (!blob) return false;
  try {
    const secrets = await decryptVault(blob, password);
    cachedPassword = password;
    cachedSecrets = secrets;
    // SEGURANÇA: Senha NÃO é persistida em sessionStorage.
    // Fica apenas em memória — ao fechar a aba, perde-se a sessão.
    return true;
  } catch {
    return false;
  }
}

export function lockVault(): void {
  cachedPassword = null;
  cachedSecrets = null;
  // Senha só estava em memória — nada para limpar de storage
}

/** Tenta restaurar sessão anterior (mesma aba). */
export async function tryRestoreSession(): Promise<boolean> {
  // SEGURANÇA: Senha não está mais em sessionStorage.
  // Sessão só pode ser restaurada se o usuário digitar a senha novamente.
  return false;
}

async function saveVault(secrets: Record<string, string>, password: string): Promise<void> {
  const newBlob = await encryptVault(secrets, password);
  localStorage.setItem(VAULT_KEY, newBlob);
  cachedPassword = password;
  cachedSecrets = secrets;
  // SEGURANÇA: Senha persistida APENAS em memória
}

export async function createOrUpdateVault(patch: Record<string, string>, password: string): Promise<void> {
  let secrets: Record<string, string> = {};
  const blob = localStorage.getItem(VAULT_KEY);
  if (blob) {
    try {
      secrets = await decryptVault(blob, password);
    } catch {
      throw new Error("Senha incorreta para o cofre existente");
    }
  }
  Object.assign(secrets, patch);
  await saveVault(secrets, password);
  // Remove chaves legadas em texto puro (migração)
  localStorage.removeItem("cloud_url");
  localStorage.removeItem("cloud_key");
  localStorage.removeItem("sync_github_token");
}

/** Remove chaves do cofre sem mutar o cache vivo (recria o objeto). */
export async function removeVaultSecrets(keys: string[], password: string): Promise<void> {
  const blob = localStorage.getItem(VAULT_KEY);
  if (!blob) return;
  const secrets = await decryptVault(blob, password); // lança se senha incorreta
  for (const k of keys) delete secrets[k];
  await saveVault({ ...secrets }, password);
}

export function getVaultSecrets(): Record<string, string> | null {
  return cachedSecrets;
}

export function getVaultPassword(): string | null {
  return cachedPassword;
}
