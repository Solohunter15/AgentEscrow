"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Send } from "lucide-react";
import { SpotlightCard } from "@/components/motion/SpotlightCard";

interface ProposedAction {
  type: "APPROVE_PAYOUT" | "REFUND_MILESTONE";
  escrowId: string;
  milestoneId: string;
  amount: number;
  reason: string;
  label: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  proposedAction?: ProposedAction | null;
}

export function CopilotPanel({
  selectedEscrowId,
  onExecuted,
  onError,
}: {
  selectedEscrowId: string | null;
  onExecuted: (escrowId?: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [input, setInput] = useState(
    "Summarize the current escrow status and let me know what action is needed next."
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Ask me about any agreement balance, milestone status, or recommended release or refund. Payments always require your confirmation.",
    },
  ]);
  const [loading, setLoading] = useState(false);

  const sendQuery = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          escrowId: selectedEscrowId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assistant request failed");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          proposedAction: data.proposedAction ?? null,
        },
      ]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Assistant failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async (action: ProposedAction) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Confirmed: ${action.label}`,
          confirmAction: {
            type: action.type,
            escrowId: action.escrowId,
            milestoneId: action.milestoneId,
            amount: action.amount,
            reason: action.reason,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action execution failed");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply },
      ]);
      await onExecuted(action.escrowId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpotlightCard className="p-6 flex flex-col gap-3" spotlightColor="rgba(0, 112, 186, 0.08)">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E6F2FA] text-[#003087]">
          <Bot className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-[#1D1E20]">
            Escrow Assistant
          </h2>
          <p className="text-[11px] text-[#545D68]">
            Review balances and approve recommended actions
          </p>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1">
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22 }}
              className={`rounded-2xl p-3 text-xs ${
                m.role === "user"
                  ? "ml-6 bg-[#003087] text-white"
                  : "mr-4 border border-slate-200 bg-[#F5F7FA] text-[#1D1E20]"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
              {m.proposedAction && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={loading}
                  onClick={() => confirmAction(m.proposedAction!)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#008A54] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {m.proposedAction.label}
                </motion.button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex gap-2">
        <input
          aria-label="Ask Escrow Assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void sendQuery();
          }}
          placeholder="Ask about an agreement or milestone..."
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-[#1D1E20] focus:border-[#0070BA] focus:outline-none"
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={sendQuery}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0070BA] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003087] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Ask
        </motion.button>
      </div>
    </SpotlightCard>
  );
}
