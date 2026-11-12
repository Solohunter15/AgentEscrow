import { NextResponse } from "next/server";
import { createEscrowContract } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

export async function POST() {
  try {
    const contract = await createEscrowContract({
      title: "Autonomous AI Data Pipeline & Dashboard",
      description:
        "Build a PayPal-connected analytics service with automated test coverage and production deployment.",
      buyerEmail: "sb-sqq47i53829411@personal.example.com",
      contractorEmail: "sb-39r9k53823114@business.example.com",
      autoReleaseCap: 80,
      milestones: [
        {
          title: "Milestone 1: Core API & Automated Tests",
          amount: 50,
          acceptanceCriteria: [
            "REST API endpoints implemented with schema validation",
            "Automated unit tests included and passing",
          ],
        },
        {
          title: "Milestone 2: Production UI & Deployment",
          amount: 120,
          acceptanceCriteria: [
            "Responsive dashboard UI integrated end-to-end",
            "Deployment configuration and README verified",
          ],
        },
      ],
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

