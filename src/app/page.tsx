"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { ContractStudio } from "@/components/ContractStudio";
import { CopilotPanel } from "@/components/CopilotPanel";
import { EscrowGrid } from "@/components/EscrowGrid";
import { MilestoneDrawer } from "@/components/MilestoneDrawer";
import { PayPalProvider } from "@/components/PayPalProvider";
import { TelemetryGrid } from "@/components/TelemetryGrid";
import { BlurText } from "@/components/motion/BlurText";
import { CountUp } from "@/components/motion/CountUp";
import { GlassVault3D } from "@/components/motion/GlassVault3D";
import {
  ScrollProgressBar,
  ScrollReveal,
} from "@/components/motion/ScrollReveal";
import { SpotlightCard } from "@/components/motion/SpotlightCard";
import type {
  AuditLogEntry,
  EscrowContract,
  WebhookEventRecord,
} from "@/lib/types";

interface HealthPayload {
  ok: boolean;
  paypal: {
    configured: boolean;
    mode: string;
    webhookVerificationEnabled: boolean;
    publicClientIdSet: boolean;
    publicClientId: string | null;
  };
}

export default function HomePage() {
  const [contracts, setContracts] = useState<EscrowContract[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [selectedEscrowId, setSelectedEscrowId] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"review" | "create">("review");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const selectedEscrowRef = useRef<string | null>(null);
  selectedEscrowRef.current = selectedEscrowId;

  const loadAll = useCallback(async (preferEscrowId?: string) => {
    try {
      const [dbRes, healthRes] = await Promise.all([
        fetch("/api/escrows", { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
      ]);
      const dbJson = await dbRes.json();
      const healthJson = await healthRes.json();
      setContracts(dbJson.contracts ?? []);
      setAuditLogs(dbJson.auditLogs ?? []);
      setWebhookEvents(dbJson.webhookEvents ?? []);
      setHealth(healthJson);

      const list: EscrowContract[] = dbJson.contracts ?? [];
      const targetId =
        preferEscrowId ?? selectedEscrowRef.current ?? list[0]?.id ?? null;
      if (targetId && list.length > 0) {
        const match = list.find((c) => c.id === targetId) ?? list[0];
        if (match) {
          setSelectedEscrowId(match.id);
          setSelectedMilestoneId((prev) =>
            match.milestones.some((m) => m.id === prev)
              ? prev
              : match.milestones[0]?.id ?? null
          );
        }
      } else {
        setSelectedEscrowId(null);
        setSelectedMilestoneId(null);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Failed to load escrow data"
      );
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const publicPayPalClientId =
    health?.paypal.publicClientId ||
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    undefined;

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedEscrowId) ?? null,
    [contracts, selectedEscrowId]
  );

  const selectedMilestone = useMemo(
    () =>
      selectedContract?.milestones.find((m) => m.id === selectedMilestoneId) ??
      selectedContract?.milestones[0] ??
      null,
    [selectedContract, selectedMilestoneId]
  );

  const kpis = useMemo(() => {
    let escrowed = 0;
    let paidOut = 0;
    let refunded = 0;
    let pending = 0;

    for (const c of contracts) {
      if (c.paypalAuthorizationId || c.paypalCaptureId) {
        escrowed += c.totalAmount;
      } else if (c.status === "DRAFT") {
        pending += c.totalAmount;
      }
      for (const m of c.milestones) {
        paidOut += m.settledAmount;
        refunded += m.refundedAmount;
      }
    }
    return { escrowed, paidOut, refunded, pending };
  }, [contracts]);

  const journeyStep = useMemo(() => {
    if (!selectedContract) return 0;
    if (
      selectedContract.status === "COMPLETED" ||
      selectedContract.status === "REFUNDED"
    ) {
      return 3;
    }
    if (
      selectedContract.paypalAuthorizationId ||
      selectedContract.paypalCaptureId
    ) {
      return 2;
    }
    return 1;
  }, [selectedContract]);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/escrows/seed-demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load demo");
      setActiveTab("review");
      await loadAll(data.contract.id);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Could not load demo"
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <PayPalProvider clientId={publicPayPalClientId}>
        <ScrollProgressBar />

        <div className="min-h-screen">
          {/* Official PayPal Light Frosted Navbar */}
          <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-[#F5F7FA] shadow-2xs">
                  <span className="h-4 w-4 -translate-x-0.5 rounded-sm bg-[#003087]" />
                  <span className="absolute h-4 w-4 translate-x-1 translate-y-0.5 rounded-sm bg-[#0070E0]/85 mix-blend-multiply" />
                </div>
                <span className="text-lg font-extrabold tracking-tight text-[#003087]">
                  Agent<span className="text-[#0070E0]">Escrow</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F5F7FA] px-3 py-1 text-xs font-medium text-[#545D68]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      health?.paypal.configured
                        ? "bg-[#008A54]"
                        : "bg-amber-500"
                    }`}
                  />
                  {health?.paypal.mode === "live" ? "Live" : "Sandbox"}
                </span>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleSeedDemo}
                  disabled={seeding}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#003087] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00256A] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {seeding ? "Loading..." : "Load Demo Contract"}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => void loadAll()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1D1E20] transition hover:border-[#0070BA] hover:text-[#0070BA]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </motion.button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
            {/* Editorial Light Hero + Interactive 3D PayPal Vault */}
            <section className="glass-panel relative overflow-hidden rounded-3xl p-7 md:p-10">
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="lg:col-span-7 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#0070BA]">
                    Milestone Escrow for Digital Work
                  </p>

                  <h1 className="text-3xl font-extrabold tracking-tight text-[#003087] sm:text-4xl lg:text-[44px] lg:leading-[1.1]">
                    <BlurText text="Protected payments," />{" "}
                    <span className="font-serif-display italic font-normal text-[#0070E0]">
                      <BlurText text="released on proof." delayOffset={0.2} />
                    </span>
                  </h1>

                  <p className="max-w-xl text-sm leading-relaxed text-[#545D68]">
                    Agree on clear milestones, hold funds safely through PayPal,
                    and verify completed deliverables before money moves—with
                    built-in approval limits and instant buyer refunds.
                  </p>
                </div>

                <div className="lg:col-span-5">
                  <GlassVault3D
                    escrowedAmount={kpis.escrowed}
                    paidOutAmount={kpis.paidOut}
                    pendingAmount={kpis.pending}
                  />
                </div>
              </div>
            </section>

            {/* Pop-in / Pop-out Alert Banner */}
            <AnimatePresence>
              {errorBanner && (
                <motion.div
                  role="alert"
                  aria-live="polite"
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-[#C81E3D]"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorBanner(null)}
                    className="font-semibold underline"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 4 Clean PayPal-Styled Metric Cards */}
            <ScrollReveal>
              <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SpotlightCard
                  className="p-5"
                  spotlightColor="rgba(0, 112, 186, 0.08)"
                >
                  <div className="text-xs font-semibold text-[#545D68]">
                    Held in Escrow
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#003087]">
                    <CountUp value={kpis.escrowed} prefix="$" />
                  </div>
                </SpotlightCard>

                <SpotlightCard
                  className="p-5"
                  spotlightColor="rgba(0, 138, 84, 0.09)"
                >
                  <div className="text-xs font-semibold text-[#545D68]">
                    Released
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#008A54]">
                    <CountUp value={kpis.paidOut} prefix="$" />
                  </div>
                </SpotlightCard>

                <SpotlightCard
                  className="p-5"
                  spotlightColor="rgba(200, 30, 61, 0.08)"
                >
                  <div className="text-xs font-semibold text-[#545D68]">
                    Refunded
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#C81E3D]">
                    <CountUp value={kpis.refunded} prefix="$" />
                  </div>
                </SpotlightCard>

                <SpotlightCard
                  className="p-5"
                  spotlightColor="rgba(0, 112, 224, 0.08)"
                >
                  <div className="text-xs font-semibold text-[#545D68]">
                    Active Agreements
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#0070BA]">
                    <CountUp value={contracts.length} decimals={0} />
                  </div>
                </SpotlightCard>
              </section>
            </ScrollReveal>

            {/* Escrow Ledger */}
            <ScrollReveal delay={0.04}>
              <EscrowGrid
                contracts={contracts}
                selectedEscrowId={selectedEscrowId}
                onSelectRow={(escrowId, milestoneId) => {
                  setSelectedEscrowId(escrowId);
                  setSelectedMilestoneId(milestoneId);
                  setActiveTab("review");
                }}
              />
            </ScrollReveal>

            {/* Guided Stepper + Clean Tabbed Workbench */}
            <ScrollReveal delay={0.07}>
              <section className="space-y-4">
                <div className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3">
                  {/* Segmented Tab Switcher */}
                  <div
                    role="tablist"
                    aria-label="Escrow workspace mode"
                    className="inline-flex rounded-full border border-slate-200 bg-[#F5F7FA] p-1"
                  >
                    <button
                      role="tab"
                      aria-selected={activeTab === "review"}
                      type="button"
                      onClick={() => setActiveTab("review")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        activeTab === "review"
                          ? "bg-[#003087] text-white shadow-xs"
                          : "text-[#545D68] hover:text-[#1D1E20]"
                      }`}
                    >
                      Review & Settle
                    </button>
                    <button
                      role="tab"
                      aria-selected={activeTab === "create"}
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        activeTab === "create"
                          ? "bg-[#003087] text-white shadow-xs"
                          : "text-[#545D68] hover:text-[#1D1E20]"
                      }`}
                    >
                      New Agreement
                    </button>
                  </div>

                  {/* Live 3-Step Escrow Progress Indicator */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {[
                      { num: 1, label: "Authorize PayPal" },
                      { num: 2, label: "Verify Deliverable" },
                      { num: 3, label: "Release or Refund" },
                    ].map((step) => {
                      const done = journeyStep > step.num;
                      const current = journeyStep === step.num;
                      return (
                        <div
                          key={step.num}
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            done
                              ? "text-[#008A54]"
                              : current
                              ? "font-bold text-[#003087]"
                              : "text-slate-400"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#008A54]" />
                          ) : (
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                current
                                  ? "bg-[#0070BA] text-white"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {step.num}
                            </span>
                          )}
                          <span>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    <AnimatePresence mode="wait">
                      {activeTab === "review" ? (
                        <motion.div
                          key="tab-review"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                        >
                          <MilestoneDrawer
                            paypalPublicConfigured={Boolean(
                              health?.paypal.publicClientIdSet
                            )}
                            contract={selectedContract}
                            milestone={selectedMilestone}
                            onUpdated={loadAll}
                            onError={setErrorBanner}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="tab-create"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ContractStudio
                            onContractCreated={async (id) => {
                              setActiveTab("review");
                              await loadAll(id);
                            }}
                            onError={setErrorBanner}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="lg:col-span-5">
                    <CopilotPanel
                      selectedEscrowId={selectedEscrowId}
                      onExecuted={loadAll}
                      onError={setErrorBanner}
                    />
                  </div>
                </div>
              </section>
            </ScrollReveal>

            {/* Settlement & Activity History */}
            <ScrollReveal delay={0.1}>
              <TelemetryGrid
                auditLogs={auditLogs}
                webhookEvents={webhookEvents}
              />
            </ScrollReveal>
          </main>
        </div>
      </PayPalProvider>
    </MotionConfig>
  );
}
