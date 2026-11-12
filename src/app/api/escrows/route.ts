import { NextRequest, NextResponse } from "next/server";
import { createEscrowContract } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";
import { readDatabase } from "@/lib/store/db";
import { CreateEscrowRequestSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await readDatabase();
    return NextResponse.json(db);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateEscrowRequestSchema.parse(body);
    const contract = await createEscrowContract(parsed);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

