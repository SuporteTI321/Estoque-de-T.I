import { CalendarDays, ChevronDown, ChevronRight, Package, Eye, X } from "lucide-react";

export const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ---------- Filtro Ano/Mês ----------
export function FiltroAnoMes({ anos, ano, setAno, meses, mes, setMes }: {
  anos: number[]; ano: number; setAno: (a: number) => void;
  meses: number[]; mes: number; setMes: (m: number) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1">
        <CalendarDays className="h-4 w-4 text-gray-400" />
        {anos.map(a => <button key={a} onClick={() => setAno(a)} className={`rounded px-2 py-0.5 text-xs font-medium ${ano === a ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{a}</button>)}
      </div>
      {meses.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setMes(-1)} className={`rounded px-2 py-0.5 text-xs font-medium ${mes === -1 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todos</button>
          {meses.map(m => <button key={m} onClick={() => setMes(m)} className={`rounded px-2 py-0.5 text-xs font-medium ${mes === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{MESES[m]}</button>)}
        </div>
      )}
    </div>
  );
}

// ---------- Estado Vazio ----------
export function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-400">{texto}</div>;
}

// ---------- Grupo Expansível ----------
export function Grupo({ titulo, icone, corIcone, totalItens, totalQtd, totalValor, aberto, onToggle, children }: {
  titulo: string; icone: React.ReactNode; corIcone: string; totalItens?: number; totalQtd?: number; totalValor?: number;
  aberto: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const hasCount = totalItens !== undefined || totalQtd !== undefined || totalValor !== undefined;
  const parts: string[] = [];
  if (totalItens !== undefined) parts.push(`${totalItens} itens`);
  if (totalQtd !== undefined) parts.push(`${totalQtd} un`);
  if (totalValor !== undefined) parts.push(`R$ ${totalValor.toFixed(2)}`);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100 transition">
        <span className="flex items-center gap-2">{icone}{titulo}</span>
        <span className="flex items-center gap-3">
          {hasCount && <span className="text-xs font-normal text-gray-500">{parts.join(" · ")}</span>}
          {aberto ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </span>
      </button>
      {aberto && <div className="divide-y divide-gray-100">{children}</div>}
    </div>
  );
}

// ---------- SubGrupo Expansível ----------
export function SubGrupo({ titulo, subtitulo, totalItens, totalQtd, totalValor, aberto, onToggle, children }: {
  titulo: string; subtitulo: string; totalItens: number; totalQtd: number; totalValor: number;
  aberto: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-white hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          {aberto ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <span className="text-sm font-medium text-gray-800">{titulo}</span>
          {subtitulo && <span className="text-xs text-gray-500">{subtitulo}</span>}
        </div>
        <span className="text-xs text-gray-500">{totalItens} itens · {totalQtd} un · R$ {totalValor.toFixed(2)}</span>
      </div>
      {aberto && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ---------- Tabela de Itens ----------
export function Tabela({ linhas, onVer }: { linhas: Linha[]; onVer?: (l: Linha) => void }) {
  return (
    <table className="w-full text-xs">
      <thead><tr className="bg-gray-50 text-gray-500 uppercase"><th className="text-left px-4 py-2">Produto</th><th className="text-center px-4 py-2 w-16">Qtd</th><th className="text-right px-4 py-2 w-24">Valor</th><th className="text-left px-4 py-2 w-24">Data</th>{onVer && <th className="w-8"></th>}</tr></thead>
      <tbody className="divide-y divide-gray-50">
        {linhas.map(l => (
          <tr key={l.id} className="hover:bg-gray-50">
            <td className="px-4 py-2 text-gray-900 flex items-center gap-1.5"><Package className="h-3 w-3 text-gray-400 shrink-0" />{l.produto}</td>
            <td className="px-4 py-2 text-center font-semibold text-gray-900">{l.qtd}</td>
            <td className="px-4 py-2 text-right text-gray-700">{l.valor > 0 ? "R$ " + l.valor.toFixed(2) : "—"}</td>
            <td className="px-4 py-2 text-gray-500">{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
            {onVer && <td className="px-4 py-2 text-center"><button onClick={e => { e.stopPropagation(); onVer(l); }} className="text-gray-400 hover:text-blue-600"><Eye className="h-3.5 w-3.5" /></button></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- Modal Detalhe ----------
export function Modal({ item, onClose, titulo, cor }: { item: Linha; onClose: () => void; titulo: string; cor: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-gray-200 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between ${cor} text-white px-4 py-3`}><h2 className="text-sm font-semibold">{titulo}</h2><button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="overflow-y-auto px-4 py-3 space-y-2 text-sm">
          <Row label="Produto" value={item.produto} /><Row label="Quantidade" value={String(item.qtd)} />
          <Row label="Valor Total" value={"R$ " + item.valor.toFixed(2)} /><Row label="Origem" value={item.origem} />
          <Row label="Destino" value={item.destino} /><Row label="Observação" value={item.obs || "—"} />
          <Row label="Data" value={item.data ? new Date(item.data).toLocaleString("pt-BR") : "—"} />
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between items-center rounded bg-gray-50 px-3 py-2"><span className="text-gray-500 text-xs">{label}</span><span className="font-medium text-gray-900 text-xs text-right max-w-[60%]">{value}</span></div>;
}

// ---------- Tipos ----------
export type Linha = { id: number; produto: string; qtd: number; valor: number; data: string; origem: string; destino: string; obs: string };

// ---------- Helpers ----------
export function anosDeMovs(movs: { data_movimento?: string; data_pedido?: string }[]): number[] {
  const s = new Set<number>(); s.add(new Date().getFullYear());
  for (const m of movs) { const d = m.data_movimento || (m as any).data_pedido; if (d) s.add(new Date(d).getFullYear()); }
  return Array.from(s).sort((a, b) => b - a);
}

export function mesesDeMovs(movs: { data_movimento?: string }[], ano: number): number[] {
  const s = new Set<number>();
  for (const m of movs) { if (m.data_movimento && new Date(m.data_movimento).getFullYear() === ano) s.add(new Date(m.data_movimento).getMonth()); }
  return Array.from(s).sort((a, b) => a - b);
}

export function filtraData<T extends { data_movimento?: string; data_pedido?: string }>(items: T[], ano: number, mes: number): T[] {
  return items.filter(m => {
    const d = m.data_movimento || (m as any).data_pedido; if (!d) return true;
    const dt = new Date(d); if (dt.getFullYear() !== ano) return false;
    return mes < 0 || dt.getMonth() === mes;
  });
}
