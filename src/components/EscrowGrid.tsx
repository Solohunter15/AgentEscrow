"use client";

import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { Download, Layers, Search } from "lucide-react";
import { SpotlightCard } from "@/components/motion/SpotlightCard";
import { sanitizeCsvCell } from "@/lib/security/rate-limit";
import type { EscrowContract, MilestoneStatus } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface EscrowLedgerRow {
  escrowId: string;
  contractTitle: string;
  contractStatus: string;
  milestoneId: string;
  milestoneTitle: string;
  amount: number;
  autoReleaseCap: number;
  status: MilestoneStatus;
  verdict: string;
  confidence: number | null;
  paypalRef: string;
  settledAmount: number;
  refundedAmount: number;
}

const agPayPalTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#1d1e20",
  headerBackgroundColor: "#f5f7fa",
  headerTextColor: "#545d68",
  oddRowBackgroundColor: "#fafbfd",
  rowHoverColor: "rgba(0, 112, 186, 0.06)",
  borderColor: "#e5e9f2",
  accentColor: "#0070ba",
  fontSize: 13,
});

const STATUS_STYLES: Record<string, string> = {
  PENDING_FUNDING: "bg-slate-100 text-slate-600 border-slate-200",
  LOCKED_IN_ESCROW: "bg-[#E6F2FA] text-[#005EA6] border-[#B6DCF7]",
  SUBMITTED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  AWAITING_APPROVAL: "bg-amber-50 text-amber-800 border-amber-200",
  PAID_OUT: "bg-emerald-50 text-[#008A54] border-emerald-200",
  PARTIAL_REFUND: "bg-orange-50 text-orange-800 border-orange-200",
  REFUNDED: "bg-rose-50 text-[#C81E3D] border-rose-200",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_FUNDING: "Awaiting Funding",
  LOCKED_IN_ESCROW: "Held in Escrow",
  SUBMITTED: "Under Review",
  AWAITING_APPROVAL: "Needs Approval",
  PAID_OUT: "Released",
  PARTIAL_REFUND: "Partial Refund",
  REFUNDED: "Refunded",
};

function StatusCellRenderer(params: ICellRendererParams<EscrowLedgerRow>) {
  const val = String(params.value ?? "");
  const cls =
    STATUS_STYLES[val] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {STATUS_LABELS[val] ?? val}
    </span>
  );
}

function ConfidenceCellRenderer(params: ICellRendererParams<EscrowLedgerRow>) {
  const conf = params.data?.confidence;
  const verdict = params.data?.verdict ?? "—";
  if (conf === null || conf === undefined) {
    return <span className="text-xs text-slate-400">Not submitted</span>;
  }
  const barColor =
    verdict === "PASS"
      ? "bg-[#008A54]"
      : verdict === "PARTIAL"
      ? "bg-amber-500"
      : "bg-[#C81E3D]";
  return (
    <div className="flex h-full items-center gap-2">
      <span className="w-12 text-xs font-bold text-[#1D1E20]">{verdict}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, conf))}%` }}
        />
      </div>
      <span className="font-mono-code text-xs text-slate-500">{conf}%</span>
    </div>
  );
}

export function EscrowGrid({
  contracts,
  selectedEscrowId,
  onSelectRow,
}: {
  contracts: EscrowContract[];
  selectedEscrowId: string | null;
  onSelectRow: (escrowId: string, milestoneId: string) => void;
}) {
  const gridRef = useRef<AgGridReact<EscrowLedgerRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const rowData = useMemo<EscrowLedgerRow[]>(() => {
    const rows: EscrowLedgerRow[] = [];
    for (const c of contracts) {
      for (const m of c.milestones) {
        if (statusFilter !== "ALL" && m.status !== statusFilter) continue;
        rows.push({
          escrowId: c.id,
          contractTitle: c.title,
          contractStatus: c.status,
          milestoneId: m.id,
          milestoneTitle: m.title,
          amount: m.amount,
          autoReleaseCap: c.autoReleaseCap,
          status: m.status,
          verdict: m.aiAudit?.verdict ?? "—",
          confidence: m.aiAudit?.confidence ?? null,
          paypalRef:
            m.paypalCaptureId ??
            m.paypalPayoutBatchId ??
            m.paypalRefundId ??
            c.paypalAuthorizationId ??
            c.paypalOrderId ??
            "—",
          settledAmount: m.settledAmount,
          refundedAmount: m.refundedAmount,
        });
      }
    }
    return rows;
  }, [contracts, statusFilter]);

  const colDefs = useMemo<ColDef<EscrowLedgerRow>[]>(
    () => [
      {
        field: "contractTitle",
        headerName: "Contract",
        minWidth: 210,
        flex: 1.3,
        cellClass: (p) =>
          p.data?.escrowId === selectedEscrowId
            ? "font-bold text-[#003087]"
            : "font-medium text-[#1D1E20]",
      },
      {
        field: "milestoneTitle",
        headerName: "Milestone",
        minWidth: 200,
        flex: 1.2,
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 115,
        cellClass: "font-mono-code font-semibold text-[#1D1E20]",
        valueFormatter: (p) => `$${Number(p.value ?? 0).toFixed(2)}`,
      },
      {
        field: "status",
        headerName: "Status",
        width: 160,
        cellRenderer: StatusCellRenderer,
      },
      {
        field: "verdict",
        headerName: "Verification",
        width: 185,
        cellRenderer: ConfidenceCellRenderer,
      },
      {
        field: "paypalRef",
        headerName: "PayPal Reference",
        minWidth: 195,
        flex: 1,
        cellClass: "font-mono-code text-xs text-[#545D68]",
      },
    ],
    [selectedEscrowId]
  );

  const exportCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `agentescrow-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      processCellCallback: (params) => sanitizeCsvCell(params.value),
    });
  };

  return (
    <SpotlightCard className="p-6" spotlightColor="rgba(0, 112, 186, 0.08)">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E6F2FA] text-[#003087]">
            <Layers className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#1D1E20]">
              Escrow Ledger
            </h2>
            <p className="text-xs text-[#545D68]">
              Select any milestone to review deliverables, release payment, or
              issue a refund.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              aria-label="Search contracts or PayPal references"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Search contracts or PayPal IDs..."
              className="rounded-full border border-slate-200 bg-white py-1.5 pl-8 pr-3.5 text-xs text-[#1D1E20] placeholder:text-slate-500 transition focus:border-[#0070BA] focus:outline-none focus:ring-2 focus:ring-[#0070BA]/20"
            />
          </div>

          <select
            aria-label="Filter milestones by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-[#1D1E20] transition focus:border-[#0070BA] focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_FUNDING">Awaiting Funding</option>
            <option value="LOCKED_IN_ESCROW">Held in Escrow</option>
            <option value="AWAITING_APPROVAL">Needs Approval</option>
            <option value="PAID_OUT">Released</option>
            <option value="PARTIAL_REFUND">Partial Refund</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#0070BA]/30 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0070BA] transition hover:bg-[#E6F2FA]"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <AgGridReact<EscrowLedgerRow>
          ref={gridRef}
          theme={agPayPalTheme}
          rowData={rowData}
          columnDefs={colDefs}
          quickFilterText={quickFilter}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
          pagination={true}
          paginationPageSize={8}
          onRowClicked={(e) => {
            if (e.data) {
              onSelectRow(e.data.escrowId, e.data.milestoneId);
            }
          }}
          overlayNoRowsTemplate='<span class="text-slate-400 text-xs">No contracts yet. Create one below or load a demo contract.</span>'
        />
      </div>
    </SpotlightCard>
  );
}
