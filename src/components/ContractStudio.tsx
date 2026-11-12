"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { SpotlightCard } from "@/components/motion/SpotlightCard";

interface DraftMilestone {
  title: string;
  amount: number;
  acceptanceCriteria: string[];
}

export function ContractStudio({
  onContractCreated,
  onError,
}: {
  onContractCreated: (escrowId: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const formId = useId();
  const [prompt, setPrompt] = useState(
    "Build a responsive SaaS analytics widget and REST API for $170 split across 2 milestones: $50 for API + tests, $120 for UI + deployment."
  );
  const [title, setTitle] = useState("SaaS Analytics Widget & API");
  const [description, setDescription] = useState(
    "Milestone-based payment agreement with automated verification."
  );
  const [buyerEmail, setBuyerEmail] = useState(
    "sb-sqq47i53829411@personal.example.com"
  );
  const [contractorEmail, setContractorEmail] = useState(
    "sb-39r9k53823114@business.example.com"
  );
  const [autoReleaseCap, setAutoReleaseCap] = useState(80);
  const [milestones, setMilestones] = useState<DraftMilestone[]>([
    {
      title: "Milestone 1: REST API & Tests",
      amount: 50,
      acceptanceCriteria: [
        "Typed API endpoints implemented",
        "Automated tests pass",
      ],
    },
    {
      title: "Milestone 2: Dashboard UI & Deploy",
      amount: 120,
      acceptanceCriteria: [
        "Interactive UI integrated",
        "Deployment docs verified",
      ],
    },
  ]);

  const [drafting, setDrafting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  const totalAmount = milestones.reduce(
    (sum, m) => sum + (Number.isFinite(m.amount) ? m.amount : 0),
    0
  );

  const handleAIDraft = async () => {
    setDrafting(true);
    try {
      const res = await fetch("/api/escrows/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to draft contract");

      setTitle(data.draft.title);
      setDescription(data.draft.description);
      setMilestones(data.draft.milestones);
      setDraftReady(true);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Could not generate milestones"
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleCreateDraft = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/escrows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          buyerEmail,
          contractorEmail,
          autoReleaseCap: Number(autoReleaseCap),
          milestones: milestones.map((m) => ({
            title: m.title,
            amount: Number(m.amount),
            acceptanceCriteria: m.acceptanceCriteria.filter((c) => c.trim()),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create escrow");
      await onContractCreated(data.contract.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create contract failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <SpotlightCard className="p-6 space-y-4" spotlightColor="rgba(0, 112, 186, 0.08)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E6F2FA] text-[#003087]">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#1D1E20]">
              New Escrow Agreement
            </h2>
            <p className="text-xs text-[#545D68]">
              Define milestones and spending limits, then authorize with PayPal.
            </p>
          </div>
        </div>

        <AnimatePresence>
          {draftReady && (
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#008A54]"
            >
              Milestones Ready
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Natural Language Scope */}
      <div className="glass-subpanel rounded-2xl p-3.5 space-y-2.5">
        <label
          htmlFor={`${formId}-scope`}
          className="block text-xs font-semibold text-[#1D1E20]"
        >
          Project Scope
        </label>
        <textarea
          id={`${formId}-scope`}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] transition focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/20"
        />
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={handleAIDraft}
          disabled={drafting}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0070BA] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003087] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070BA] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {drafting ? "Generating Milestones..." : "Generate Milestones"}
        </motion.button>
      </div>

      {/* Contract Fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={`${formId}-title`}
            className="block text-[11px] font-semibold text-[#545D68]"
          >
            Agreement Title
          </label>
          <input
            id={`${formId}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-buyer`}
            className="block text-[11px] font-semibold text-[#545D68]"
          >
            Buyer PayPal Email
          </label>
          <input
            id={`${formId}-buyer`}
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-recipient`}
            className="block text-[11px] font-semibold text-[#545D68]"
          >
            Recipient PayPal Email
          </label>
          <input
            id={`${formId}-recipient`}
            type="email"
            value={contractorEmail}
            onChange={(e) => setContractorEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-cap`}
            className="block text-[11px] font-semibold text-[#545D68]"
          >
            Auto-Release Limit ($ USD)
          </label>
          <input
            id={`${formId}-cap`}
            type="number"
            min={0}
            step={5}
            value={autoReleaseCap}
            onChange={(e) => setAutoReleaseCap(Number(e.target.value))}
            className="font-mono-code mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
          />
        </div>

        <div className="flex items-end justify-between rounded-xl border border-[#B6DCF7] bg-[#E6F2FA]/70 px-3.5 py-2">
          <span className="text-xs font-medium text-[#003087]">Total</span>
          <span className="font-mono-code text-sm font-bold text-[#003087]">
            ${totalAmount.toFixed(2)} USD
          </span>
        </div>
      </div>

      {/* Milestones List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#1D1E20]">
            Milestones ({milestones.length})
          </span>
          <button
            type="button"
            onClick={() =>
              setMilestones((prev) => [
                ...prev,
                {
                  title: `Milestone ${prev.length + 1}`,
                  amount: 50,
                  acceptanceCriteria: ["Deliverable verified"],
                },
              ])
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0070BA] hover:text-[#003087]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Milestone
          </button>
        </div>

        <AnimatePresence initial={false}>
          {milestones.map((ms, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className="glass-subpanel rounded-xl p-2.5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Milestone ${idx + 1} title`}
                  value={ms.title}
                  onChange={(e) => {
                    const copy = [...milestones];
                    copy[idx] = { ...copy[idx], title: e.target.value };
                    setMilestones(copy);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#1D1E20]"
                />
                <input
                  aria-label={`Milestone ${idx + 1} amount`}
                  type="number"
                  min={1}
                  value={ms.amount}
                  onChange={(e) => {
                    const copy = [...milestones];
                    copy[idx] = {
                      ...copy[idx],
                      amount: Number(e.target.value),
                    };
                    setMilestones(copy);
                  }}
                  className="font-mono-code w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1D1E20]"
                />
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMilestones((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-slate-500 transition hover:text-[#C81E3D]"
                    aria-label={`Remove milestone ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                aria-label={`Milestone ${idx + 1} acceptance criteria`}
                value={ms.acceptanceCriteria.join("; ")}
                onChange={(e) => {
                  const copy = [...milestones];
                  copy[idx] = {
                    ...copy[idx],
                    acceptanceCriteria: e.target.value
                      .split(";")
                      .map((s) => s.trim()),
                  };
                  setMilestones(copy);
                }}
                placeholder="Acceptance criteria separated by semicolons"
                className="w-full rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] text-[#545D68]"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.985 }}
        type="button"
        onClick={handleCreateDraft}
        disabled={creating}
        className="w-full rounded-full bg-[#003087] py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00256A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003087] disabled:opacity-50"
      >
        {creating ? "Creating Agreement..." : "Save Agreement & Proceed to PayPal"}
      </motion.button>
    </SpotlightCard>
  );
}
