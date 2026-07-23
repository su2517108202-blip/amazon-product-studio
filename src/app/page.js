"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  FaCopy,
  FaFolderOpen,
  FaImage,
  FaPlus,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";

const PLATFORMS = ["拼多多", "淘宝 / 天猫", "京东", "抖音电商", "小红书", "通用电商"];
const RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];

const EMPTY_FORM = {
  name: "",
  productName: "",
  platform: "通用电商",
  aspectRatio: "1:1",
  notes: "",
};

export default function ProjectsHomePage() {
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        throw new Error(assignmentsData.error || "无法读取模型配置状态");
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <section className="border border-zinc-800 bg-zinc-900/45 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-white">灵图电商工作室</h1>
              <p className="mt-1 text-xs text-zinc-500">Lingtu E-commerce Studio</p>
            </div>
            <span className="rounded border border-emerald-900/60 px-2 py-1 text-[10px] font-bold uppercase text-emerald-400">
              Local
            </span>
          </div>

          <form onSubmit={createProject} className="space-y-4">
            <Field label="项目名称">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                placeholder="例如：夏季保温杯主图"
                required
              />
            </Field>

            <Field label="商品名称">
              <input
                value={form.productName}
                onChange={(event) =>
                  setForm({ ...form, productName: event.target.value })
                }
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                placeholder="例如：316 不锈钢保温杯"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <Field label="备注">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                placeholder="可选"
              />
            </Field>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {saving ? <FaSpinner className="animate-spin" /> : <FaPlus />}
              新建商品项目
            </button>
          </form>

          {error && (
            <p className="mt-4 border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </section>

        <section className="min-w-0">
          <div className="mb-5 border border-zinc-800 bg-zinc-900/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-white">模型配置状态</h2>
              <Link
                href="/settings/providers"
                className="border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white"
              >
                API 设置
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <RoleStatus
                label="商品识图"
                assignment={assignmentMap.product_vision}
              />
              <RoleStatus
                label="策划模型"
                assignment={assignmentMap.image_planning}
              />
              <RoleStatus
                label="图片生成"
                assignment={assignmentMap.image_generation}
              />
            </div>
            {assignments.length === 0 && (
              <p className="mt-3 text-xs text-amber-300">
                尚未配置 API。你仍然可以创建项目、上传参考图和管理素材。
              </p>
            )}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">
              最近项目
            </h2>
            <button
              onClick={fetchProjects}
              className="border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-700 hover:text-white"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center border border-zinc-800 bg-zinc-900/30 text-zinc-500">
              <FaSpinner className="mr-2 animate-spin" />
              正在读取
            </div>
          ) : projects.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-900/20 text-center">
              <FaImage className="mb-3 text-2xl text-zinc-600" />
              <p className="text-sm font-bold text-zinc-300">暂无项目</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article
                  key={project.id}
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
                    <div>
                      <h3 className="truncate text-sm font-black text-white">
                        {project.name}
                      </h3>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {project.productName || "未填写商品名称"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold text-zinc-400">
                      <span className="border border-zinc-800 px-2 py-1">
                        {project.platform}
                      </span>
                      <span className="border border-zinc-800 px-2 py-1">
                        {project.aspectRatio}
                      </span>
                      <span className="border border-zinc-800 px-2 py-1">
                        {project._count?.referenceImages || 0} 张参考图
                      </span>
                      <span className="border border-zinc-800 px-2 py-1">
                        {project.imagePlanSummary?.isStale
                          ? "主图策划：需更新"
                          : `主图策划：${project.imagePlanSummary?.count || 0}/5`}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center justify-center gap-2 bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-950 hover:bg-white"
                      >
                        <FaFolderOpen />
                        打开
                      </Link>
                      <button
                        onClick={() => duplicateProject(project.id)}
                        className="border border-zinc-800 px-3 py-2 text-zinc-300 hover:border-zinc-700 hover:text-white"
                        aria-label="复制项目"
                        title="复制项目"
                      >
                        <FaCopy />
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="border border-zinc-800 px-3 py-2 text-zinc-300 hover:border-red-700 hover:text-red-300"
                        aria-label="删除项目"
                        title="删除项目"
                      >
                        <FaTrash />
                      </button>
                    </div>
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
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function RoleStatus({ label, assignment }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-black ${assignment ? "text-emerald-300" : "text-zinc-500"}`}>
        {assignment ? "已配置" : "未配置"}
      </p>
      {assignment?.providerProfile && (
        <p className="mt-1 truncate text-xs text-zinc-500">
          {assignment.providerProfile.name}
        </p>
      )}
    </div>
  );
}
