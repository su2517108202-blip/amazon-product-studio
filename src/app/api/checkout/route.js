import { NextResponse } from "next/server";
import { isLocalMode, requireCurrentUser } from "@/lib/app-mode";
import { BillingService } from "@/lib/services/billing";

export async function POST(req) {
  try {
    if (isLocalMode()) {
      return NextResponse.json(
        { error: "本地模式已停用充值入口" },
        { status: 400 },
      );
    }

    const user = await requireCurrentUser();

    const { planId } = await req.json();
    if (!planId) {
      return NextResponse.json({ error: "Missing planId parameter" }, { status: 400 });
    }

    const checkoutUrl = await BillingService.createCheckoutSession(user.id, planId);
    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Checkout route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
