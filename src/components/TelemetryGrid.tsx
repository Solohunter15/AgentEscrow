"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { Activity } from "lucide-react";
import { SpotlightCard } from "@/components/motion/SpotlightCard";
import type { AuditLogEntry, WebhookEventRecord } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const agPayPalTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#1d1e20",
  headerBackgroundColor: "#f5f7fa",
  headerTextColor: "#545d68",
  oddRowBackgroundColor: "#fafbfd",
  rowHoverColor: "rgba(0, 112, 186, 0.05)",
  borderColor: "#e5e9f2",
  accentColor: "#0070ba",
  fontSize: 12,
});

interface TelemetryRow {
  timestamp: string;
  source: string;
  event: string;
  details: string;
}

function SourceBadge(params: ICellRendererParams<TelemetryRow>) {
  const val = String(params.value ?? "");
  const color =
    val === "PAYPAL"
      ? "bg-[#E6F2FA] text-[#003087] border-[#B6DCF7]"
      : val === "WEBHOOK"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : val === "AI_ROUTER"
      ? "bg-emerald-50 text-[#008A54] border-emerald-200"
      : val === "SECURITY"
      ? "bg-rose-50 text-[#C81E3D] border-rose-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  const label =
    val === "AI_ROUTER"
      ? "VERIFICATION"
      : val === "ESCROW"
      ? "CONTRACT"
      : val;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${color}`}
    >
      {label}
    </span>
  );
}

export function TelemetryGrid({
  auditLogs,
  webhookEvents,
}: {
  auditLogs: AuditLogEntry[];
  webhookEvents: WebhookEventRecord[];
}) {
  const rows = useMemo<TelemetryRow[]>(() => {
    const logs: TelemetryRow[] = auditLogs.map((l) => ({
      timestamp: l.timestamp,
      source: l.category,
      event: l.action.replaceAll("_", " "),
      details: l.details,
    }));

    const whs: TelemetryRow[] = webhookEvents.map((w) => ({
      timestamp: w.processedAt,
      source: "WEBHOOK",
      event: w.eventType,
      details: `${w.resourceId} — ${w.verificationNote}`,
    }));

    return [...logs, ...whs].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  }, [auditLogs, webhookEvents]);

  const colDefs = useMemo<ColDef<TelemetryRow>[]>(
    () => [
      {
        field: "timestamp",
        headerName: "Time",
        width: 120,
        cellClass: "font-mono-code text-[#545D68]",
        valueFormatter: (p) =>
          p.value ? new Date(String(p.value)).toLocaleTimeString() : "",
      },
      {
        field: "source",
        headerName: "Type",
        width: 125,
        cellRenderer: SourceBadge,
      },
      {
        field: "event",
        headerName: "Action",
        width: 170,
        cellClass: "font-semibold text-[#1D1E20]",
      },
      { field: "details", headerName: "Summary", flex: 1, minWidth: 260 },
    ],
    []
  );

  return (
    <SpotlightCard className="p-6" spotlightColor="rgba(0, 112, 186, 0.08)">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E6F2FA] text-[#003087]">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#1D1E20]">
              Settlement & Activity History
            </h2>
            <p className="text-xs text-[#545D68]">
              Real-time record of escrow holds, verifications, and payments.
            </p>
          </div>
        </div>
        <span className="font-mono-code rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-[#545D68]">
          {rows.length} entries
        </span>
      </div>

      <div className="h-[230px] w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <AgGridReact<TelemetryRow>
          theme={agPayPalTheme}
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination={true}
          paginationPageSize={6}
          overlayNoRowsTemplate='<span class="text-slate-400 text-xs">No activity recorded yet.</span>'
        />
      </div>
    </SpotlightCard>
  );
}
