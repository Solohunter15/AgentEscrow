"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 2,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(0);

  useEffect(() => {
    const controls = animate(prevRef.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    prevRef.current = value;
    return () => controls.stop();
  }, [value]);

  return (
    <span className={`font-mono-code tabular-nums ${className}`}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

