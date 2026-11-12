"use client";

import type { ReactNode } from "react";

export function ShinyPill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-md ${className}`}
    >
      <span className="shiny-text">{children}</span>
    </span>
  );
}

