// ============================================================================
//  remoteApi — Adaptador: comandos Tauri (Rust) -> Supabase (PostgREST).
//  Usado pela versao Web quando a nuvem esta configurada.
//  Cada funcao espelha o comando correspondente em src-tauri.
// ============================================================================

import * as db from "./cloudDb";

function persist(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function hojeISO() {
  return new Date().toISOString();
}

/** Cacheia resultado de listagem no localStorage (mesmas chaves do fallback). */
const LS_LISTA: Record<string, string> = {
  list_lojas: "almox_lojas",
  list_categorias: "almox_categorias",
  list_produtos: "almox_produtos",
  list_usuarios: "almox_usuarios",
  list_movimentacoes: "almox_movimentacoes",
  list_solicitacoes: "almox_solicitacoes",
  list_pedidos: "almox_pedidos",
  list_alertas: "almox_alertas",
};

/**
 * Executa um comando remoto. Retorna undefined se o comando nao for
 * suportado — assim o chamador pode cair no fallback local.
 */
export async function remoteCall<T = any>(command: string, args: any): Promise<T | undefined> {
  const a = args || {};
  switch (command) {
    // ---- CRUD generico ----
    case "list_lojas": return cache(command, await db.select("lojas"));
    case "create_loja": return (await db.insert("lojas", [a]))[0];
    case "update_loja": { const { id, ...p } = a; await db.update("lojas", { id }, p); return undefined; }
    case "delete_loja": await db.del("lojas", { id: a.id }); return undefined;

    case "list_categorias": return cache(command, await db.select("categorias"));
    case "create_categoria": return (await db.insert("categorias", [a]))[0];
    case "update_categoria": { const { id, ...p } = a; await db.update("categorias", { id }, p); return undefined; }
    case "delete_categoria": await db.del("categorias", { id: a.id }); return undefined;

    case "list_produtos": return cache(command, await db.select("produtos"));
    case "create_produto": return (await db.insert("produtos", [a]))[0];
    case "update_produto": { const { id, ...p } = a; await db.update("produtos", { id }, p); return undefined; }
    case "delete_produto": await db.del("produtos", { id: a.id }); return undefined;

    case "list_usuarios": return cache(command, await db.select("usuarios"));
    case "create_usuario": return (await db.insert("usuarios", [a]))[0];
    case "update_usuario": { const { id, ...p } = a; await db.update("usuarios", { id }, p); return undefined; }
    case "delete_usuario": await db.del("usuarios", { id: a.id }); return undefined;

    // ---- Movimentacoes ----
    case "list_movimentacoes":
      return cache(command, await db.select("movimentacoes"));
    case "create_movimentacao":
      return (await db.insert("movimentacoes", [{ data_movimento: hojeISO(), ...a }]))[0];
    case "update_movimentacao": { const { id, ...p } = a; await db.update("movimentacoes", { id }, p); return undefined; }
    case "delete_movimentacao": await db.del("movimentacoes", { id: a.id }); return undefined;

    // ---- Solicitacoes ----
    case "list_solicitacoes": return cache(command, await db.select("solicitacoes"));
    case "create_solicitacao":
      return (await db.insert("solicitacoes", [{
        status: "pendente",
        data_solicitacao: hojeISO(),
        total_itens: 0,
        ...a,
      }]))[0];
    case "update_solicitacao_status":
      await db.update("solicitacoes", { id: a.id }, { status: a.status });
      return undefined;
    case "update_solicitacao_observacao":
      await db.update("solicitacoes", { id: a.id }, { observacao: a.observacao });
      return undefined;
    case "delete_solicitacao":
      await db.del("solicitacao_itens", { solicitacao_id: a.id });
      await db.del("solicitacoes", { id: a.id });
      return undefined;
    case "list_solicitacao_itens":
      return (await db.select("solicitacao_itens", `solicitacao_id=eq.${encodeURIComponent(a.solicitacao_id)}`)) as T;
    case "add_solicitacao_item":
      return (await db.insert("solicitacao_itens", [a]))[0];
    case "remove_solicitacao_item":
      await db.del("solicitacao_itens", { id: a.id });
      return undefined;

    // ---- Pedidos ----
    case "list_pedidos": return cache(command, await db.select("pedidos"));
    case "create_pedido":
      return (await db.insert("pedidos", [{
        status: "importado",
        data_pedido: hojeISO(),
        origem: null,
        arquivo_pdf: null,
        setor: null,
        ...a,
      }]))[0];
    case "update_pedido": { const { id, ...p } = a; await db.update("pedidos", { id }, p); return undefined; }
    case "delete_pedido":
      await db.del("pedido_itens", { pedido_id: a.id });
      await db.del("pedidos", { id: a.id });
      return undefined;
    case "list_pedido_itens":
      return (await db.select("pedido_itens", `pedido_id=eq.${encodeURIComponent(a.pedidoId ?? a.pedido_id)}`)) as T;
    case "set_pedido_itens": {
      const pedidoId = a.pedidoId ?? a.pedido_id;
      await db.del("pedido_itens", { pedido_id: pedidoId });
      const itens = (a.itens || []).map((i: any) => ({
        produto_id: i.produto_id ?? 0,
        produto_nome: i.produto_nome,
        unidade: i.unidade ?? null,
        quantidade: i.quantidade,
        pedido_id: pedidoId,
      }));
      if (itens.length) await db.insert("pedido_itens", itens);
      return undefined;
    }

    // ---- Alertas ----
    case "list_alertas": return cache(command, await db.select("alertas"));
    case "mark_alerta_lido": await db.update("alertas", { id: a.id }, { lido: true }); return undefined;

    // ---- Auth ----
    case "login": {
      console.log("[remoteApi] login iniciado para:", a.email);
      const buscarUsuario = async (): Promise<any | null> => {
        // Preferência: RPC login_usuario (única porta do hash — a coluna senha
        // é bloqueada para anon no schema novo). Fallback: select direto (schema antigo).
        try {
          const rows = await db.rpc<any>("login_usuario", { p_email: a.email });
          if (Array.isArray(rows) && rows.length > 0) {
            const r = rows[0];
            return { id: r.id, nome: r.nome, email: r.email, perfil: r.perfil, loja_id: r.loja_id ?? null, loja_nome: null, ativo: r.ativo, senha: r.senha_hash };
          }
          return null;
        } catch {
          const users = await db.select<any>("usuarios", `email=eq.${encodeURIComponent(a.email)}`);
          return users.length > 0 ? users[0] : null;
        }
      };
      let erroAuth: any;
      try {
        const { user: authUser } = await db.loginSupabase(a.email, a.senha);
        console.log("[remoteApi] login Supabase auth OK");
        const u = await buscarUsuario();
        if (u) {
          // Verifica a senha contra o hash/texto armazenado — vazio nunca aceita
          if (!(await db.verificarSenha(u.senha, a.senha))) throw new Error("Credenciais inválidas");
          return { ...u, senha: "" } as T;
        }
        // Sem linha na tabela usuarios: confia no Supabase Auth
        const fallbackUser = { id: 1, nome: authUser.email?.split("@")[0] || "Usuário", email: a.email, perfil: "admin", loja_id: null, ativo: true };
        return { ...fallbackUser, senha: "" } as T;
      } catch (e: any) {
        console.log("[remoteApi] login Supabase auth falhou:", e?.message || e);
        erroAuth = e;
      }
      // Fallback legado sem Supabase Auth configurado
      try {
        const u = await buscarUsuario();
        console.log("[remoteApi] login legacy buscarUsuario:", u ? { email: u.email, senha_len: u.senha?.length } : null);
        if (!u) throw erroAuth;
        if (!(await db.verificarSenha(u.senha, a.senha))) throw new Error("Credenciais inválidas");
        return { ...u, senha: "" } as T;
      } catch (e2: any) {
        throw e2?.message ? e2 : erroAuth;
      }
    }

    default:
      return undefined; // comando sem equivalente remoto -> caller usa fallback
  }
}

function cache<T>(command: string, dados: any): T {
  const lsKey = LS_LISTA[command];
  if (lsKey && Array.isArray(dados)) {
    // Nunca persiste a coluna senha no localStorage
    const seguro = lsKey === "almox_usuarios"
      ? dados.map((u: any) => { const { senha: _s, ...resto } = u; return resto; })
      : dados;
    persist(lsKey, seguro);
  }
  return dados as T;
}
