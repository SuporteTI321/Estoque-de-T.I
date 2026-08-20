import type { ReactNode } from "react";
import { useAuth } from "../lib/useAuth";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Login from "../pages/Login";

interface LayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function Layout({ title, subtitle, children }: LayoutProps) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Carregando...
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="flex h-screen w-full bg-gray-50">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col">
        <Header
          user={user}
          title={title}
          subtitle={subtitle}
          onLogout={() => {
            logout();
            navigate("/");
          }}
        />
        <main className="flex-1 overflow-y-auto p-6 scrollbar-hide">{children}</main>
      </div>
    </div>
  );
}
