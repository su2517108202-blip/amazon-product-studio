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
      return new NextResponse("Missing planId", { status: 400 });
    }

    const checkoutUrl = await BillingService.createCheckoutSession(
      user.id,
      planId
    );

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("[STRIPE_CHECKOUT]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
