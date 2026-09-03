// ============================================================================
//  BrowserStore — localStorage fallback persistence
// ============================================================================

import type {
  Loja, Categoria, Produto, Usuario, Movimentacao,
  Solicitacao, SolicitacaoItem, Pedido, PedidoItem, Alerta, DashboardStats
} from "./types";
import { getCloudConfig, verificarSenha } from "./cloudDb";
import { remoteCall } from "./remoteApi";
import * as vault from "./vault";
import { printHtml, type TamanhoEtiqueta } from "./printHtml";
import { getLoginAttemptInfo, recordLoginFailure, clearLoginAttempts, attemptsLocked } from "./security";

function loadFromLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

function persist<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export class BrowserStore {
  lojas: Loja[] = [];
  categorias: Categoria[] = [];
  produtos: Produto[] = [];
  usuarios: Usuario[] = [];
  movimentacoes: Movimentacao[] = [];
  solicitacoes: Solicitacao[] = [];
  pedidos: Pedido[] = [];
  alertas: Alerta[] = [];
  itens: Record<number, SolicitacaoItem[]> = {};

  constructor() {
    this.lojas = loadFromLS("almox_lojas", []);
    this.categorias = loadFromLS("almox_categorias", []);
    this.produtos = loadFromLS("almox_produtos", []);
    this.usuarios = loadFromLS("almox_usuarios", []);
    this.movimentacoes = loadFromLS("almox_movimentacoes", []);
    this.solicitacoes = loadFromLS("almox_solicitacoes", []);
    this.pedidos = loadFromLS("almox_pedidos", []);
    this.alertas = loadFromLS("almox_alertas", []);
    this.itens = loadFromLS("almox_solicitacao_itens", {});
    this.pedidoItens = loadFromLS("almox_pedido_itens", {});
  }

  // ---- Lojas ----
  getLojas() { return this.lojas; }
  setLojas(lojas: Loja[]) { this.lojas = lojas; persist("almox_lojas", lojas); }
  addLoja(l: Loja) { this.lojas.push(l); persist("almox_lojas", this.lojas); return l; }
  updateLoja(l: Loja) {
    this.lojas = this.lojas.map(x => x.id === l.id ? l : x);
    persist("almox_lojas", this.lojas);
    return l;
  }
  removeLoja(id: number) {
    this.lojas = this.lojas.filter(x => x.id !== id);
    persist("almox_lojas", this.lojas);
  }

  // ---- Categorias ----
  getCategorias() { return this.categorias; }
  setCategorias(arr: Categoria[]) { this.categorias = arr; persist("almox_categorias", arr); }
  addCategoria(c: Categoria) { this.categorias.push(c); persist("almox_categorias", this.categorias); return c; }
  updateCategoria(c: Categoria) {
    this.categorias = this.categorias.map(x => x.id === c.id ? c : x);
    persist("almox_categorias", this.categorias); return c;
  }
  removeCategoria(id: number) {
    this.categorias = this.categorias.filter(x => x.id !== id);
    persist("almox_categorias", this.categorias);
  }

  // ---- Produtos ----
  getProdutos() { return this.produtos; }
  setProdutos(arr: Produto[]) { this.produtos = arr; persist("almox_produtos", arr); }
  addProduto(p: Produto) { this.produtos.push(p); persist("almox_produtos", this.produtos); return p; }
  updateProduto(p: Produto) {
    this.produtos = this.produtos.map(x => x.id === p.id ? p : x);
    persist("almox_produtos", this.produtos);
    return p;
  }
  removeProduto(id: number) {
    this.produtos = this.produtos.filter(x => x.id !== id);
    persist("almox_produtos", this.produtos);
  }

  // ---- Usuarios ----
  getUsuarios() { return this.usuarios; }
  setUsuarios(arr: Usuario[]) { this.usuarios = arr; persist("almox_usuarios", arr); }
  addUsuario(u: Usuario) { this.usuarios.push(u); persist("almox_usuarios", this.usuarios); return u; }
  updateUsuario(u: Usuario) {
    this.usuarios = this.usuarios.map(x => x.id === u.id ? u : x);
    persist("almox_usuarios", this.usuarios);
    return u;
  }
  removeUsuario(id: number) {
    this.usuarios = this.usuarios.filter(x => x.id !== id);
    persist("almox_usuarios", this.usuarios);
  }

  // ---- Movimentacoes ----
  getMovimentacoes() { return this.movimentacoes; }
  setMovimentacoes(arr: Movimentacao[]) { this.movimentacoes = arr; persist("almox_movimentacoes", arr); }
  addMovimentacao(m: Movimentacao) {
    this.movimentacoes.unshift(m);
    persist("almox_movimentacoes", this.movimentacoes);
    return m;
  }
  updateMovimentacao(id: number, data: Partial<Movimentacao>) {
    const idx = this.movimentacoes.findIndex(x => x.id === id);
    if (idx >= 0) {
      this.movimentacoes[idx] = { ...this.movimentacoes[idx], ...data };
      persist("almox_movimentacoes", this.movimentacoes);
    }
    return this.movimentacoes.find(x => x.id === id);
  }
  removeMovimentacao(id: number) {
    this.movimentacoes = this.movimentacoes.filter(x => x.id !== id);
    persist("almox_movimentacoes", this.movimentacoes);
  }

  // ---- Solicitacoes ----
  getSolicitacoes() { return this.solicitacoes; }
  setSolicitacoes(arr: Solicitacao[]) { this.solicitacoes = arr; persist("almox_solicitacoes", arr); }
  addSolicitacao(s: Solicitacao) { this.solicitacoes.unshift(s); persist("almox_solicitacoes", this.solicitacoes); return s; }
  getItens(solicitacao_id: number) { return this.itens[solicitacao_id] ?? []; }
  addItem(solicitacao_id: number, item: SolicitacaoItem) {
    this.itens[solicitacao_id] = [...(this.itens[solicitacao_id] ?? []), item];
    persist("almox_solicitacao_itens", this.itens);
  }
  removeItem(solicitacao_id: number, id: number) {
    this.itens[solicitacao_id] = (this.itens[solicitacao_id] ?? []).filter(i => i.id !== id);
    persist("almox_solicitacao_itens", this.itens);
  }

  // ---- Pedidos ----
  getPedidos() { return this.pedidos; }
  setPedidos(arr: Pedido[]) { this.pedidos = arr; persist("almox_pedidos", arr); }
  addPedido(p: Pedido) { this.pedidos.unshift(p); persist("almox_pedidos", this.pedidos); return p; }
  removePedido(id: number) { this.pedidos = this.pedidos.filter(p => p.id !== id); persist("almox_pedidos", this.pedidos); }
  pedidoItens: Record<number, PedidoItem[]> = {};
  getPedidoItens(pedido_id: number) { return this.pedidoItens[pedido_id] ?? []; }
  setPedidoItens(pedido_id: number, itens: Omit<PedidoItem, "id" | "pedido_id">[]) {
    const lista: PedidoItem[] = itens.map((item, i) => ({
      ...item,
      id: i + 1,
      pedido_id,
    }));
    this.pedidoItens[pedido_id] = lista;
    persist("almox_pedido_itens", this.pedidoItens);
  }
  removePedidoItens(pedido_id: number) {
    delete this.pedidoItens[pedido_id];
    persist("almox_pedido_itens", this.pedidoItens);
  }

  // ---- Alertas ----
  getAlertas() { return this.alertas; }
  setAlertas(arr: Alerta[]) { this.alertas = arr; persist("almox_alertas", arr); }
  markAlertaLido(id: number) {
    this.alertas = this.alertas.map(a => a.id === id ? { ...a, lido: true } : a);
    persist("almox_alertas", this.alertas);
  }
}

export const store = new BrowserStore();

// ============================================================================
//  Tauri API wrapper — falls back to store on error
// ============================================================================

let _invoke: any = null;
async function getInvoke() {
  if (_invoke) return _invoke;
  // No browser (GitHub Pages), skip Tauri import entirely
  if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) {
    return null;
  }
  try {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke;
    return _invoke;
  } catch {
    return null;
  }
}

// Auto-sync: push para GitHub apos cada operacao (Desktop only)
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;
export function triggerAutoSync() {
  // Debounce real: cada nova operação reagenda o push, garantindo que ele
  // roda 2s depois da ÚLTIMA escrita (e não da primeira)
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    _syncTimeout = null;
    if (!api.sync.isAutoSyncEnabled()) return;
    const invoke = await getInvoke();
    if (!invoke) return; // browser nao usa push Tauri
    try {
      await invoke("push_to_github");
      localStorage.setItem("sync_last_push", new Date().toISOString());
    } catch (e) {
      console.warn("[auto-sync] push falhou:", e);
    }
  }, 2000);
}

function nextId(arr: { id: number }[]): number {
  return arr.length === 0 ? 1 : Math.max(...arr.map(a => a.id)) + 1;
}

/** Avisa as páginas que o backend falhou e o fallback local foi usado em escrita. */
function notifyApiError(command: string, origem: string, erro: unknown) {
  const message = erro instanceof Error ? erro.message : String(erro ?? "erro desconhecido");
  console.error(`[apiCall] ${origem} ${command} falhou — usando fallback local: ${message}`);
  try {
    window.dispatchEvent(new CustomEvent("almox-api-error", { detail: { command, origem, message } }));
  } catch {}
}

/** Operações de escrita (create/update/delete) merecem aviso ao usuário; leituras não. */
function isEscrita(command: string): boolean {
  return !command.startsWith("list_") && command !== "login";
}

async function apiCall<T>(command: string, args: any, fallback: () => T | Promise<T>): Promise<T> {
  const invoke = await getInvoke();
  // Log de debug removido por segurança
  if (invoke) {
    try {
      const result = await invoke(command, args);
      if (result === undefined && isEscrita(command)) {
        console.warn(`[apiCall] ${command} retornou undefined — possível problema de serialização`);
      }
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[apiCall] Tauri ${command} ERRO:`, errorMsg, "\nArgs enviados:", JSON.stringify(args, null, 2));
      if (isEscrita(command)) notifyApiError(command, "Tauri", e);
      else console.warn(`[apiCall] Tauri ${command} failed`);
      return fallback();
    }
  }
  // Web + nuvem configurada: usa banco compartilhado (Supabase)
  if (getCloudConfig()) {
    try {
      const remoto = await remoteCall<T>(command, args);
      // Log de debug removido por segurança
      if (remoto !== undefined) return remoto;
      // Escritas sem retorno (update/delete): executa o fallback tambem para
      // manter o cache local (store/localStorage) coerente com a nuvem
      if (!command.startsWith("list_") && !command.startsWith("login")) {
        triggerAutoSync();
        return await fallback();
      }
    } catch (e: any) {
      console.warn(`[apiCall] Nuvem ${command} falhou:`, e?.message || e);
      if (isEscrita(command)) notifyApiError(command, "Nuvem", e);
    }
  }
  // Log de debug removido por segurança
  return fallback();
}

// Like apiCall but triggers auto-sync after successful write
async function writeCall<T>(command: string, args: any, fallback: () => T | Promise<T>): Promise<T> {
  const result = await apiCall(command, args, fallback);
  triggerAutoSync();
  return result;
}

function todayISO() { return new Date().toISOString(); }

// ---- Dashboard ----
export const api = {
  // Lê direto do localStorage — que é mantido em sincronia com o
  // backend/nuvem por syncAllFromBackend e pelos caches do apiCall.
  dashboardStats: async (): Promise<DashboardStats> => {
    const ps = loadFromLS<Produto[]>("almox_produtos", []);
    const movs = loadFromLS<Movimentacao[]>("almox_movimentacoes", []);
    const socs = loadFromLS<Solicitacao[]>("almox_solicitacoes", []);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    return {
      total_produtos: ps.filter(p => p.ativo).length,
      itens_estoque: ps.reduce((s, p) => s + (p.estoque || 0), 0),
      estoque_baixo: ps.filter(p => p.ativo && p.estoque > 0 && p.estoque <= p.estoque_minimo).length,
      itens_indisponiveis: ps.filter(p => p.ativo && p.estoque === 0).length,
      solicitacoes_pendentes: socs.filter(s => s.status === "pendente").length,
      entradas_mes: movs.filter(m => m.tipo === "entrada" && new Date(m.data_movimento) >= inicioMes).reduce((s, m) => s + m.quantidade, 0),
      saidas_mes: movs.filter(m => m.tipo === "saida" && new Date(m.data_movimento) >= inicioMes).reduce((s, m) => s + m.quantidade, 0),
      valor_total_estoque: ps.reduce((s, p) => s + (p.preco_compra * (p.estoque || 0)), 0),
    };
  },

  // ---- Lojas ----
  lojas: {
    list: () => apiCall<Loja[]>("list_lojas", {}, () => {
      const dados = loadFromLS<Loja[]>("almox_lojas", []);
      store.lojas = dados;
      return dados;
    }).then((dados) => { store.lojas = dados; return dados; }),
    create: (l: Omit<Loja, "id">) => writeCall<Loja>("create_loja", l, () => {
      const novo: Loja = { ...l, id: nextId(store.getLojas()) };
      return store.addLoja(novo);
    }),
    update: (id: number, l: Partial<Loja>) => writeCall<Loja>("update_loja", { id, ...l }, () => {
      const existing = store.getLojas().find(x => x.id === id);
      if (!existing) throw new Error("Loja não encontrada");
      return store.updateLoja({ ...existing, ...l, id });
    }),
    delete: (id: number) => writeCall<void>("delete_loja", { id }, () => {
      store.removeLoja(id);
    }).then(() => {
      store.removeLoja(id);
    }),
  },

  // ---- Categorias ----
  categorias: {
    list: () => apiCall<Categoria[]>("list_categorias", {}, () => store.getCategorias()),
    create: (c: Omit<Categoria, "id">) => writeCall<Categoria>("create_categoria", c, () => {
      const novo: Categoria = { ...c, id: nextId(store.getCategorias()) };
      return store.addCategoria(novo);
    }),
    update: (id: number, c: Partial<Categoria>) => writeCall<Categoria>("update_categoria", { id, ...c }, () => {
      const existing = store.getCategorias().find(x => x.id === id);
      if (!existing) throw new Error("Categoria não encontrada");
      return store.updateCategoria({ ...existing, ...c, id });
    }),
    remove: (id: number) => writeCall<void>("delete_categoria", { id }, () => store.removeCategoria(id)),
  },

  // ---- Produtos ----
  produtos: {
    list: () => apiCall<Produto[]>("list_produtos", {}, () => {
      const dados = loadFromLS<Produto[]>("almox_produtos", []);
      store.produtos = dados;
      return dados;
    }).then((dados) => {
      store.produtos = dados;
      return dados;
    }),
    create: (p: Omit<Produto, "id">) => writeCall<Produto>("create_produto", p, () => {
      const novo: Produto = { ...p, id: nextId(store.getProdutos()) };
      return store.addProduto(novo);
    }).then((prod) => {
      if (!store.getProdutos().find(x => x.id === prod.id)) {
        store.addProduto({ ...prod });
      }
      return prod;
    }),
    delete: (id: number) => writeCall<void>("delete_produto", { id }, () => {
      store.removeProduto(id);
    }).then(() => {
      store.removeProduto(id);
    }),
    resetAllStock: async () => {
      // Persiste no backend (Tauri/nuvem) produto a produto via update_produto,
      // que exige o payload completo — preserva todos os campos, só zera estoque.
      const erros: unknown[] = [];
      for (const p of store.getProdutos()) {
        if ((p.estoque || 0) === 0) continue;
        try {
          await api.produtos.update(p.id, {
            codigo: p.codigo,
            nome: p.nome,
            marca: p.marca,
            modelo: p.modelo,
            descricao: p.descricao,
            categoria_id: p.categoria_id,
            fornecedor_id: p.fornecedor_id,
            unidade: p.unidade,
            preco_compra: p.preco_compra,
            preco_venda: p.preco_venda,
            estoque: 0,
            estoque_minimo: p.estoque_minimo,
            custo_total: p.custo_total ?? 0,
          });
        } catch (e) {
          erros.push(e);
        }
      }
      if (erros.length > 0) {
        throw new Error(`Falha ao zerar o estoque de ${erros.length} produto(s).`);
      }
    },
    update: (id: number, p: Partial<Produto>) => writeCall<Produto>("update_produto", { id, ...p }, () => {
      const existing = store.getProdutos().find(x => x.id === id);
      if (!existing) throw new Error("Produto não encontrado");
      return store.updateProduto({ ...existing, ...p, id });
    }).then((prod) => {
      store.updateProduto(prod);
      return prod;
    }),
  },

  // ---- Usuarios ----
  usuarios: {
    list: () => apiCall<Usuario[]>("list_usuarios", {}, () => {
      let dados = loadFromLS<Usuario[]>("almox_usuarios", []);
      // Seed automatico: se nao houver usuarios, criar admin padrao
      // NOTA: senha sera hasheada no backend (Rust/Argon2). No frontend, armazenamos
      // apenas para o fluxo de login que verifica contra o backend.
      if (dados.length === 0) {
        const admin: Usuario = {
          id: 1,
          nome: "Administrador",
          email: "admin@empresa.com",
          senha: "",  // NUNCA plaintext no frontend — backend cria com Argon2
          perfil: "admin",
          loja_id: null,
          loja_nome: null,
          ativo: true,
        };
        dados = [admin];
        persist("almox_usuarios", dados);
      }
      store.usuarios = dados;
      return dados;
    }).then((dados) => { store.usuarios = dados; return dados; }),
    login: (email: string, senha: string) => apiCall<Usuario>("login", { email, senha }, async () => {
      // Rate limiting: verifica se está bloqueado
      const attemptInfo = getLoginAttemptInfo();
      if (attemptsLocked(attemptInfo)) {
        const remaining = Math.ceil((attemptInfo.lockedUntil! - Date.now()) / 1000);
        throw new Error(`Conta temporariamente bloqueada. Tente novamente em ${remaining} segundos.`);
      }

      let dados = loadFromLS<Usuario[]>("almox_usuarios", []);
      // Seed: admin padrão (senha vazia — backend cria com Argon2)
      if (dados.length === 0) {
        const admin: Usuario = {
          id: 1,
          nome: "Administrador",
          email: "admin@empresa.com",
          senha: "",  // NUNCA plaintext — backend cria com Argon2
          perfil: "admin",
          loja_id: null,
          loja_nome: null,
          ativo: true,
        };
        dados = [admin];
        persist("almox_usuarios", dados);
      }
      const u = dados.find(x => x.email === email);
      if (!u) {
        recordLoginFailure();
        throw new Error("Credenciais inválidas");
      }
      const senhaOk = await verificarSenha(u.senha, senha);
      if (!senhaOk) {
        const locked = recordLoginFailure();
        if (locked) throw new Error("Conta bloqueada por muitas tentativas. Aguarde 15 minutos.");
        throw new Error("Credenciais inválidas");
      }
      // Login bem-sucedido: limpa tentativas
      clearLoginAttempts();
      return u;
    }),
    create: (u: Omit<Usuario, "id">) => writeCall<Usuario>("create_usuario", u, () => {
      const novo: Usuario = { ...u, id: nextId(store.getUsuarios()) };
      return store.addUsuario(novo);
    }).then((usr) => {
      const existente = store.getUsuarios().find(x => x.id === usr.id);
      if (!existente) store.addUsuario({ ...usr });
      return usr;
    }),
    update: (id: number, u: Partial<Usuario>) => writeCall<Usuario>("update_usuario", { id, ...u }, () => {
      const existing = store.getUsuarios().find(x => x.id === id);
      if (!existing) throw new Error("Usuário não encontrado");
      return store.updateUsuario({ ...existing, ...u, id });
    }),
    delete: (id: number) => writeCall<void>("delete_usuario", { id }, () => {
      store.removeUsuario(id);
    }).then(() => {
      store.removeUsuario(id);
    }),
  },

  // ---- Movimentacoes ----
  movimentacoes: {
    list: () => apiCall<Movimentacao[]>("list_movimentacoes", {}, () => {
      const dados = loadFromLS<Movimentacao[]>("almox_movimentacoes", []);
      store.movimentacoes = dados;
      return dados;
    }).then((dados) => { store.movimentacoes = dados; return dados; }),
    create: (m: Omit<Movimentacao, "id" | "data_movimento"> & { data_movimento?: string }) => {
      // Envia apenas os campos que o comando Rust espera (evita erro de desserialização)
      const args = {
        tipo: m.tipo,
        produto_id: m.produto_id,
        produto_nome: m.produto_nome ?? null,
        quantidade: m.quantidade,
        loja_origem_id: m.loja_origem_id ?? null,
        loja_origem_nome: m.loja_origem_nome ?? null,
        loja_destino_id: m.loja_destino_id ?? null,
        loja_destino_nome: m.loja_destino_nome ?? null,
        usuario_id: m.usuario_id ?? null,
        observacao: m.observacao ?? null,
        preco_compra: m.preco_compra ?? null,
        unidade: m.unidade ?? null,
        data_movimento: m.data_movimento ?? null,
      };
      // Log de debug removido por segurança
      return writeCall<Movimentacao>("create_movimentacao", args, () => {
        const novo: Movimentacao = { ...m, id: nextId(store.getMovimentacoes()), data_movimento: m.data_movimento || todayISO() };
        return store.addMovimentacao(novo);
      }).then((mov) => {
        // Garante que o registro também fique no localStorage
        const existente = store.getMovimentacoes().find(x => x.id === mov.id);
        if (!existente) {
          store.addMovimentacao({ ...mov });
        }
        return mov;
      });
    },
    update: (id: number, m: Partial<Movimentacao>) => {
      const args: Record<string, unknown> = { id };
      if (m.quantidade !== undefined) args.quantidade = m.quantidade;
      if (m.preco_compra !== undefined) args.preco_compra = m.preco_compra;
      if (m.unidade !== undefined) args.unidade = m.unidade;
      if (m.observacao !== undefined) args.observacao = m.observacao;
      return writeCall<Movimentacao>("update_movimentacao", args, () => {
        return store.updateMovimentacao(id, m) as Movimentacao;
      });
    },
    delete: (id: number) => writeCall<void>("delete_movimentacao", { id }, () => {
      store.removeMovimentacao(id);
    }).then(() => {
      store.removeMovimentacao(id);
    }),
  },

  // ---- Solicitacoes ----
  solicitacoes: {
    list: () => apiCall<Solicitacao[]>("list_solicitacoes", {}, () => store.getSolicitacoes()),
    create: (s: Omit<Solicitacao, "id" | "data_solicitacao" | "status">) => writeCall<Solicitacao>("create_solicitacao", s, () => {
      const novo: Solicitacao = { ...s, id: nextId(store.getSolicitacoes()), status: "pendente", data_solicitacao: todayISO() };
      return store.addSolicitacao(novo);
    }),
    updateStatus: (id: number, status: string) => writeCall<void>("update_solicitacao_status", { id, status }, () => {
      const arr = store.getSolicitacoes().map(x => x.id === id ? { ...x, status } : x);
      store.setSolicitacoes(arr);
    }),
    updateObservacao: (id: number, observacao: string) => writeCall<void>("update_solicitacao_observacao", { id, observacao }, () => {
      const arr = store.getSolicitacoes().map(x => x.id === id ? { ...x, observacao } : x);
      store.setSolicitacoes(arr);
    }),
    listItens: (solicitacao_id: number) => apiCall<SolicitacaoItem[]>(
      "list_solicitacao_itens", { solicitacao_id }, () => store.getItens(solicitacao_id)
    ),
    addItem: (solicitacao_id: number, produto_id: number, quantidade: number) =>
      writeCall<SolicitacaoItem>(
        "add_solicitacao_item", { solicitacao_id, produto_id, quantidade },
        () => {
          const prod = store.getProdutos().find(p => p.id === produto_id);
          const novo: SolicitacaoItem = {
            id: nextId(store.getItens(solicitacao_id)),
            solicitacao_id,
            produto_id,
            produto_nome: prod?.nome ?? null,
            produto_codigo: prod?.codigo ?? null,
            unidade: prod?.unidade ?? null,
            quantidade,
          };
          store.addItem(solicitacao_id, novo);
          // bump total_itens
          const arr = store.getSolicitacoes().map(x => x.id === solicitacao_id
            ? { ...x, total_itens: (x.total_itens ?? 0) + 1 } : x);
          store.setSolicitacoes(arr);
          return novo;
        }
      ),
    removeItem: (id: number, solicitacao_id: number) => writeCall<void>(
      "remove_solicitacao_item", { id }, () => {
        store.removeItem(solicitacao_id, id);
        const arr = store.getSolicitacoes().map(x => x.id === solicitacao_id
          ? { ...x, total_itens: Math.max(0, (x.total_itens ?? 1) - 1) } : x);
        store.setSolicitacoes(arr);
      }
    ),
    delete: (id: number) => writeCall<void>("delete_solicitacao", { id }, () => {
      const arr = store.getSolicitacoes().filter(x => x.id !== id);
      store.setSolicitacoes(arr);
    }),
  },

  // ---- Pedidos ----
  pedidos: {
    list: () => apiCall<Pedido[]>("list_pedidos", {}, () => {
      const dados = loadFromLS<Pedido[]>("almox_pedidos", []);
      store.pedidos = dados;
      return dados;
    }).then(async (dados) => {
      // Preserva campos que o SQLite nao tem (setor, itens, etc.)
      const local = loadFromLS<Pedido[]>("almox_pedidos", []);
      const mapa = new Map(local.map(p => [p.id, p]));
      for (const p of dados) {
        const orig = mapa.get(p.id);
        if (orig) {
          if ((orig as any).setor) (p as any).setor = (orig as any).setor;
          if ((orig as any).itens) {
            (p as any).itens = (orig as any).itens;
          } else {
            // Fallback: tenta carregar itens do storage separado (almox_pedido_itens)
            const itensSeparados = store.getPedidoItens(p.id);
            if (itensSeparados && itensSeparados.length > 0) {
              (p as any).itens = itensSeparados;
            }
          }
        }
      }
      // Último recurso: itens do SQLite (pedido_itens) — import fora do loop,
      // buscas em paralelo para evitar N+1 serial
      const faltando = dados.filter(p => !(p as any).itens || (p as any).itens.length === 0);
      if (faltando.length > 0) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await Promise.all(faltando.map(async (p) => {
            try {
              const sqlItens: any[] = await invoke("list_pedido_itens", { pedidoId: p.id });
              if (sqlItens && sqlItens.length > 0) (p as any).itens = sqlItens;
            } catch {}
          }));
        } catch {}
      }
      store.pedidos = dados;
      return dados;
    }),
    create: (p: Omit<Pedido, "id" | "status">) => writeCall<Pedido>("create_pedido", {
      numero: p.numero,
      loja_id: p.loja_id,
      solicitante: p.solicitante,
      origem: p.origem || null,
      arquivo_pdf: p.arquivo_pdf || null,
      setor: p.setor || null,
      data_pedido: (p as any).data_pedido || null,
    }, () => {
      const novo: Pedido = { ...p, id: nextId(store.getPedidos()), status: "importado", data_pedido: todayISO() };
      return store.addPedido(novo);
    }).then((pedido) => {
      const existente = store.getPedidos().find(pp => pp.id === pedido.id);
      if (!existente) {
        const clone = { ...pedido };
        if (!clone.id) clone.id = nextId(store.getPedidos());
        store.addPedido(clone);
      }
      return pedido;
    }),
    delete: async (id: number) => {
      await writeCall<void>("delete_pedido", { id }, () => {
        store.setPedidos(store.getPedidos().filter(p => p.id !== id));
        store.removePedidoItens(id);
      });
    },
    update: (id: number, dados: Partial<Pedido>) => writeCall<Pedido | undefined>("update_pedido", { id, status: dados.status }, () => {
      const p = store.getPedidos().find(pp => pp.id === id);
      if (p) { Object.assign(p, dados); persist("almox_pedidos", store.getPedidos()); }
      return p;
    }),
    listItens: async (pedido_id: number) => {
      const p = store.getPedidos().find(pp => pp.id === pedido_id);
      const local = (p as any)?.itens || store.getPedidoItens(pedido_id);
      if (local && local.length > 0) return local;
      // Tenta carregar do SQLite
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const sqlItens: any[] = await invoke("list_pedido_itens", { pedidoId: pedido_id });
        if (sqlItens && sqlItens.length > 0) return sqlItens;
      } catch {}
      return local || [];
    },
    listAllItens: async () => {
      const todos: Record<number, any[]> = {};
      for (const p of store.getPedidos()) {
        const itens = (p as any)?.itens || store.getPedidoItens(p.id);
        if (itens?.length) todos[p.id] = itens;
      }
      // Complementa com itens do SQLite — import fora do loop, buscas em paralelo
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const faltando = store.getPedidos().filter((p) => !todos[p.id]);
        await Promise.all(faltando.map(async (p) => {
          try {
            const sqlItens: any[] = await invoke("list_pedido_itens", { pedidoId: p.id });
            if (sqlItens && sqlItens.length > 0) todos[p.id] = sqlItens;
          } catch {}
        }));
      } catch {}
      return todos;
    },
    setItens: (pedido_id: number, itens: Omit<PedidoItem, "id" | "pedido_id">[]) => {
      const p = store.getPedidos().find(pp => pp.id === pedido_id);
      if (p) {
        (p as any).itens = itens.map((item, i) => ({ ...item, id: i + 1, pedido_id }));
        persist("almox_pedidos", store.getPedidos());
      }
      store.setPedidoItens(pedido_id, itens);
      // Salva no SQLite (Desktop) ou na nuvem (Web)
      if (getCloudConfig()) {
        remoteCall("set_pedido_itens", {
          pedidoId: pedido_id,
          itens: itens.map(i => ({ produto_id: i.produto_id || 0, produto_nome: i.produto_nome, unidade: i.unidade || null, quantidade: i.quantidade })),
        }).catch(() => {});
      } else {
        try {
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("set_pedido_itens", { pedidoId: pedido_id, itens: itens.map(i => ({ produto_id: i.produto_id || 0, produto_nome: i.produto_nome, unidade: i.unidade || null, quantidade: i.quantidade })) }).catch(() => {});
          });
        } catch {}
      }
      triggerAutoSync();
      return Promise.resolve();
    },
  },

  // ---- Alertas ----
  alertas: {
    list: () => apiCall<Alerta[]>("list_alertas", {}, () => store.getAlertas()),
    markLido: (id: number) => writeCall<void>("mark_alerta_lido", { id }, () => {
      store.markAlertaLido(id);
    }),
  },

  // ---- Etiquetas (print legado via Rust) ----
  etiquetas: {
    print: async (produtoId: number, qtd: number, _empresa: string = "", tamanho?: TamanhoEtiqueta) => {
      const p = store.getProdutos().find(x => x.id === produtoId);
      if (!p) throw new Error("Produto não encontrado");
      const invoke = await getInvoke();
      if (invoke) {
        try {
          await invoke("print_product_label", { produto_id: p.id, quantidade: Math.max(1, qtd), empresa: "", tamanho: tamanho ?? "pequena" });
          return;
        } catch (e) { console.warn("[etiquetas] print_product_label falhou:", e); }
      }
      // Fallback: HTML simples
      const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>${p.nome}</title><style>@page{size:70mm 35mm;margin:0}body{font-family:sans-serif;font-size:2.8mm;margin:0;padding:2mm;display:flex;flex-direction:column;gap:1mm}b{font-weight:bold}</style></head><body><div><b>${p.codigo}</b></div><div style='font-weight:bold'>${p.nome}</div><div>${p.marca||''} ${p.modelo||''}</div></body></html>`;
      await printHtml(html, `etiqueta_${p.codigo}`);
    },
    printBatch: async (produtos: {id:number;nome:string;codigo:string;marca?:string|null;modelo?:string|null}[], quantidades: Record<number,number>, tamanho?: TamanhoEtiqueta) => {
      for (const p of produtos) {
        await api.etiquetas.print(p.id, quantidades[p.id] ?? 1, "", tamanho);
      }
    },
  },

  // ---- Sync (Export / Import) ----
  sync: {
    /** Exporta todos os dados como JSON (Desktop: Tauri, Browser: localStorage) */
    exportData: async (): Promise<string> => {
      // NOTA: Senhas NUNCA são exportadas (proteção de credenciais)
      const invoke = await getInvoke();
      if (invoke) {
        // Desktop: exporta do SQLite
        const dados = await invoke("export_all_data");
        return JSON.stringify(dados, null, 2);
      }
      // Browser: exporta do localStorage (chaves sem prefixo almox_ para compatibilidade com Rust)
      const pares: [string, string][] = [
        ["lojas", "almox_lojas"],
        ["categorias", "almox_categorias"],
        ["fornecedores", "almox_fornecedores"],
        ["produtos", "almox_produtos"],
        ["usuarios", "almox_usuarios"],
        ["movimentacoes", "almox_movimentacoes"],
        ["solicitacoes", "almox_solicitacoes"],
        ["solicitacao_itens", "almox_solicitacao_itens"],
        ["pedidos", "almox_pedidos"],
        ["pedido_itens", "almox_pedido_itens"],
        ["alertas", "almox_alertas"],
      ];
      const dados: Record<string, any> = { versao: "1.0", data_exportacao: new Date().toISOString() };
      for (const [outKey, lsKey] of pares) {
        const raw = localStorage.getItem(lsKey);
        if (raw) dados[outKey] = JSON.parse(raw);
      }
      return JSON.stringify(dados, null, 2);
    },

    /** Importa dados de um JSON (Desktop: Tauri, Browser: localStorage) */
    importData: async (json: string): Promise<string> => {
      const CHAVES_VALIDAS = new Set<string>([
        "lojas", "categorias", "fornecedores", "produtos", "usuarios",
        "movimentacoes", "solicitacoes", "solicitacao_itens", "pedidos",
        "pedido_itens", "alertas",
        // variantes com prefixo almox_
        ...["lojas", "categorias", "fornecedores", "produtos", "usuarios",
          "movimentacoes", "solicitacoes", "solicitacao_itens", "pedidos",
          "pedido_itens", "alertas"].map(k => `almox_${k}`),
      ]);
      let dados: any;
      try {
        dados = JSON.parse(json);
      } catch {
        throw new Error("Arquivo inválido: o conteúdo não é um JSON válido.");
      }
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        throw new Error("Arquivo inválido: o JSON deve ser um objeto de dados (ex.: { lojas: [...], produtos: [...] }).");
      }
      for (const chave of Object.keys(dados)) {
        if (!CHAVES_VALIDAS.has(chave) && chave !== "versao" && chave !== "data_exportacao") {
          throw new Error(`Arquivo rejeitado: chave desconhecida "${chave}". Só são aceitos arquivos de exportação deste sistema.`);
        }
        const valor = dados[chave];
        if ((chave === "versao" || chave === "data_exportacao") && typeof valor !== "string") {
          throw new Error(`Arquivo inválido: campo "${chave}" deve ser texto.`);
        } else if (CHAVES_VALIDAS.has(chave) && !Array.isArray(valor)) {
          throw new Error(`Arquivo inválido: campo "${chave}" deve ser uma lista de registros.`);
        }
      }
      const invoke = await getInvoke();
      if (invoke) {
        // Desktop: importa para SQLite
        return await invoke("import_all_data", { dados });
      }
      // Browser: importa para localStorage
      // Aceita ambos os formatos: "categorias" (Rust) e "almox_categorias" (Web)
      let total = 0;
      const pares: [string, string][] = [
        ["lojas", "almox_lojas"],
        ["categorias", "almox_categorias"],
        ["fornecedores", "almox_fornecedores"],
        ["produtos", "almox_produtos"],
        ["usuarios", "almox_usuarios"],
        ["movimentacoes", "almox_movimentacoes"],
        ["solicitacoes", "almox_solicitacoes"],
        ["solicitacao_itens", "almox_solicitacao_itens"],
        ["pedidos", "almox_pedidos"],
        ["pedido_itens", "almox_pedido_itens"],
        ["alertas", "almox_alertas"],
      ];
      for (const [srcKey, lsKey] of pares) {
        const dadosArr = dados[srcKey] || dados[lsKey];
        if (dadosArr) {
          localStorage.setItem(lsKey, JSON.stringify(dadosArr));
          total += Array.isArray(dadosArr) ? dadosArr.length : 1;
        }
      }
      return `Importacao concluida! ${total} registros importados.`;
    },

    /** Baixa o arquivo JSON no navegador */
    downloadJson: (json: string, nome: string = "estoque_ti_sync.json") => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    },

    /** Le um arquivo JSON selecionado pelo usuario */
    readJsonFile: (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsText(file);
      });
    },

    // ---- Sync automatica via GitHub ----

    /** Config de sync do GitHub vinda do cofre (criptografado), se disponível. */
    getConfigDoCofre: (): { owner: string; repo: string; path: string; token: string } | null => {
      if (!vault.isUnlocked()) return null;
      const s = vault.getVaultSecrets();
      if (!s?.sync_github_owner || !s?.sync_github_repo || !s?.sync_github_token) return null;
      return { owner: s.sync_github_owner, repo: s.sync_github_repo, path: s.sync_github_path || "sync_data.json", token: s.sync_github_token };
    },

    /** Migra (uma única vez) a config legada em plaintext para o cofre. */
    migrarGithubParaCofre: (owner: string, repo: string, path: string, token: string) => {
      const pw = vault.getVaultPassword();
      if (!pw) return;
      vault.createOrUpdateVault({ sync_github_owner: owner, sync_github_repo: repo, sync_github_path: path || "sync_data.json", sync_github_token: token }, pw)
        .then(() => {
          // Apaga as chaves antigas em texto puro
          localStorage.removeItem("sync_github_token");
          localStorage.removeItem("sync_github_owner");
          localStorage.removeItem("sync_github_repo");
          localStorage.removeItem("sync_github_path");
        })
        .catch((e) => console.warn("[sync] migração da config GitHub para o cofre falhou:", e));
    },

    /** Retorna configuracao de sync do GitHub */
    getGithubConfig: (): { owner: string; repo: string; path: string; token: string } | null => {
      // 1. Cofre criptografado (prioridade)
      const doCofre = api.sync.getConfigDoCofre();
      if (doCofre) return doCofre;
      // 2. Legado em texto puro — migra para o cofre se ele estiver desbloqueado
      const owner = localStorage.getItem("sync_github_owner");
      const repo = localStorage.getItem("sync_github_repo");
      const path = localStorage.getItem("sync_github_path");
      const token = localStorage.getItem("sync_github_token");
      if (!owner || !repo || !path || !token) return null;
      api.sync.migrarGithubParaCofre(owner, repo, path, token);
      return { owner, repo, path, token };
    },

    /** Salva configuracao de sync do GitHub */
    setGithubConfig: (owner: string, repo: string, path: string, token: string) => {
      // SEGURANÇA: Token JAMAIS é salvo em plaintext — exige vault desbloqueado
      const pw = vault.getVaultPassword();
      if (!pw) {
        throw new Error("Cofre não está desbloqueado. Desbloqueie o cofre para salvar credenciais de sync.");
      }
      vault.createOrUpdateVault({ sync_github_owner: owner, sync_github_repo: repo, sync_github_path: path || "sync_data.json", sync_github_token: token }, pw)
        .catch((e) => { throw new Error(`Falha ao salvar no cofre: ${e.message}`); });
    },

    /** Verifica se sync automatica esta habilitada */
    isAutoSyncEnabled: (): boolean => {
      return localStorage.getItem("sync_auto_enabled") === "true";
    },

    /** Habilita/desabilita sync automatica */
    setAutoSync: (enabled: boolean) => {
      localStorage.setItem("sync_auto_enabled", String(enabled));
    },

    /** Hash simples djb2 para comparar conteudo */
    hashContent: (s: string): string => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
      return (h >>> 0).toString(36);
    },

    /** Push dos dados locais para o GitHub */
    pushToGithub: async (): Promise<{ ok: boolean; message: string }> => {
      const config = api.sync.getGithubConfig();
      if (!config) return { ok: false, message: "Configuracao do GitHub nao encontrada" };

      // Desktop: usa Rust (sem CORS)
      const invoke = await getInvoke();
      if (invoke) {
        try {
          const msg = await invoke("push_to_github");
          localStorage.setItem("sync_last_push", new Date().toISOString());
          return { ok: true, message: String(msg) };
        } catch (e: any) {
          return { ok: false, message: `Erro: ${e.message || e}` };
        }
      }

      // Web: usa fetch — cache inteligente: so envia se conteudo mudou
      const json = await api.sync.exportData();
      const currHash = api.sync.hashContent(json);
      const lastHash = localStorage.getItem("sync_last_push_hash");
      if (lastHash && currHash === lastHash) {
        return { ok: true, message: "Sem alteracoes locais para enviar" };
      }
      // UTF-8 -> base64 via TextEncoder (equivalente ao antigo btoa(unescape(encodeURIComponent(...))))
      const bytesJson = new TextEncoder().encode(json);
      let binario = "";
      bytesJson.forEach((b) => (binario += String.fromCharCode(b)));
      const base64 = btoa(binario);

      // Retry com SHA atualizado em caso de 409
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        let sha: string | null = null;
        try {
          const getRes = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
            { headers: { Authorization: `token ${config.token}`, Accept: "application/vnd.github.v3+json" } }
          );
          if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
          }
        } catch {}

        const body: any = {
          message: `sync: atualizacao web ${new Date().toISOString().slice(0, 19)}`,
          content: base64,
        };
        if (sha) body.sha = sha;

        const res = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${config.token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (res.ok) {
          localStorage.setItem("sync_last_push", new Date().toISOString());
          localStorage.setItem("sync_last_push_hash", currHash);
          const jd = await res.json().catch(() => null);
          if (jd?.content?.sha) localStorage.setItem("sync_last_github_sha", jd.content.sha);
          return { ok: true, message: "Dados enviados ao GitHub com sucesso" };
        }
        // 409 = conflito de SHA, retry
        if (res.status === 409) continue;
        const err = await res.text();
        return { ok: false, message: `Erro ao enviar: ${err}` };
      }
      return { ok: false, message: "Erro: conflito persistente no GitHub (409)" };
    },

    /** Pull dos dados do GitHub para o local */
    pullFromGithub: async (): Promise<{ ok: boolean; message: string; changed: boolean }> => {
      const config = api.sync.getGithubConfig();
      if (!config) return { ok: false, message: "Configuracao do GitHub nao encontrada", changed: false };

      // Desktop: usa Rust (sem CORS) — verifica SHA antes para evitar import desnecessario
      const invoke = await getInvoke();
      if (invoke) {
        try {
          // tenta verificar SHA remoto primeiro (cache)
          try {
            const headRes = await fetch(
              `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
              { headers: { Authorization: `token ${config.token}`, Accept: "application/vnd.github.v3+json" }, method: "GET" }
            );
            if (headRes.ok) {
              const fd: any = await headRes.clone().json().catch(() => null);
              const remoteSha = fd?.sha;
              const lastSha = localStorage.getItem("sync_last_github_sha");
              if (remoteSha && lastSha && remoteSha === lastSha) {
                return { ok: true, message: "Dados ja estao atualizados", changed: false };
              }
            }
          } catch {}
          const msg = await invoke("pull_from_github");
          const msgStr = String(msg);
          const isEmpty = msgStr.includes("Nenhum dado") || msgStr.includes("vazios");
          const noChange = msgStr.includes("ja estao");
          const changed = !isEmpty && !noChange;
          if (changed) localStorage.setItem("sync_last_sync", new Date().toISOString());
          // tenta atualizar SHA cache apos sucesso
          try {
            const r2 = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`, { headers: { Authorization: `token ${config.token}`, Accept: "application/vnd.github.v3+json" } });
            if (r2.ok) { const j: any = await r2.json(); if (j?.sha) localStorage.setItem("sync_last_github_sha", j.sha); }
          } catch {}
          return { ok: true, message: msgStr, changed };
        } catch (e: any) {
          return { ok: false, message: `Erro: ${e.message || e}`, changed: false };
        }
      }

      // Web: usa fetch — cache por SHA
      try {
        const res = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
          { headers: { Authorization: `token ${config.token}`, Accept: "application/vnd.github.v3+json" } }
        );

        if (!res.ok) {
          if (res.status === 404) return { ok: true, message: "Nenhum dado no GitHub ainda", changed: false };
          return { ok: false, message: `Erro HTTP ${res.status}`, changed: false };
        }

        const fileData = await res.json();
        const remoteSha: string = fileData.sha;
        const lastSha = localStorage.getItem("sync_last_github_sha");
        if (lastSha && remoteSha === lastSha) {
          return { ok: true, message: "Dados ja estao atualizados", changed: false };
        }
        // base64 -> UTF-8 via TextDecoder (equivalente ao antigo decodeURIComponent(escape(atob(...))))
        const binario = atob(fileData.content);
        const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);

        await api.sync.importData(json);
        localStorage.setItem("sync_last_github_sha", remoteSha);
        localStorage.setItem("sync_last_sync", new Date().toISOString());

        return { ok: true, message: "Dados sincronizados do GitHub", changed: true };
      } catch (e: any) {
        return { ok: false, message: `Erro ao baixar: ${e.message}`, changed: false };
      }
    },
  },
};

// ============================================================================
//  Sync helper: load from Tauri -> store on app start
// ============================================================================
export async function syncAllFromBackend() {
  const invoke = await getInvoke();
  // Se o sistema foi resetado, não recarregar dados do SQLite
  if (localStorage.getItem("almox_reset_done") === "1") {
    localStorage.removeItem("almox_reset_done");
    return false;
  }

  // ---- Web: banco compartilhado na nuvem ----
  if (!invoke && getCloudConfig()) {
    try {
      const { cloudPullAll } = await import("./cloudDb");
      await cloudPullAll();
      store.lojas = loadFromLS<Loja[]>("almox_lojas", []);
      store.categorias = loadFromLS<Categoria[]>("almox_categorias", []);
      store.produtos = loadFromLS<Produto[]>("almox_produtos", []);
      store.usuarios = loadFromLS<Usuario[]>("almox_usuarios", []);
      store.movimentacoes = loadFromLS<Movimentacao[]>("almox_movimentacoes", []);
      store.solicitacoes = loadFromLS<Solicitacao[]>("almox_solicitacoes", []);
      store.pedidos = loadFromLS<Pedido[]>("almox_pedidos", []);
      store.alertas = loadFromLS<Alerta[]>("almox_alertas", []);
      store.pedidoItens = loadFromLS("almox_pedido_itens", {});
      return true;
    } catch (e) {
      console.warn("[syncAllFromBackend] nuvem indisponivel:", e);
      return false;
    }
  }

  if (!invoke) return false;
  // Busca cada tabela individualmente — falha de uma não quebra as outras
  const tabelas = [
    { key: "lojas", cmd: "list_lojas", set: (d: any) => { persist("almox_lojas", d); store.setLojas(d); } },
    { key: "categorias", cmd: "list_categorias", set: (d: any) => store.setCategorias(d) },
    { key: "produtos", cmd: "list_produtos", set: (d: any) => { persist("almox_produtos", d); store.setProdutos(d); } },
    { key: "usuarios", cmd: "list_usuarios", set: (d: any) => store.setUsuarios(d) },
    { key: "movimentacoes", cmd: "list_movimentacoes", set: (d: any) => {
      const anteriores = store.movimentacoes.length;
      if (anteriores > 0 && Array.isArray(d) && d.length < anteriores) {
        console.warn(`[syncAllFromBackend] movimentacoes: backend retornou ${d.length} mas localStorage tinha ${anteriores} — dados podem ter sido perdidos se invoke de create falhou`);
      }
      store.setMovimentacoes(d);
    } },
    { key: "solicitacoes", cmd: "list_solicitacoes", set: (d: any) => store.setSolicitacoes(d) },
    { key: "pedidos", cmd: "list_pedidos", set: (d: any) => store.setPedidos(d) },
    { key: "alertas", cmd: "list_alertas", set: (d: any) => store.setAlertas(d) },
  ];
  let ok = 0;
  for (const t of tabelas) {
    try {
      const dados = await invoke(t.cmd);
      t.set(dados);
      ok++;
    } catch (e) {
      console.warn(`[syncAllFromBackend] ${t.cmd} falhou:`, e);
    }
  }
  return ok > 0;
}


