/**
 * Centro de Regras — Fonte única da verdade para siglas de categoria.
 * Antes: siglas hardcoded em utils.ts + Produtos.tsx + seeds.
 * Agora: edite pela UI (Configurações > Regras), sem mexer em código.
 */

export const FORMATO_CODIGO = '00000-SIGLA';

const STORAGE_KEY = 'almox_regras_codigo';

export const SIGLAS_PADRAO: Record<string, string> = {
  'MATERIAL DE ESCRITÓRIO': 'MESC',
  'MATERIAL DE LIMPEZA': 'MLIM',
  'FERRAMENTAS': 'FERR',
  'MATERIAL ELÉTRICO': 'MELT',
  'EPI': 'EPI_',
  'INFORMÁTICA': 'INFO',
  'SERVIÇOS': 'SERV',
  'DECORAÇÃO': 'DECO',
  'UTILIDADES': 'UTIL',
  'CONSTRUÇÃO': 'CONST',
  'DESCARTÁVEIS': 'DESC',
  'DIVERSOS': 'DIVE',
  'AUTOMOTIVO': 'AUTO',
  'MÓVEIS': 'MOVE',
  'VESTUÁRIO': 'VEST',
  'ALIMENTOS': 'ALIM',
  'HIDRÁULICO': 'HIDR',
  'EMBALAGEM': 'EMBA',
  'COPA / COZINHA': 'CCOZ',
  'SINALIZAÇÃO': 'SINA',
  'MANUTENÇÃO PREDIAL': 'MPRE',
  'PROTEÇÃO E SEGURANÇA': 'PSEG',
  'ESPORTE E LAZER': 'ELAZ',
  'DIDÁTICO / CULTURAL': 'DCUL',
  'JARDINAGEM': 'JARD',
  'PRIMEIROS SOCORROS': 'PSOC',
  'FONTE COLMEIA': 'FCOL',
  'PRODUTO FONTE COLMEIA': 'PFCO',
  'ÁUDIO E VÍDEO': 'AAVI',
  'ELETRÔNICOS': 'ELET',
  'CABO DE FORÇA DE PC': 'CFPC',
  'CABO DE FORÇA DE IMPRESSORA': 'CFIM',
};

export const CATS_POR_ID: Record<number, string> = {
  1: 'Material de Escritório', 2: 'Material de Limpeza', 3: 'Ferramentas',
  4: 'Material Elétrico', 5: 'EPI', 6: 'Informática', 7: 'Serviços',
  8: 'Decoração', 9: 'Utilidades', 10: 'Construção', 11: 'Descartáveis',
  12: 'Diversos', 13: 'Automotivo', 14: 'Móveis', 15: 'Vestuário',
  16: 'Alimentos', 17: 'Hidráulico', 18: 'Embalagem', 19: 'Copa / Cozinha',
  20: 'Sinalização', 21: 'Manutenção Predial', 22: 'Proteção e Segurança',
  23: 'Esporte e Lazer', 24: 'Didático / Cultural', 25: 'Jardinagem',
  26: 'Primeiros Socorros', 27: 'Fonte Colmeia', 28: 'Produto Fonte Colmeia',
  29: 'Áudio e Vídeo', 30: 'Eletrônicos', 31: 'Cabo de Força de PC',
  32: 'Cabo de Força de Impressora',
};

function normNome(nome: string): string {
  return nome.toUpperCase().trim();
}

/** Carrega overrides do usuário (localStorage) mesclados com o padrão. */
export function loadRegras(): Record<string, string> {
  let custom: Record<string, string> = {};
  try {
    custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { custom = {}; }
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(custom)) {
    norm[normNome(k)] = String(v).toUpperCase().slice(0, 4).padEnd(4, '_');
  }
  return { ...SIGLAS_PADRAO, ...norm };
}

export function saveRegras(regras: Record<string, string>) {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(regras)) {
    const sigla = String(v).toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 4);
    if (sigla.length === 4) norm[normNome(k)] = sigla;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(norm));
}

export function resetRegras() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Retorna a sigla vigente (UI > padrão > fallback). */
export function getSigla(catNome?: string | null, catId?: number | null): string {
  const regras = loadRegras();
  if (catNome) {
    const n = normNome(catNome);
    if (regras[n]) return regras[n];
    const fb = n.replace(/[^A-Z]/g, '').substring(0, 4);
    if (fb.length >= 2) return fb.padEnd(4, '_');
  }
  if (catId && CATS_POR_ID[catId]) {
    const n = normNome(CATS_POR_ID[catId]);
    if (regras[n]) return regras[n];
  }
  return 'PROD';
}

export function previewCodigo(numero: number, sigla: string): string {
  return `${String(numero).padStart(5, '0')}-${sigla}`;
}
