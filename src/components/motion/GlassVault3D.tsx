"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";

export function GlassVault3D({
  escrowedAmount,
  paidOutAmount,
  pendingAmount = 0,
}: {
  escrowedAmount: number;
  paidOutAmount: number;
  pendingAmount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [9, -9]), {
    stiffness: 180,
    damping: 22,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-11, 11]), {
    stiffness: 180,
    damping: 22,
  });

  const layerShiftX = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), {
    stiffness: 160,
    damping: 20,
  });
  const layerShiftY = useSpring(useTransform(mouseY, [-0.5, 0.5], [-8, 8]), {
    stiffness: 160,
    damping: 20,
  });

  return (
    <div
      ref={containerRef}
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
        mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onMouseLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
      className="relative flex h-[270px] w-full items-center justify-center [perspective:1100px]"
    >
      <motion.div
        style={{ x: layerShiftX, y: layerShiftY }}
        className="animate-float-slow pointer-events-none absolute right-5 top-2 h-24 w-24 rounded-full border border-white/90 bg-gradient-to-br from-[#009CDE]/25 via-white/75 to-[#0070E0]/20 shadow-[0_18px_40px_rgba(0,112,224,0.16)] backdrop-blur-xl"
      />
      <motion.div
        style={{ x: layerShiftY, y: layerShiftX }}
        className="pointer-events-none absolute bottom-4 left-4 h-16 w-16 rounded-full border border-white/90 bg-gradient-to-tr from-[#FFC439]/35 via-white/80 to-[#0070BA]/15 shadow-[0_12px_30px_rgba(0,48,135,0.12)] backdrop-blur-xl"
      />

      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[390px] rounded-3xl border border-white/95 bg-gradient-to-br from-[#003087] via-[#004ea8] to-[#0070E0] p-6 text-white shadow-[0_28px_65px_-18px_rgba(0,48,135,0.42)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-md">
              <Lock className="h-4 w-4 text-[#FFC439]" />
            </span>
            <div>
              <div className="text-[11px] font-semibold text-sky-100">
                PayPal Escrow Protection
              </div>
              <div className="text-sm font-bold tracking-tight">
                Milestone Hold Vault
              </div>
            </div>
          </div>
          <span className="rounded-full bg-[#FFC439] px-2.5 py-0.5 text-[10px] font-extrabold text-[#003087]">
            PROTECTED
          </span>
        </div>

        <div
          style={{ transform: "translateZ(26px)" }}
          className="mt-5 rounded-2xl border border-white/20 bg-white/12 p-4 backdrop-blur-xl"
        >
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] text-sky-100/90">Held in Escrow</div>
              <div className="font-mono-code mt-0.5 text-2xl font-bold tracking-tight text-white">
                ${escrowedAmount.toFixed(2)}
              </div>
              {pendingAmount > 0 && (
                <div className="font-mono-code mt-0.5 text-[10px] text-sky-100/80">
                  +${pendingAmount.toFixed(2)} awaiting funding
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] text-sky-100/90">Released</div>
              <div className="font-mono-code mt-0.5 text-base font-bold text-[#FFC439]">
                ${paidOutAmount.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-between rounded-xl bg-white/12 px-3 py-1.5 text-[11px] font-medium text-sky-50">
            <span>Hold</span>
            <ArrowRight className="h-3 w-3 text-[#FFC439]" />
            <span>Verify Work</span>
            <ArrowRight className="h-3 w-3 text-[#FFC439]" />
            <span>Release or Refund</span>
          </div>
        </div>

        <div
          style={{ transform: "translateZ(34px)" }}
          className="mt-3.5 flex items-center gap-1.5 text-[11px] font-medium text-sky-100"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-[#FFC439]" />
          Funds stay authorized until work passes review
        </div>
      </motion.div>
    </div>
  );
}
