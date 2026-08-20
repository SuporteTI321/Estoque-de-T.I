import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  icon: ReactNode;
  iconBg: string; // tailwind classes (e.g. "bg-blue-50 text-blue-600")
  label: string;
  value: string | number;
  helper?: string;
  trend?: { value: number; positive?: boolean };
}

export default function StatCard({ icon, iconBg, label, value, helper, trend }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend.positive ? "text-emerald-600" : "text-red-600"}`}>
            {trend.positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {trend.value > 0 ? "+" : ""}{trend.value}%
          </div>
        )}
      </div>
      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {helper && <div className="mt-0.5 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}
