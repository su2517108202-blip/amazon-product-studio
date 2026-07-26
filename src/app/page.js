"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaCopy,
  FaEllipsisV,
  FaFolderOpen,
  FaImage,
  FaPlus,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";

const PLATFORMS = ["拼多多", "淘宝 / 天猫", "京东", "抖音电商", "小红书", "通用电商"];
const RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const REQUIRED_ROLES = ["product_vision", "image_planning", "image_generation"];

const EMPTY_FORM = {
  name: "",
  productName: "",
  platform: "通用电商",
  aspectRatio: "1:1",
  notes: "",
};

export default function ProjectsHomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const [draggingQuickUpload, setDraggingQuickUpload] = useState(false);
  const [error, setError] = useState("");
  const quickInputRef = useRef(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [projectsRes, assignmentsRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/model-role-assignments"),
      ]);
      const projectsData = await projectsRes.json();
      const assignmentsData = await assignmentsRes.json();
      if (!projectsRes.ok) throw new Error(projectsData.error || "无法读取项目");
      if (!assignmentsRes.ok) {
        throw new Error(assignmentsData.error || "无法读取 AI 服务状态");
      }
      setProjects(projectsData);
      setAssignments(assignmentsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjects();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProjects]);

  const assignmentMap = Object.fromEntries(
    assignments.map((assignment) => [assignment.role, assignment]),
  );
  const aiReady = REQUIRED_ROLES.every((role) => assignmentMap[role]?.providerProfile);

  async function createProject(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "无法创建项目");
      setProjects((current) => [data, ...current]);
      setForm(EMPTY_FORM);
      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const quickUploadFiles = useCallback(async (files) => {
    const incoming = Array.from(files || []).filter((file) => file?.type?.startsWith("image/"));
    if (!incoming.length) return;
    setQuickUploading(true);
    setError("");
    try {
      const fallbackName = "未命名项目";
      const projectPayload = {
        ...form,
        name: form.name.trim() || fallbackName,
        productName: form.productName.trim() || "",
      };
      const projectRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectPayload),
      });
      const projectData = await projectRes.json();
      if (!projectRes.ok) throw new Error(projectData.error || "无法创建项目");

      const uploadData = new FormData();
      incoming.forEach((file) => uploadData.append("files", file));
      uploadData.append("imageRole", "other");
      const uploadRes = await fetch(`/api/projects/${projectData.id}/reference-images`, {
        method: "POST",
        body: uploadData,
      });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploaded.error || "无法上传参考图");
      setProjects((current) => [projectData, ...current]);
      router.push(`/projects/${projectData.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setQuickUploading(false);
      setDraggingQuickUpload(false);
      if (quickInputRef.current) quickInputRef.current.value = "";
    }
  }, [form, router]);

  useEffect(() => {
    const onPaste = (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!files.length) return;
      event.preventDefault();
      quickUploadFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [quickUploadFiles]);

  function handleQuickDrop(event) {
    event.preventDefault();
    setDraggingQuickUpload(false);
    quickUploadFiles(Array.from(event.dataTransfer?.files || []));
  }

  async function duplicateProject(projectId) {
    setError("");
    const res = await fetch(`/api/projects/${projectId}/duplicate`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "无法复制项目");
      return;
    }
    setProjects((current) => [data, ...current]);
  }

  async function deleteProject(projectId) {
    const ok = window.confirm("确认删除这个项目？关联记录和本项目本地文件会一起清理。");
    if (!ok) return;
    setError("");
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "无法删除项目");
      return;
    }
    setProjects((current) => current.filter((project) => project.id !== projectId));
  }

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">开始制作商品图片</h1>
            <p className="mt-2 text-sm text-zinc-500">上传商品图后自动创建项目。</p>
          </div>
          {aiReady ? (
            <span className="rounded border border-emerald-900/60 px-3 py-2 text-sm font-semibold text-emerald-300">
              AI 服务已就绪
            </span>
          ) : (
            <Link
              href="/settings/providers"
              className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm font-semibold text-amber-200 hover:border-amber-500"
            >
              还未配置 AI 服务 · 去设置
            </Link>
          )}
        </div>

        <section className="border border-zinc-800 bg-zinc-900/45 p-5">
          <input
            ref={quickInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            data-testid="home-quick-file-input"
            onChange={(event) => quickUploadFiles(Array.from(event.target.files || []))}
          />

          <button
            type="button"
            onClick={() => quickInputRef.current?.click()}
            onDrop={handleQuickDrop}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingQuickUpload(true);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDraggingQuickUpload(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDraggingQuickUpload(false);
            }}
            data-testid="home-quick-upload-zone"
            className={`flex min-h-64 w-full flex-col items-center justify-center border border-dashed px-4 py-8 text-center transition ${
              draggingQuickUpload
                ? "border-emerald-500 bg-emerald-950/30 text-emerald-100"
                : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            {quickUploading ? <FaSpinner className="mb-4 animate-spin text-3xl" /> : <FaImage className="mb-4 text-3xl" />}
            <span className="text-lg font-bold">
              {quickUploading ? "正在创建项目并上传" : "拖入商品图、点击选择，或 Ctrl+V 粘贴"}
            </span>
            <span className="mt-2 text-sm text-zinc-500">上传后自动创建项目</span>
          </button>

          <details data-testid="home-more-settings" className="mt-4 border border-zinc-800 bg-zinc-950 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
              更多设置
            </summary>
            <form onSubmit={createProject} className="mt-4 grid gap-4 lg:grid-cols-2">
              <Field label="项目名称">
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  data-testid="project-name-input"
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  placeholder="例如：夏季保温杯主图"
                />
              </Field>
              <Field label="商品名称">
                <input
                  value={form.productName}
                  onChange={(event) =>
                    setForm({ ...form, productName: event.target.value })
                  }
                  data-testid="project-product-name-input"
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  placeholder="例如：316 不锈钢保温杯"
                />
              </Field>
              <Field label="目标平台">
                <select
                  value={form.platform}
                  onChange={(event) =>
                    setForm({ ...form, platform: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                >
                  {PLATFORMS.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
              </Field>
              <Field label="默认比例">
                <select
                  value={form.aspectRatio}
                  onChange={(event) =>
                    setForm({ ...form, aspectRatio: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                >
                  {RATIOS.map((ratio) => (
                    <option key={ratio}>{ratio}</option>
                  ))}
                </select>
              </Field>
              <Field label="备注">
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  placeholder="可选"
                />
              </Field>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  data-testid="create-project-button"
                  className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {saving ? <FaSpinner className="animate-spin" /> : <FaPlus />}
                  只创建空项目
                </button>
              </div>
            </form>
          </details>

          {error && (
            <p className="mt-4 border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
              最近项目
            </h2>
            <button
              onClick={fetchProjects}
              className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:border-zinc-700 hover:text-white"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center border border-zinc-800 bg-zinc-900/30 text-zinc-500">
              <FaSpinner className="mr-2 animate-spin" />
              正在读取
            </div>
          ) : projects.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-900/20 text-center">
              <FaImage className="mb-3 text-2xl text-zinc-600" />
              <p className="text-sm font-semibold text-zinc-300">暂无项目</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article
                  key={project.id}
                  data-testid="project-card"
                  data-project-id={project.id}
                  className="overflow-hidden border border-zinc-800 bg-zinc-900/45"
                >
                  <div className="aspect-[4/3] bg-zinc-950">
                    {project.coverImageUrl ? (
                      <img
                        src={project.coverImageUrl}
                        alt={project.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-700">
                        <FaImage className="text-3xl" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {project.productName || project.name}
                        </h3>
                        <p className="mt-1 truncate text-sm text-zinc-500">
                          最近更新：{formatDate(project.updatedAt)}
                        </p>
                      </div>
                      <details className="relative">
                        <summary
                          aria-label="更多项目操作"
                          className="flex h-9 w-9 cursor-pointer list-none items-center justify-center border border-zinc-800 text-zinc-400 hover:text-white"
                        >
                          <FaEllipsisV />
                        </summary>
                        <div className="absolute right-0 z-10 mt-2 w-32 border border-zinc-800 bg-zinc-950 p-1 shadow-xl">
                          <button
                            onClick={() => duplicateProject(project.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                          >
                            <FaCopy />
                            复制
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            data-testid="delete-project-button"
                            data-project-id={project.id}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-900"
                          >
                            <FaTrash />
                            删除
                          </button>
                        </div>
                      </details>
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-center gap-2 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
                    >
                      <FaFolderOpen />
                      继续制作
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatDate(value) {
  if (!value) return "未知";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "未知";
  }
}
