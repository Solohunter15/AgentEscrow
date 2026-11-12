"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(0, 112, 224, 0.10)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  return (
    <motion.div
      ref={ref}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 360, damping: 26 } }}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setOpacity(1);
      }}
      onMouseLeave={() => setOpacity(0)}
      className={`glass-panel relative overflow-hidden rounded-2xl transition-shadow duration-300 hover:shadow-[0_20px_48px_-14px_rgba(0,112,224,0.14)] ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(360px circle at ${coords.x}px ${coords.y}px, ${spotlightColor}, transparent 68%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

