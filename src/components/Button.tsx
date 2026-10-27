interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

// Modelo B10 "Polido": gradiente vertical + filete de brilho inset no topo.
// Mesmo idioma visual da sidebar (degradê), sombra colorida no hover.
const variants: Record<string, string> = {
  primary:
    "text-white bg-gradient-to-b from-blue-500 to-blue-600 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_1px_2px_rgba(17,24,39,.08)] hover:from-blue-600 hover:to-blue-700 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_4px_14px_rgba(37,99,235,.30)]",
  secondary:
    "text-gray-900 bg-gradient-to-b from-white to-gray-100 border border-gray-300 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(17,24,39,.06)] hover:from-gray-100 hover:bg-gray-100",
  ghost: "text-gray-700 hover:bg-gray-100",
  danger:
    "text-white bg-gradient-to-b from-red-600 to-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_1px_2px_rgba(17,24,39,.08)] hover:from-red-700 hover:to-red-800 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_4px_14px_rgba(220,38,38,.25)]",
  success:
    "text-white bg-gradient-to-b from-emerald-500 to-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_1px_2px_rgba(17,24,39,.08)] hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_4px_14px_rgba(16,185,129,.25)]",
};

const sizes: Record<string, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
