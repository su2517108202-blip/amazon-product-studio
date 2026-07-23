"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaGoogle, FaInfoCircle } from "react-icons/fa";

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("callbackUrl") || searchParams.get("next") || "/";

  useEffect(() => {
    if (status === "authenticated") {
      router.push(next);
    }
  }, [status, router, next]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-page px-6 text-primary-text select-none">
      <div className="relative bg-bg-card border border-divider w-full max-w-md rounded-lg p-8 space-y-8 shadow-2xl animate-scale-up">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl text-primary font-semibold shadow-md shadow-primary/15">
            A
          </div>
          <h2 className="text-2xl font-semibold uppercase tracking-tight">登录工作室</h2>
          <p className="text-sm font-semibold text-secondary-text leading-relaxed px-4">
            使用 Google 登录后可保存生成历史并管理积分。
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => signIn("google", { callbackUrl: next })}
            className="w-full py-3.5 bg-white text-neutral-900 rounded-full text-sm font-semibold flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            <FaGoogle className="text-sm text-red-500" />
            <span>使用 Google 继续</span>
          </button>
        </div>

        <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/10 p-3.5 rounded text-[13px] leading-relaxed text-secondary-text">
          <FaInfoCircle className="text-primary text-sm shrink-0 mt-0.5" />
          <span>
            登录表示你同意服务条款。本地模式下不强制 Google 登录。
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center bg-bg-page text-primary-text">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
