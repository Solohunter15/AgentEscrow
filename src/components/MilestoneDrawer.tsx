"use client";

import { useId, useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SpotlightCard } from "@/components/motion/SpotlightCard";
import type { EscrowContract, Milestone } from "@/lib/types";

export function MilestoneDrawer({
  paypalPublicConfigured,
  contract,
  milestone,
  onUpdated,
  onError,
}: {
  paypalPublicConfigured: boolean;
  contract: EscrowContract | null;
  milestone: Milestone | null;
  onUpdated: (escrowId?: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const formId = useId();
  const [proofUrl, setProofUrl] = useState(
    "https://github.com/example/agentescrow-proof/pull/42"
  );
  const [notes, setNotes] = useState("");
  const [artifactText, setArtifactText] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState(
    "Deliverable did not meet agreed criteria"
  );
  const [busy, setBusy] = useState<string | null>(null);

  if (!contract || !milestone) {
    return (
      <SpotlightCard className="p-8 text-center">
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E6F2FA] text-[#003087]">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium text-[#545D68]">
          Select any milestone row from the Escrow Ledger above—or click{" "}
          <strong>Load Demo Contract</strong>—to authorize funding, submit work,
          and release or refund funds.
        </p>
      </SpotlightCard>
    );
  }

  const remaining = Math.max(
    0,
    milestone.amount - milestone.settledAmount - milestone.refundedAmount
  );

  const isFunded = Boolean(
    contract.paypalAuthorizationId || contract.paypalCaptureId
  );

  const handleDeleteDraft = async () => {
    setBusy("delete");
    try {
      const res = await fetch(`/api/escrows/${contract.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove draft");
      await onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSubmitProof = async () => {
    setBusy("submit");
    try {
      const res = await fetch(
        `/api/escrows/${contract.id}/milestones/${milestone.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofUrl, notes, artifactText }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      await onUpdated(contract.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  };

  const handleApprovePayout = async () => {
    setBusy("payout");
    try {
      const res = await fetch(
        `/api/escrows/${contract.id}/milestones/${milestone.id}/approve-payout`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Release failed");
      await onUpdated(contract.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Release failed");
    } finally {
      setBusy(null);
    }
  };

  const handleRefund = async () => {
    setBusy("refund");
    try {
      const parsedAmount = refundAmount.trim()
        ? Number(refundAmount)
        : undefined;
      const res = await fetch(
        `/api/escrows/${contract.id}/milestones/${milestone.id}/refund`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parsedAmount,
            reason: refundReason,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refund failed");
      await onUpdated(contract.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(null);
    }
  };

  const canSubmit =
    isFunded &&
    milestone.status !== "PAID_OUT" &&
    milestone.status !== "REFUNDED" &&
    milestone.status !== "PARTIAL_REFUND";

  return (
    <SpotlightCard className="p-6" spotlightColor="rgba(0, 112, 186, 0.08)">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${contract.id}-${milestone.id}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0070BA]">
                {contract.title}
              </span>
              <h2 className="mt-0.5 text-base font-bold text-[#1D1E20]">
                {milestone.title}{" "}
                <span className="font-mono-code text-[#003087]">
                  (${milestone.amount.toFixed(2)})
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-[#545D68]">
                Auto-release limit: ${contract.autoReleaseCap.toFixed(2)} •
                Remaining: ${remaining.toFixed(2)}
              </p>
            </div>

            <div className="flex items-start gap-2">
              <div className="glass-subpanel rounded-xl px-3 py-2 text-right text-[11px] text-[#545D68] space-y-0.5">
                <div>
                  Order:{" "}
                  <code className="font-mono-code font-semibold text-[#1D1E20]">
                    {contract.paypalOrderId ?? "Pending"}
                  </code>
                </div>
                {contract.paypalAuthorizationId && (
                  <div>
                    Hold ID:{" "}
                    <code className="font-mono-code font-semibold text-[#003087]">
                      {contract.paypalAuthorizationId}
                    </code>
                  </div>
                )}
                {(milestone.paypalCaptureId ||
                  milestone.paypalPayoutBatchId) && (
                  <div>
                    Settled:{" "}
                    <code className="font-mono-code font-semibold text-[#008A54]">
                      {milestone.paypalCaptureId ??
                        milestone.paypalPayoutBatchId}
                    </code>
                  </div>
                )}
                {milestone.paypalRefundId && (
                  <div>
                    Refund:{" "}
                    <code className="font-mono-code font-semibold text-[#C81E3D]">
                      {milestone.paypalRefundId}
                    </code>
                  </div>
                )}
              </div>

              {contract.status === "DRAFT" && !isFunded && (
                <button
                  type="button"
                  onClick={handleDeleteDraft}
                  disabled={busy !== null}
                  aria-label="Delete draft agreement"
                  title="Delete unfunded draft"
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-[#C81E3D] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Contextual PayPal Checkout Box directly inside Draft Review */}
          {!isFunded && contract.status === "DRAFT" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[#B6DCF7] bg-gradient-to-br from-[#E6F2FA] to-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#003087]">
                  <ShieldCheck className="h-4 w-4 text-[#0070BA]" />
                  Step 1: Authorize ${contract.totalAmount.toFixed(2)} USD in
                  PayPal Escrow
                </div>
                <span className="text-[11px] font-medium text-[#545D68]">
                  Buyer: {contract.buyerEmail}
                </span>
              </div>

              {paypalPublicConfigured ? (
                <PayPalButtons
                  style={{ layout: "horizontal", height: 42, tagline: false }}
                  createOrder={async () => {
                    const res = await fetch("/api/paypal/orders", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ escrowId: contract.id }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      onError(data.error || "Failed to create PayPal order");
                      throw new Error(data.error || "Order creation failed");
                    }
                    return data.orderId;
                  }}
                  onApprove={async (data) => {
                    const res = await fetch(
                      `/api/paypal/orders/${encodeURIComponent(
                        data.orderID
                      )}/capture`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ escrowId: contract.id }),
                      }
                    );
                    const out = await res.json();
                    if (!res.ok) {
                      onError(out.error || "PayPal authorization failed");
                      return;
                    }
                    await onUpdated(contract.id);
                  }}
                  onError={(err) => {
                    onError(
                      err instanceof Error
                        ? err.message
                        : "PayPal Checkout encountered an error"
                    );
                  }}
                />
              ) : (
                <p className="text-[11px] text-amber-800">
                  Add your PayPal Client ID and Secret in{" "}
                  <code>.env.local</code> to enable PayPal Checkout.
                </p>
              )}
            </motion.div>
          )}

          {/* Acceptance Criteria */}
          <div className="glass-subpanel rounded-2xl p-3.5">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#545D68]">
              Acceptance Criteria
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-[#1D1E20]">
              {milestone.acceptanceCriteria.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
          </div>

          {/* Deliverable Submission */}
          {canSubmit && (
            <div className="glass-subpanel rounded-2xl p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1D1E20]">
                  Submit Deliverable for Verification
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNotes(
                        "Implemented all required endpoints, schema validation, and verified test suite."
                      );
                      setArtifactText(
                        "Deliverable summary: Implemented typed REST API endpoints with Zod schema validation, PayPal payment authorization verification, and unit tests. All test cases pass with zero warnings."
                      );
                    }}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-[#008A54] transition hover:bg-emerald-100"
                  >
                    Fill Verified Work
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotes("Incomplete draft - TODO add tests");
                      setArtifactText("TODO incomplete placeholder");
                    }}
                    className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-[#C81E3D] transition hover:bg-rose-100"
                  >
                    Fill Incomplete Work
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-proof`} className="sr-only">
                  Deliverable URL
                </label>
                <input
                  id={`${formId}-proof`}
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="Deliverable link (https://...)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-notes`} className="sr-only">
                  Summary notes
                </label>
                <input
                  id={`${formId}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summary notes for reviewer"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-artifact`} className="sr-only">
                  Deliverable proof details
                </label>
                <textarea
                  id={`${formId}-artifact`}
                  rows={3}
                  value={artifactText}
                  onChange={(e) => setArtifactText(e.target.value)}
                  placeholder="Paste deliverable output, test results, or completion details..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/15"
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                type="button"
                onClick={handleSubmitProof}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0070BA] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003087] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {busy === "submit"
                  ? "Verifying Deliverable..."
                  : "Submit & Verify Deliverable"}
              </motion.button>
            </div>
          )}

          {/* Verification Result */}
          <AnimatePresence>
            {milestone.aiAudit && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {milestone.aiAudit.verdict === "PASS" ? (
                      <CheckCircle2 className="h-4 w-4 text-[#008A54]" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                    )}
                    <span className="text-xs font-bold text-[#1D1E20]">
                      Verification: {milestone.aiAudit.verdict} (
                      {milestone.aiAudit.confidence}% confidence)
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#545D68]">
                  {milestone.aiAudit.summary}
                </p>
                <div className="space-y-1.5 pt-1">
                  {milestone.aiAudit.criteriaResults.map((cr, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-[11px] text-[#545D68]"
                    >
                      <span
                        className={
                          cr.met
                            ? "font-bold text-[#008A54]"
                            : "font-bold text-[#C81E3D]"
                        }
                      >
                        {cr.met ? "✓" : "✕"}
                      </span>
                      <span>
                        <strong className="text-[#1D1E20]">
                          {cr.criterion}:
                        </strong>{" "}
                        {cr.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Release / Refund Controls */}
          {isFunded && remaining > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                type="button"
                onClick={handleApprovePayout}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#003087] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00256A] disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy === "payout"
                  ? "Releasing Payment..."
                  : `Approve & Release $${remaining.toFixed(2)}`}
              </motion.button>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    aria-label="Refund amount"
                    type="number"
                    min={1}
                    max={remaining}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={`Full ($${remaining.toFixed(2)})`}
                    className="font-mono-code w-28 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] text-[#1D1E20]"
                  />
                  <input
                    aria-label="Refund reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Reason"
                    className="flex-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] text-[#1D1E20]"
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  onClick={handleRefund}
                  disabled={busy !== null}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#C81E3D] py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {busy === "refund"
                    ? "Returning Funds..."
                    : "Return / Refund to Buyer"}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </SpotlightCard>
  );
}
