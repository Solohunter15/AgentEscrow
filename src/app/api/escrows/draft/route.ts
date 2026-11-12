import { NextRequest, NextResponse } from "next/server";
import { draftContractWithAI } from "@/lib/ai/escrow-ai";
import { apiErrorResponse } from "@/lib/http";
import { appendAuditLog } from "@/lib/store/db";
import { DraftFromPromptSchema } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = DraftFromPromptSchema.parse(body);
    const draft = await draftContractWithAI(parsed.prompt);

    await appendAuditLog({
      category: "AI_ROUTER",
      action: "CONTRACT_DRAFTED",
      provider: draft.meta.provider,
      model: draft.meta.model,
      fallbackUsed: draft.meta.fallbackUsed,
      details: `Drafted "${draft.title}" with ${draft.milestones.length} milestones in ${draft.meta.latencyMs}ms via ${draft.meta.provider}/${draft.meta.model}.`,
    });

    return NextResponse.json({ draft });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

