"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaDownload,
  FaExternalLinkAlt,
  FaImage,
  FaRedo,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";

const IS_LOCAL_MODE = process.env.NEXT_PUBLIC_APP_MODE === "local";

export default function GalleryPage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [error, setError] = useState("");

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (IS_LOCAL_MODE) {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
        const res = await fetch(`/api/local-gallery${query}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "无法读取本地素材库");
        setItems(data.items || []);
        setProjects(data.projects || []);
      } else if (session?.user) {
        const res = await fetch("/api/creations");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "无法读取作品素材库");
        setItems(
          data
            .filter((item) => item.status === "completed")
            .map((item) => ({
              id: item.id,
              kind: "legacy",
              typeLabel: "历史作品",
              projectName: "旧作品",
              url: item.outputUrl,
              downloadUrl: item.outputUrl,
              prompt: item.prompt,
              createdAt: item.createdAt,
              width: null,
              height: null,
              byteSize: null,
              canDelete: false,
            })),
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, session]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (IS_LOCAL_MODE || session?.user) {
        fetchGallery();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchGallery, session]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      generated: items.filter((item) => item.kind === "generated").length,
      preferred: items.filter((item) => item.isPreferred).length,
      references: items.filter((item) => item.kind === "reference").length,
    };
  }, [items]);

  async function downloadItem(item) {
    if (downloading) return;
    setDownloading(item.id);
    try {
      const res = await fetch(item.downloadUrl || item.url);
      if (!res.ok) throw new Error("图片下载失败");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${item.projectName || "lingtu"}-${item.typeLabel || item.kind}-${item.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(item.url, "_blank");
    } finally {
      setDownloading("");
    }
  }

  async function deleteCandidate(item) {
    if (!item.canDelete) return;
    if (!window.confirm("确认删除这个非首选候选图吗？")) return;
    setError("");
    const res = await fetch(`/api/generated-images/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    await fetchGallery();
  }

  if (!IS_LOCAL_MODE && status === "loading") {
    return <LoadingView />;
  }

  if (!IS_LOCAL_MODE && !session) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-500">
          <FaImage />
        </div>
        <h2 className="text-lg font-semibold text-white">需要登录</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">请先登录后查看你的作品素材库。</p>
        <button onClick={() => signIn("google")} className="mt-6 bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
          登录
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">本地素材库</h1>
            <p className="mt-1.5 text-sm text-zinc-500">查看项目参考图、全部生成图和首选图。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {IS_LOCAL_MODE && (
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none">
                <option value="">全部项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            )}
            <button onClick={fetchGallery} disabled={loading} className="inline-flex items-center gap-2 border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">
              {loading ? <FaSpinner className="animate-spin" /> : <FaRedo />}
              刷新
            </button>
          </div>
        </div>

        {error && <div className="mb-4 border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <Metric label="全部生成图" value={counts.generated} />
          <Metric label="首选图" value={counts.preferred} />
          <Metric label="参考图" value={counts.references} />
          <Metric label="全部素材" value={counts.total} />
        </div>

        {loading ? (
          <LoadingView compact />
        ) : items.length === 0 ? (
          <div className="mx-auto my-12 max-w-md border border-dashed border-zinc-800 bg-zinc-900/10 p-12 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-500">
              <FaImage className="text-sm" />
            </div>
            <p className="text-sm font-semibold text-zinc-300">暂无素材</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">创建项目并完成参考图上传或生成后会显示在这里。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <article key={`${item.kind}-${item.id}`} className="overflow-hidden border border-zinc-800 bg-zinc-900">
                <button onClick={() => setSelectedItem(item)} className="block aspect-square w-full bg-zinc-950">
                  <img src={item.url} alt={item.typeLabel} className="h-full w-full object-contain" />
                </button>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="truncate text-sm font-semibold text-white">{item.projectName}</p>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      {item.typeLabel}
                      {item.candidateNumber ? ` · 候选 ${item.candidateNumber}` : ""}
                      {item.isPreferred ? " · 首选" : ""}
                    </p>
                    <p className="mt-1 text-[13px] text-zinc-500">{formatDate(item.createdAt)} · {formatSize(item)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => downloadItem(item)} className="inline-flex items-center justify-center gap-1 border border-zinc-800 px-2 py-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white">
                      {downloading === item.id ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                      下载
                    </button>
                    {item.projectId ? (
                      <Link href={`/projects/${item.projectId}`} className="inline-flex items-center justify-center gap-1 border border-zinc-800 px-2 py-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white">
                        <FaExternalLinkAlt /> 项目
                      </Link>
                    ) : (
                      <span className="border border-zinc-900 px-2 py-1.5 text-center text-[13px] text-zinc-700">项目</span>
                    )}
                    <button disabled={!item.canDelete} onClick={() => deleteCandidate(item)} className="inline-flex items-center justify-center gap-1 border border-zinc-800 px-2 py-1.5 text-[13px] font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300 disabled:text-zinc-700">
                      <FaTrash /> 删除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <span className="text-sm font-semibold text-white">{selectedItem.typeLabel}</span>
              <button onClick={() => setSelectedItem(null)} className="text-sm font-semibold text-zinc-400 hover:text-white">关闭</button>
            </div>
            <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_280px]">
              <div className="aspect-square border border-zinc-800 bg-zinc-950">
                <img src={selectedItem.url} alt={selectedItem.typeLabel} className="h-full w-full object-contain" />
              </div>
              <div className="space-y-3 text-sm text-zinc-300">
                <Info label="项目名称" value={selectedItem.projectName} />
                <Info label="类型" value={selectedItem.typeLabel} />
                <Info label="候选编号" value={selectedItem.candidateNumber || "无"} />
                <Info label="是否首选" value={selectedItem.isPreferred ? "是" : "否"} />
                <Info label="创建时间" value={new Date(selectedItem.createdAt).toLocaleString()} />
                <Info label="图片尺寸" value={formatSize(selectedItem)} />
                <button onClick={() => downloadItem(selectedItem)} className="mt-4 w-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                  下载图片
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LoadingView({ compact = false }) {
  return (
    <main className={`flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 ${compact ? "py-16" : "flex-1"}`}>
      <FaSpinner className="mb-3 animate-spin text-2xl text-violet-500" />
      <p className="text-sm font-medium text-zinc-400">正在读取素材库...</p>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/35 p-4">
      <p className="text-[13px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="block text-[13px] font-semibold text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-200">{value}</span>
    </div>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "无时间";
}

function formatSize(item) {
  const size = item.width && item.height ? `${item.width}x${item.height}` : "尺寸未知";
  return item.byteSize ? `${size} · ${formatBytes(item.byteSize)}` : size;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
