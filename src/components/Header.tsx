import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, HelpCircle, Search, ChevronDown, LogOut, AlertCircle, AlertTriangle, Menu, X } from "lucide-react";
import type { Usuario, Alerta, Produto } from "../lib/types";
import { api } from "../lib/api";

const LS_DISMISS = "almox_alertas_estoque_excluidos";
const LS_SYS_DISMISS = "almox_sistema_dispensados"; // IDs virtuais (negativos) dispensados

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch { return ""; }
}

function iconeSistema(tipo: string) {
  if (tipo === "estoque_zerado") return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />;
  if (tipo === "estoque_baixo") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />;
}

function rotaSistema(tipo: string): string | null {
  if (tipo === "estoque_zerado" || tipo === "estoque_baixo") return "/produtos";
  return null;
}

interface AlertaEstoque { id: number; tipo: string; titulo: string; msg: string }

interface HeaderProps {
  user: Usuario;
  title: string;
  subtitle?: string;
  onLogout: () => void;
  onMenu?: () => void;
}

export default function Header({ user, title, subtitle, onLogout, onMenu }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navigate = useNavigate();

  // Alertas do sistema (backend) — sempre recarrega, mostra só não-lidos
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const loadSistema = useCallback(() => {
    api.alertas.list().then(dados => {
      const arr = (Array.isArray(dados) ? dados : []).filter(a => !a.lido);
      // Dispensados virtuais: mantém só os que ainda existem (reativa sozinho ao normalizar)
      let disp: number[] = [];
      try { disp = JSON.parse(localStorage.getItem(LS_SYS_DISMISS) || "[]"); if (!Array.isArray(disp)) disp = []; } catch { disp = []; }
      const ainda = disp.filter(id => arr.some(a => a.id === id));
      localStorage.setItem(LS_SYS_DISMISS, JSON.stringify(ainda));
      const visiveis = arr.filter(a => !ainda.includes(a.id));
      localStorage.setItem("almox_alertas", JSON.stringify(visiveis));
      setAlertas(visiveis);
    }).catch(() => {
      try { setAlertas((JSON.parse(localStorage.getItem("almox_alertas") || "[]") as Alerta[]).filter(a => !a.lido)); }
      catch { setAlertas([]); }
    });
  }, []);

  // Alertas de estoque dinâmicos — dispensa por ID, auto-reativa ao normalizar
  const [alertasEstoque, setAlertasEstoque] = useState<AlertaEstoque[]>([]);
  const loadEstoque = useCallback(() => {
    api.produtos.list().then(produtos => {
      let excluidos: number[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem(LS_DISMISS) || "[]");
        excluidos = Array.isArray(raw) ? raw.filter((x): x is number => typeof x === "number") : [];
      } catch { excluidos = []; }
      const arr: AlertaEstoque[] = [];
      const aindaExcluidos: number[] = [];
      for (const p of (produtos as Produto[]).filter(p => p.ativo)) {
        const critico = p.estoque === 0;
        const baixo = !critico && p.estoque <= p.estoque_minimo;
        if (!critico && !baixo) continue; // normalizou → sai da lista de dispensados (volta a alertar se cair de novo)
        if (excluidos.includes(p.id)) { aindaExcluidos.push(p.id); continue; }
        arr.push({
          id: p.id,
          tipo: critico ? "critico" : "baixo",
          titulo: p.nome,
          msg: critico ? "Sem estoque disponível" : `Estoque: ${p.estoque} un. (mín. ${p.estoque_minimo})`,
        });
      }
      localStorage.setItem(LS_DISMISS, JSON.stringify(aindaExcluidos));
      setAlertasEstoque(arr);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadSistema(); loadEstoque(); }, [loadSistema, loadEstoque]);
  // Recarrega sempre que abrir o sino — badge nunca fica defasado
  useEffect(() => { if (notifOpen) { loadSistema(); loadEstoque(); } }, [notifOpen, loadSistema, loadEstoque]);

  const totalNotificacoes = alertas.length + alertasEstoque.length;

  function dispensarEstoque(id: number) {
    const atuais: number[] = JSON.parse(localStorage.getItem(LS_DISMISS) || "[]");
    const lista = Array.isArray(atuais) ? atuais.filter(x => typeof x === "number") : [];
    if (!lista.includes(id)) lista.push(id);
    localStorage.setItem(LS_DISMISS, JSON.stringify(lista));
    setAlertasEstoque(prev => prev.filter(a => a.id !== id));
  }

  async function dispensarSistema(id: number) {
    if (id < 0) {
      // Virtual (calculado): dispensa local; volta sozinho se a condição persistir após normalizar
      let disp: number[] = [];
      try { disp = JSON.parse(localStorage.getItem(LS_SYS_DISMISS) || "[]"); if (!Array.isArray(disp)) disp = []; } catch { disp = []; }
      if (!disp.includes(id)) disp.push(id);
      localStorage.setItem(LS_SYS_DISMISS, JSON.stringify(disp));
    } else {
      try { await api.alertas.markLido(id); } catch {}
    }
    setAlertas(prev => prev.filter(a => a.id !== id));
  }

  async function limparNotificacoes() {
    // Sistema: marca como lido no backend (não só esconde local)
    const virtuais = alertas.filter(a => a.id < 0).map(a => a.id);
    if (virtuais.length > 0) localStorage.setItem(LS_SYS_DISMISS, JSON.stringify(virtuais));
    for (const a of alertas) { if (a.id >= 0) { try { await api.alertas.markLido(a.id); } catch {} } }
    setAlertas([]);
    localStorage.setItem("almox_alertas", "[]");
    // Estoque: dispensa por ID (reativa sozinho quando o estoque normalizar)
    const ids = alertasEstoque.map(a => a.id);
    localStorage.setItem(LS_DISMISS, JSON.stringify(ids));
    setAlertasEstoque([]);
    setNotifOpen(false);
  }

  const initials = user.nome
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
      {onMenu && (
        <button onClick={onMenu} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 md:hidden">
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="relative hidden w-72 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar produtos, categorias, pedidos, lojas..."
          className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Bell Notifications */}
      <div className="relative" ref={notifRef}>
        <button onClick={() => setNotifOpen(!notifOpen)} className="relative rounded-lg p-2 text-gray-500 transition hover:bg-gray-100">
          <Bell className="h-5 w-5" />
          {totalNotificacoes > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {totalNotificacoes > 99 ? "99+" : totalNotificacoes}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Notificações</span>
              {totalNotificacoes > 0 && (
                <button onClick={limparNotificacoes} className="text-xs text-red-600 hover:text-red-700 font-medium">Limpar todas</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {/* Alertas de Estoque */}
              {alertasEstoque.length > 0 && (
                <div>
                  <div className="bg-amber-50 px-4 py-2 text-[11px] font-semibold uppercase text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Estoque Baixo / Indisponível
                  </div>
                  {alertasEstoque.slice(0, 10).map((a) => (
                    <div key={`est-${a.id}`} className="group flex items-start gap-2.5 border-b border-gray-50 px-4 py-2.5 last:border-0 hover:bg-gray-50 transition cursor-pointer"
                      onClick={() => { setNotifOpen(false); navigate("/entradas?novo=true&produto=" + a.id); }} title="Clique para dar entrada">
                      <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${a.tipo === "critico" ? "text-red-500" : "text-amber-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-gray-900 truncate">{a.titulo}</div>
                        <div className="text-[11px] text-gray-500">{a.msg}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); dispensarEstoque(a.id); }} title="Dispensar"
                        className="rounded p-1 text-gray-300 opacity-0 transition hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {alertasEstoque.length > 10 && (
                    <div className="px-4 py-2 text-center text-[11px] text-gray-400">
                      +{alertasEstoque.length - 10} mais alertas
                    </div>
                  )}
                </div>
              )}

              {/* Alertas do Sistema */}
              {alertas.length > 0 && (
                <div>
                  <div className="bg-blue-50 px-4 py-2 text-[11px] font-semibold uppercase text-blue-700">
                    Sistema
                  </div>
                  {alertas.map((a) => {
                    const rota = rotaSistema(a.tipo);
                    return (
                    <div key={`sys-${a.id}`} className={`group flex items-start gap-2 border-b border-gray-50 px-4 py-2.5 last:border-0 hover:bg-gray-50 transition ${rota ? "cursor-pointer" : ""}`}
                      onClick={rota ? () => { setNotifOpen(false); navigate(rota); } : undefined} title={rota ? "Clique para ver" : undefined}>
                      {iconeSistema(a.tipo)}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-gray-900">{a.titulo}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{a.mensagem}</div>
                        {a.data_alerta && <div className="text-[10px] text-gray-400 mt-0.5">{fmtData(a.data_alerta)}</div>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); dispensarSistema(a.id); }} title="Marcar como lida"
                        className="rounded p-1 text-gray-300 opacity-0 transition hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}

              {totalNotificacoes === 0 && (
                <div className="px-4 py-8 text-center text-xs text-gray-400">
                  <Bell className="mx-auto mb-2 h-8 w-8 opacity-20" />
                  Nenhuma notificação
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <button className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100">
        <HelpCircle className="h-5 w-5" />
      </button>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-gray-100"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">
            {initials || <LogOut className="h-3.5 w-3.5" />}
          </div>
          <div className="hidden text-left text-xs md:block">
            <div className="font-semibold text-gray-900">{user.nome}</div>
            <div className="text-gray-500">{user.email}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <div className="text-sm font-semibold text-gray-900">{user.nome}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
              <div className="mt-1 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase text-blue-700">
                {user.perfil}
              </div>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
