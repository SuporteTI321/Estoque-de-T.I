// ============================================================================
//  security — Camada de segurança centralizada para o Estoque de T.I.
//  Rate limiting, sanitização, validação e proteção de credenciais.
// ============================================================================

// ---- Rate Limiter (login) ----

const LOGIN_ATTEMPTS_KEY = "sec_login_attempts";
const LOGIN_LOCKOUT_KEY = "sec_login_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

export interface LoginAttemptInfo {
  attempts: number;
  lockedUntil: number | null;
}

/** Retorna o estado atual de tentativas de login */
export function getLoginAttemptInfo(): LoginAttemptInfo {
  try {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    const lockRaw = localStorage.getItem(LOGIN_LOCKOUT_KEY);
    const attempts = raw ? parseInt(raw, 10) || 0 : 0;
    const lockedUntil = lockRaw ? parseInt(lockRaw, 10) || null : null;

    // Verifica se o lockout expirou
    if (lockedUntil && Date.now() > lockedUntil) {
      localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
      localStorage.removeItem(LOGIN_LOCKOUT_KEY);
      return { attempts: 0, lockedUntil: null };
    }

    return { attempts, lockedUntil };
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

/** Registra uma tentativa de login falha. Retorna true se bloqueou. */
export function recordLoginFailure(): boolean {
  const info = getLoginAttemptInfo();
  const newAttempts = info.attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, String(newAttempts));
    localStorage.setItem(LOGIN_LOCKOUT_KEY, String(lockUntil));
    return true; // bloqueou
  }

  localStorage.setItem(LOGIN_ATTEMPTS_KEY, String(newAttempts));
  return false;
}

/** Limpa tentativas após login bem-sucedido */
export function clearLoginAttempts(): void {
  localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
  localStorage.removeItem(LOGIN_LOCKOUT_KEY);
}

/** Retorna segundos restantes de lockout (0 se não bloqueado) */
export function getLockoutRemainingSeconds(): number {
  const info = getLoginAttemptInfo();
  if (!info.lockedUntil) return 0;
  const remaining = Math.max(0, Math.ceil((info.lockedUntil - Date.now()) / 1000));
  return remaining;
}

/** Verifica se a conta está bloqueada */
export function attemptsLocked(info: LoginAttemptInfo): boolean {
  if (!info.lockedUntil) return false;
  return Date.now() < info.lockedUntil;
}

// ---- Sanitização de Output (XSS prevention) ----

/** Escapa caracteres perigosos para inserção segura em HTML */
export function escHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa para uso em atributos de URL */
export function escUrl(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

// ---- Validação de Input ----

/** Valida se o email tem formato válido */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Valida se a senha atende critérios mínimos de segurança */
export function validatePasswordStrength(senha: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (senha.length < 8) errors.push("Mínimo de 8 caracteres");
  if (senha.length > 128) errors.push("Máximo de 128 caracteres");
  if (!/[A-Z]/.test(senha)) errors.push("Pelo menos 1 letra maiúscula");
  if (!/[a-z]/.test(senha)) errors.push("Pelo menos 1 letra minúscula");
  if (!/[0-9]/.test(senha)) errors.push("Pelo menos 1 número");
  if (/^[a-zA-Z0-9]+$/.test(senha)) errors.push("Pelo menos 1 caractere especial");
  return { valid: errors.length === 0, errors };
}

// ---- Proteção de Credenciais ----

/**
 * Remove campos sensíveis de um objeto usuário antes de persistir em storage.
 * NUNCA salve senha, hash ou token em localStorage/sessionStorage.
 */
export function sanitizeUserForStorage(user: any): any {
  if (!user) return user;
  const { senha: _, senha_hash: _h, token: _t, ...safe } = user as any;
  return safe;
}

/**
 * Valida se uma string parece ser um hash Argon2 válido.
 * Usado para decidir se pode ser verificado com hash-wasm.
 */
export function isArgon2Hash(s: string): boolean {
  return /^\$argon2(id|i|d)\$/.test(s);
}

/**
 * Remove logs de credenciais.
 * Em produção, esta função substitui console.log que contenham dados sensíveis.
 */
export function safeLog(_msg: string, ..._args: any[]): void {
  // Em desenvolvimento, pode ser útil habilitar:
  // if (import.meta.env.DEV) console.log(msg, ...args);
  // Em produção, log silencioso (não vaza dados)
}

// ---- CSRF Token (para futuras APIs HTTP) ----

let _csrfToken: string | null = null;

export function getCsrfToken(): string {
  if (_csrfToken) return _csrfToken;
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  _csrfToken = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  return _csrfToken;
}

// ---- Content Security Policy Helpers ----

/** Gera nonce único para scripts inline (se necessário no futuro) */
export function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

// ---- Validação de Dados de Importação ----

/** Chaves permitidas em imports (whitelist) */
const IMPORT_KEYS = new Set([
  "almox_lojas", "almox_categorias", "almox_fornecedores", "almox_produtos",
  "almox_usuarios", "almox_movimentacoes", "almox_solicitacoes",
  "almox_solicitacao_itens", "almox_pedidos", "almox_pedido_itens", "almox_alertas",
  // Variantes sem prefixo
  "lojas", "categorias", "fornecedores", "produtos", "usuarios",
  "movimentacoes", "solicitacoes", "solicitacao_itens", "pedidos",
  "pedido_itens", "alertas",
]);

/**
 * Valida se uma chave de importação é permitida.
 * Previne injeção de dados sensíveis (como tokens, configs).
 */
export function isImportKeyAllowed(key: string): boolean {
  return IMPORT_KEYS.has(key);
}

/**
 * Valida se o valor de uma chave de importação é seguro (array).
 */
export function isImportValueSafe(value: any): boolean {
  return Array.isArray(value) && value.length >= 0;
}

// ---- Secure Storage (wrapper sobre sessionStorage com limpeza) ----

const SECURE_PREFIX = "__sec_";

/**
 * Salva dados em sessionStorage com prefixo seguro.
 * Dados são limpos automaticamente ao fechar a aba.
 */
export function secureSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(SECURE_PREFIX + key, value);
  } catch {}
}

export function secureSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(SECURE_PREFIX + key);
  } catch {
    return null;
  }
}

export function secureSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(SECURE_PREFIX + key);
  } catch {}
}

/** Limpa todos os dados seguros da sessão */
export function clearSecureSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SECURE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch {}
}

// ---- Constantes de Segurança ----

export const SECURITY_CONSTANTS = {
  MAX_ATTEMPTS: MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS: LOCKOUT_DURATION_MS,
  MAX_PASSWORD_LENGTH: 128,
  MIN_PASSWORD_LENGTH: 8,
  SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 horas
} as const;
