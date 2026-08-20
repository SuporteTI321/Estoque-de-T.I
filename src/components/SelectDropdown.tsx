import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search, Plus, X } from "lucide-react";

interface Option {
  value: string;
  label: string;
  sub?: string;
}

interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export default function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  allowCustom = false,
  className = "",
  disabled = false,
  label,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setCustomValue("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedLabel = options.find((o) => o.value === value)?.label || "";

  function select(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
    setCustomValue("");
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open); }}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-left transition flex items-center justify-between gap-2 ${
          open ? "border-blue-400 ring-2 ring-blue-50" : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} bg-white`}
      >
        <span className="flex items-center gap-2 truncate">
          {value ? (
            <>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 shrink-0">
                {selectedLabel.charAt(0).toUpperCase()}
              </span>
              <span className="text-gray-900 truncate">{selectedLabel}</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); select(""); }}
              className="rounded-full p-0.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          {/* Busca */}
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && !allowCustom ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                Nenhum resultado encontrado
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => select(o.value)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition ${
                    value === o.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                    value === o.value ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-500"
                  }`}>
                    {o.label.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{o.label}</div>
                    {o.sub && <div className="text-[11px] text-gray-400 truncate">{o.sub}</div>}
                  </div>
                  {value === o.value && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </button>
              ))
            )}

            {/* Input customizado */}
            {allowCustom && (
              <div className="border-t border-gray-100 p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="Novo solicitante..."
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:bg-white"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customValue.trim()) select(customValue.trim());
                      if (e.key === "Escape") { setOpen(false); setCustomValue(""); }
                    }}
                  />
                  {customValue.trim() && (
                    <button
                      type="button"
                      onClick={() => select(customValue.trim())}
                      className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 transition"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
