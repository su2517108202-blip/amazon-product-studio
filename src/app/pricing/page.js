"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import Footer from "@/components/Footer";
import { FaCheck, FaInfoCircle } from "react-icons/fa";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";

const PLANS = [
  { id: "basic", name: "基础包", price: "$5", credits: 100, description: "适合测试提示词和探索风格。" },
  { id: "standard", name: "标准包", price: "$10", credits: 250, description: "适合经常创作高清图的用户。" },
  { id: "pro", name: "专业包", price: "$20", credits: 600, description: "适合需要批量导出和高效生成的用户。", popular: true },
  { id: "business", name: "商业包", price: "$50", credits: 2000, description: "适合团队或高频商品图生成。" }
];

export default function Pricing() {
  const { data: session, status } = useSession();
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleCheckout = async (planId) => {
    if (status !== "authenticated") {
      toast.error("请先使用 Google 登录后再购买积分包。");
      return;
    }

    setLoadingPlan(planId);
    try {
      const { data } = await axios.post("/api/checkout", { planId });
      if (data.url) {
        window.location.assign(data.url);
      } else {
        throw new Error("未返回支付跳转地址");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "无法打开 Stripe 支付会话。");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg-page select-none text-primary-text overflow-hidden">
      <Toaster position="top-right" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col gap-10 overflow-y-auto scrollbar-subtle items-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full mb-1">
            <FaInfoCircle className="text-primary text-sm" />
            <span className="text-[13px] font-semibold text-primary uppercase tracking-widest">积分套餐</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight uppercase">购买积分包</h1>
          <p className="text-sm sm:text-sm text-secondary-text max-w-lg leading-relaxed">
            Purchase flexible credit packages to perform high-resolution predictions. Keep all profits — we handle AI infrastructure.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-bg-card border rounded-lg p-6 flex flex-col justify-between gap-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
                plan.popular ? "border-primary shadow-xl shadow-primary/5 scale-105" : "border-divider/50 shadow-md"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[13px] font-semibold uppercase px-3 py-1 rounded-full tracking-wider shadow">
                  最受欢迎
                </span>
              )}

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-text">{plan.name}</h3>
                  <p className="text-2xl font-semibold tracking-tight text-white">{plan.price}</p>
                </div>
                
                <div className="text-sm bg-bg-page/50 border border-divider/30 p-3 rounded text-center font-semibold text-primary">
                  {plan.credits} 图片积分
                </div>

                <p className="text-sm text-secondary-text leading-relaxed font-medium min-h-[3rem]">{plan.description}</p>
                
                <ul className="space-y-2 border-t border-divider/30 pt-4 text-sm font-semibold text-secondary-text">
                  <li className="flex items-center gap-2">
                    <FaCheck className="text-primary text-[13px]" />
                    <span>支持多种图片比例</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <FaCheck className="text-primary text-[13px]" />
                    <span>高清图下载</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <FaCheck className="text-primary text-[13px]" />
                    <span>无需订阅</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-full text-sm font-semibold transition-all shadow-md cursor-pointer select-none active:scale-[0.98] ${
                  plan.popular ? "bg-primary text-white hover:bg-primary-hover shadow-primary/15" : "bg-bg-page hover:bg-bg-card text-primary-text border border-divider"
                }`}
              >
                {loadingPlan === plan.id ? "正在打开支付..." : "购买积分"}
              </button>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
