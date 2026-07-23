import "./globals.css";
import { Providers } from "./providers";
import Navbar from "../components/Navbar";
import config from "@/lib/config";

export const metadata = {
  title: "灵图电商工作室",
  description: "本地商品图片识别、主图策划和生成结果管理工具。",
};

export default function RootLayout({ children }) {
  const theme = config?.theme || "slate-indigo";

  return (
    <html lang="zh-CN" className="h-full w-full" data-theme={theme}>
      <body className="readable-ui h-full w-full flex flex-col antialiased bg-bg-page text-primary-text font-sans lg:overflow-hidden overflow-y-auto">
        <Providers>
          <Navbar />
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

