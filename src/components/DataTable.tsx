import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  headerAlign?: "left" | "center" | "right";
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKey?: keyof T;
  searchKeys?: (keyof T)[];
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
  extraFilters?: ReactNode;
  pageSize?: number;
  /** Enable row selection checkboxes */
  selectable?: boolean;
  selectedIds?: Set<number | string>;
  onSelectionChange?: (ids: Set<number | string>) => void;
}

export default function DataTable<T extends { id: number | string }>({
  data, columns, searchPlaceholder = "Buscar...", searchKey, searchKeys,
  emptyMessage = "Nenhum registro encontrado", actions, extraFilters,
  pageSize = 20, selectable, selectedIds, onSelectionChange,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const sel = selectedIds ?? new Set();

  const filtered = useMemo(() => {
    if (!search) return data;
    const term = search.toLowerCase();
    const keys = searchKeys || (searchKey ? [searchKey] : []);
    if (keys.length === 0) return data;
    return data.filter((row) =>
      keys.some((k) => {
        const v = row[k] as any;
        if (v == null) return false;
        return String(v).toLowerCase().includes(term);
      })
    );
  }, [data, search, searchKey, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const end = Math.min(start + pageSize, filtered.length);
  const paginated = filtered.slice(start, end);

  function go(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  useEffect(() => { setPage(1); }, [search]);

  const pageIds = paginated.map(r => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => sel.has(id));

  function toggleAll() {
    if (!onSelectionChange) return;
    const next = new Set(sel);
    if (allPageSelected) {
      pageIds.forEach(id => next.delete(id));
    } else {
      pageIds.forEach(id => next.add(id));
    }
    onSelectionChange(next);
  }

  function toggleOne(id: number | string) {
    if (!onSelectionChange) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  const colCount = columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {extraFilters}
      </div>
      <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
              {selectable && (
                <th className="w-10 px-3 py-2 text-center">
                  <input type="checkbox" checked={allPageSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`whitespace-nowrap px-3 py-2 ${col.headerAlign === "right" ? "text-right" : col.headerAlign === "center" ? "text-center" : col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
              {actions && <th className="whitespace-nowrap px-3 py-2 text-center">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-4 text-center text-xs text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={row.id} className={`border-b border-gray-100 transition ${sel.has(row.id) ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  {selectable && (
                    <td className="w-10 px-3 py-2 text-center">
                      <input type="checkbox" checked={sel.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key as string} className={`whitespace-nowrap px-3 py-2 text-sm ${col.align === "center" || col.align === "right" ? `text-${col.align}` : "text-left"}`}>
                      {col.render ? col.render(row) : (row[col.key as keyof T] as ReactNode)}
                    </td>
                  ))}
                  {actions && <td className="whitespace-nowrap px-3 py-2 text-center">{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          <span>{start + 1}-{end} de {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => go(current - 1)} disabled={current <= 1}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => go(p)}
                className={`min-w-[24px] rounded px-1.5 py-0.5 text-center transition ${p === current ? "bg-blue-600 text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}>
                {p}
              </button>
            ))}
            <button onClick={() => go(current + 1)} disabled={current >= totalPages}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
