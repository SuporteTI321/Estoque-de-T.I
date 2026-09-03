import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, FileBarChart, Tag,
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
      <aside className={`flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>

      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
        {(() => { const logo = localStorage.getItem("almox_logo"); return logo ? <img src={logo} alt="Logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" /> : <img src={"/icons/icon.png"} alt="Logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />; })()}
        <div>
          <div className="text-sm font-bold text-gray-900">Controle de Estoque</div>
          <div className="text-[11px] text-gray-500">Sistema de Gestão</div>
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
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
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
      <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
        <div className="font-semibold text-gray-700">{user.nome}</div>
        <div className="capitalize">{user.perfil}</div>
        {user.loja_nome && <div className="mt-0.5">{user.loja_nome}</div>}
      </div>
    </aside>
    </>
  );
}
