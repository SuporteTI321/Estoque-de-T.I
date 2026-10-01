import { useEffect, useState } from "react";

/**
 * Aviso de falha ao gravar no banco.
 *
 * A camada de API (lib/api.ts) tenta o backend do Tauri e, se a chamada falha,
 * cai no fallback local (localStorage) **sem mostrar nada**. Na prática o usuário
 * clicava em Concluir/Excluir e o registro sumia ao fechar o programa, sem ele
 * ficar sabendo. Este componente escuta o evento `almox-api-error` e mostra o que
 * deu errado.
 */
interface Aviso {
  id: number;
  comando: string;
  mensagem: string;
}

export default function AvisoApi() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    function onErro(e: Event) {
      const d = (e as CustomEvent).detail as { command?: string; origem?: string; message?: string };
      setAviso({
        id: Date.now(),
        comando: d.command || "comando",
        mensagem: d.message || "erro desconhecido",
      });
    }
    window.addEventListener("almox-api-error", onErro);
    return () => window.removeEventListener("almox-api-error", onErro);
  }, []);

  // some sozinho depois de 12s, mas fica até o usuário fechar
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 12000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!aviso) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[360px] max-w-[90vw] rounded-xl border border-red-300 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">!</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">Não foi possível gravar no banco</div>
          <div className="mt-1 break-words text-[11px] text-gray-600">
            <b>{aviso.comando}</b>: {aviso.mensagem}
          </div>
          <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            A alteração ficou só nesta sessão e será perdida ao fechar o programa.
          </div>
          <button
            onClick={() => setAviso(null)}
            className="mt-2 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}