import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, FileBarChart, Tag, ArrowLeftRight,
  Settings, RefreshCw,
} from "lucide-react";
import type { Usuario } from "../lib/types";

interface SidebarProps {
  user: Usuario;
  open?: boolean;
  onClose?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/entradas", label: "Entradas", icon: ArrowDownToLine },
  { to: "/saida-registro", label: "Saída", icon: ArrowUpFromLine },
  { to: "/transferencias", label: "Transferências", icon: ArrowLeftRight },
  { to: "/inventario", label: "Inventário", icon: BarChart3 },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag },

  { to: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
  { to: "/sincronizacao", label: "Sincronizar", icon: RefreshCw, adminOnly: true },
];

export default function Sidebar({ user, open = false, onClose }: SidebarProps) {
  const isAdmin = user.perfil === "admin";
  const items = NAV.filter(n => !n.adminOnly || isAdmin);

  return (
    <>
      {/* backdrop mobile */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={`flex w-60 shrink-0 flex-col border-r border-red-900 bg-gradient-to-b from-red-900 via-red-800 to-red-700 fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>

      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-red-900 px-5 py-4">
        {(() => { const logo = localStorage.getItem("almox_logo"); return logo ? <img src={logo} alt="Logo" className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-white/10" /> : <img src={"/icons/icon.png"} alt="Logo" className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-white/10" />; })()}
        <div>
          <div className="text-sm font-bold text-white">Controle de Estoque</div>
          <div className="text-[11px] text-red-200">Sistema de Gestão</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-white font-semibold text-red-700 shadow-md shadow-red-900/30"
                        : "text-red-100 hover:bg-red-700 hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer user */}
      <div className="border-t border-red-900 px-4 py-3 text-xs text-red-200">
        {/* Informações do usuário removidas conforme solicitado */}
      </div>
    </aside>
    </>
  );
}
