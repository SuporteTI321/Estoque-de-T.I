// ============================================================================
//  BrowserStore — localStorage fallback persistence
// ============================================================================

import type {
  Loja, Categoria, Produto, Usuario, Movimentacao,
  Solicitacao, SolicitacaoItem, Pedido, PedidoItem, Alerta, DashboardStats
} from "./types";

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
  try {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke;
    return _invoke;
  } catch {
    return null;
  }
}

function nextId(arr: { id: number }[]): number {
  return arr.length === 0 ? 1 : Math.max(...arr.map(a => a.id)) + 1;
}

async function apiCall<T>(command: string, args: any, fallback: () => T): Promise<T> {
  const invoke = await getInvoke();
  if (!invoke) return fallback();
  try {
    return await invoke(command, args);
  } catch (e) {
    console.warn(`[apiCall] Tauri ${command} failed, using fallback:`, e);
    return fallback();
  }
}

function todayISO() { return new Date().toISOString(); }

// ---- Dashboard ----
export const api = {
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
    create: (l: Omit<Loja, "id">) => apiCall<Loja>("create_loja", l, () => {
      const novo: Loja = { ...l, id: nextId(store.getLojas()) };
      return store.addLoja(novo);
    }),
    update: (id: number, l: Partial<Loja>) => apiCall<Loja>("update_loja", { id, ...l }, () => {
      const existing = store.getLojas().find(x => x.id === id);
      if (!existing) throw new Error("Loja não encontrada");
      return store.updateLoja({ ...existing, ...l, id });
    }),
    delete: (id: number) => apiCall<void>("delete_loja", { id }, () => {
      store.removeLoja(id);
    }).then(() => {
      store.removeLoja(id);
    }),
  },

  // ---- Categorias ----
  categorias: {
    list: () => apiCall<Categoria[]>("list_categorias", {}, () => store.getCategorias()),
    create: (c: Omit<Categoria, "id">) => apiCall<Categoria>("create_categoria", c, () => {
      const novo: Categoria = { ...c, id: nextId(store.getCategorias()) };
      return store.addCategoria(novo);
    }),
    update: (id: number, c: Partial<Categoria>) => apiCall<Categoria>("update_categoria", { id, ...c }, () => {
      const existing = store.getCategorias().find(x => x.id === id);
      if (!existing) throw new Error("Categoria não encontrada");
      return store.updateCategoria({ ...existing, ...c, id });
    }),
    remove: (id: number) => apiCall<void>("delete_categoria", { id }, () => store.removeCategoria(id)),
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
    create: (p: Omit<Produto, "id">) => apiCall<Produto>("create_produto", p, () => {
      const novo: Produto = { ...p, id: nextId(store.getProdutos()) };
      return store.addProduto(novo);
    }).then((prod) => {
      if (!store.getProdutos().find(x => x.id === prod.id)) {
        store.addProduto({ ...prod });
      }
      return prod;
    }),
    delete: (id: number) => apiCall<void>("delete_produto", { id }, () => {
      store.removeProduto(id);
    }).then(() => {
      store.removeProduto(id);
    }),
    resetAllStock: () => {
      for (const p of store.getProdutos()) p.estoque = 0;
      persist("almox_produtos", store.getProdutos());
      return Promise.resolve();
    },
    update: (id: number, p: Partial<Produto>) => apiCall<Produto>("update_produto", { id, ...p }, () => {
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
      if (dados.length === 0) {
        const admin: Usuario = {
          id: 1,
          nome: "Administrador",
          email: "admin@empresa.com",
          senha: "admin123",
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
    login: (email: string, senha: string) => apiCall<Usuario>("login", { email, senha }, () => {
      const dados = loadFromLS<Usuario[]>("almox_usuarios", []);
      const u = dados.find(x => x.email === email && x.senha === senha);
      if (!u) throw new Error("Credenciais inválidas");
      return u;
    }),
    create: (u: Omit<Usuario, "id">) => apiCall<Usuario>("create_usuario", u, () => {
      const novo: Usuario = { ...u, id: nextId(store.getUsuarios()) };
      return store.addUsuario(novo);
    }).then((usr) => {
      const existente = store.getUsuarios().find(x => x.id === usr.id);
      if (!existente) store.addUsuario({ ...usr });
      return usr;
    }),
    update: (id: number, u: Partial<Usuario>) => apiCall<Usuario>("update_usuario", { id, ...u }, () => {
      const existing = store.getUsuarios().find(x => x.id === id);
      if (!existing) throw new Error("Usuário não encontrado");
      return store.updateUsuario({ ...existing, ...u, id });
    }),
    delete: (id: number) => apiCall<void>("delete_usuario", { id }, () => {
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
    create: (m: Omit<Movimentacao, "id" | "data_movimento"> & { data_movimento?: string }) => apiCall<Movimentacao>("create_movimentacao", m, () => {
      const novo: Movimentacao = { ...m, id: nextId(store.getMovimentacoes()), data_movimento: m.data_movimento || todayISO() };
      return store.addMovimentacao(novo);
    }).then((mov) => {
      // Garante que o registro também fique no localStorage
      const existente = store.getMovimentacoes().find(x => x.id === mov.id);
      if (!existente) {
        store.addMovimentacao({ ...mov });
      }
      return mov;
    }),
    update: (id: number, m: Partial<Movimentacao>) => apiCall<Movimentacao>("update_movimentacao", { id, ...m }, () => {
      return store.updateMovimentacao(id, m) as Movimentacao;
    }),
    delete: (id: number) => apiCall<void>("delete_movimentacao", { id }, () => {
      store.removeMovimentacao(id);
    }).then(() => {
      store.removeMovimentacao(id);
    }),
  },

  // ---- Solicitacoes ----
  solicitacoes: {
    list: () => apiCall<Solicitacao[]>("list_solicitacoes", {}, () => store.getSolicitacoes()),
    create: (s: Omit<Solicitacao, "id" | "data_solicitacao" | "status">) => apiCall<Solicitacao>("create_solicitacao", s, () => {
      const novo: Solicitacao = { ...s, id: nextId(store.getSolicitacoes()), status: "pendente", data_solicitacao: todayISO() };
      return store.addSolicitacao(novo);
    }),
    updateStatus: (id: number, status: string) => apiCall<void>("update_solicitacao_status", { id, status }, () => {
      const arr = store.getSolicitacoes().map(x => x.id === id ? { ...x, status } : x);
      store.setSolicitacoes(arr);
    }),
    updateObservacao: (id: number, observacao: string) => apiCall<void>("update_solicitacao_observacao", { id, observacao }, () => {
      const arr = store.getSolicitacoes().map(x => x.id === id ? { ...x, observacao } : x);
      store.setSolicitacoes(arr);
    }),
    listItens: (solicitacao_id: number) => apiCall<SolicitacaoItem[]>(
      "list_solicitacao_itens", { solicitacao_id }, () => store.getItens(solicitacao_id)
    ),
    addItem: (solicitacao_id: number, produto_id: number, quantidade: number) =>
      apiCall<SolicitacaoItem>(
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
    removeItem: (id: number, solicitacao_id: number) => apiCall<void>(
      "remove_solicitacao_item", { id }, () => {
        store.removeItem(solicitacao_id, id);
        const arr = store.getSolicitacoes().map(x => x.id === solicitacao_id
          ? { ...x, total_itens: Math.max(0, (x.total_itens ?? 1) - 1) } : x);
        store.setSolicitacoes(arr);
      }
    ),
    delete: (id: number) => apiCall<void>("delete_solicitacao", { id }, () => {
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
        // Último recurso: itens do SQLite (pedido_itens)
        if (!(p as any).itens || (p as any).itens.length === 0) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const sqlItens: any[] = await invoke("list_pedido_itens", { pedidoId: p.id });
            if (sqlItens && sqlItens.length > 0) (p as any).itens = sqlItens;
          } catch {}
        }
      }
      store.pedidos = dados;
      return dados;
    }),
    create: (p: Omit<Pedido, "id" | "status">) => apiCall<Pedido>("create_pedido", {
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
      await apiCall<void>("delete_pedido", { id }, () => {
        store.setPedidos(store.getPedidos().filter(p => p.id !== id));
        store.removePedidoItens(id);
      });
    },
    update: (id: number, dados: Partial<Pedido>) => apiCall<Pedido | undefined>("update_pedido", { id, status: dados.status }, () => {
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
      // Complementa com itens do SQLite
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        for (const p of store.getPedidos()) {
          if (!todos[p.id]) {
            const sqlItens: any[] = await invoke("list_pedido_itens", { pedidoId: p.id });
            if (sqlItens && sqlItens.length > 0) todos[p.id] = sqlItens;
          }
        }
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
      // Salva no SQLite
      try {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("set_pedido_itens", { pedidoId: pedido_id, itens: itens.map(i => ({ produto_id: i.produto_id || 0, produto_nome: i.produto_nome, unidade: i.unidade || null, quantidade: i.quantidade })) }).catch(() => {});
        });
      } catch {}
      return Promise.resolve();
    },
  },

  // ---- Alertas ----
  alertas: {
    list: () => apiCall<Alerta[]>("list_alertas", {}, () => store.getAlertas()),
    markLido: (id: number) => apiCall<void>("mark_alerta_lido", { id }, () => {
      store.markAlertaLido(id);
    }),
  },
};

// ============================================================================
//  Sync helper: load from Tauri -> store on app start
// ============================================================================
export async function syncAllFromBackend() {
  const invoke = await getInvoke();
  if (!invoke) return false;
  // Se o sistema foi resetado, não recarregar dados do SQLite
  if (localStorage.getItem("almox_reset_done") === "1") {
    localStorage.removeItem("almox_reset_done");
    return false;
  }
  // Busca cada tabela individualmente — falha de uma não quebra as outras
  const tabelas = [
    { key: "lojas", cmd: "list_lojas", set: (d: any) => { if (!localStorage.getItem("almox_lojas") || JSON.parse(localStorage.getItem("almox_lojas") || "[]").length === 0) store.setLojas(d); } },
    { key: "categorias", cmd: "list_categorias", set: (d: any) => store.setCategorias(d) },
    { key: "produtos", cmd: "list_produtos", set: (d: any) => { persist("almox_produtos", d); store.setProdutos(d); } },
    { key: "usuarios", cmd: "list_usuarios", set: (d: any) => store.setUsuarios(d) },
    { key: "movimentacoes", cmd: "list_movimentacoes", set: (d: any) => store.setMovimentacoes(d) },
    { key: "solicitacoes", cmd: "list_solicitacoes", set: (d: any) => store.setSolicitacoes(d) },
    { key: "pedidos", cmd: "list_pedidos", set: (d: any) => store.setPedidos(d) },
    { key: "alertas", cmd: "list_alertas", set: (d: any) => { if (!localStorage.getItem("almox_alertas")) store.setAlertas(d); } },
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
