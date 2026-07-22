"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaImage,
  FaSpinner,
  FaStar,
  FaTrash,
  FaUpload,
} from "react-icons/fa";

const ROLES = [
  { value: "front", label: "正面" },
  { value: "back", label: "背面" },
  { value: "side", label: "侧面" },
  { value: "inside", label: "内部" },
  { value: "detail", label: "细节" },
  { value: "packaging", label: "包装" },
  { value: "scene", label: "场景" },
  { value: "other", label: "其他" },
];

export default function ProjectStudioClient({ projectId }) {
  const [project, setProject] = useState(null);
  const [draft, setDraft] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const fetchProject = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "无法读取项目");
      return;
    }
    setProject(data);
    setDraft({
      name: data.name || "",
      productName: data.productName || "",
      platform: data.platform || "通用电商",
      aspectRatio: data.aspectRatio || "1:1",
      notes: data.notes || "",
    });
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProject();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProject]);

  async function saveProject(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setProject(data);
      setDraft({
        name: data.name || "",
        productName: data.productName || "",
        platform: data.platform || "通用电商",
        aspectRatio: data.aspectRatio || "1:1",
        notes: data.notes || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("imageRole", "other");

      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      await fetchProject();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function updateImage(imageId, payload) {
    setError("");
    const res = await fetch(`/api/reference-images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "更新图片失败");
      return;
    }
    await fetchProject();
  }

  async function deleteImage(imageId) {
    setError("");
    const res = await fetch(`/api/reference-images/${imageId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除图片失败");
      return;
    }
    await fetchProject();
  }

  if (!project || !draft) {
    return (
      <main className="flex flex-1 items-center justify-center bg-zinc-950 text-zinc-400">
        {error || (
          <>
            <FaSpinner className="mr-2 animate-spin" />
            正在读取
          </>
        )}
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 xl:grid-cols-[320px_1fr_300px]">
        <aside className="border border-zinc-800 bg-zinc-900/45 p-4">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white"
          >
            <FaArrowLeft />
            返回项目
          </Link>

          <form onSubmit={saveProject} className="space-y-4">
            <Field label="项目名称">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <Field label="商品名称">
              <input
                value={draft.productName}
                onChange={(event) =>
                  setDraft({ ...draft, productName: event.target.value })
                }
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="平台">
                <input
                  value={draft.platform}
                  onChange={(event) =>
                    setDraft({ ...draft, platform: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                />
              </Field>
              <Field label="比例">
                <input
                  value={draft.aspectRatio}
                  onChange={(event) =>
                    setDraft({ ...draft, aspectRatio: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                />
              </Field>
            </div>
            <Field label="备注">
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                className="h-28 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <button
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:bg-zinc-800"
            >
              {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
              保存
            </button>
          </form>

          {error && (
            <p className="mt-4 border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </aside>

        <section className="min-w-0 border border-zinc-800 bg-zinc-900/35 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="truncate text-xl font-black text-white">{project.name}</h1>
              <p className="mt-1 text-xs text-zinc-500">
                {project.referenceImages.length}/14
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 bg-zinc-100 px-4 py-2.5 text-xs font-black text-zinc-950 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {uploading ? <FaSpinner className="animate-spin" /> : <FaUpload />}
              上传参考图
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => uploadFiles(Array.from(event.target.files || []))}
          />

          {project.referenceImages.length === 0 ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[420px] w-full flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            >
              <FaImage className="mb-3 text-3xl" />
              <span className="text-sm font-bold">添加商品参考图</span>
            </button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {project.referenceImages.map((image) => (
                <article key={image.id} className="border border-zinc-800 bg-zinc-950">
                  <div className="aspect-square bg-black">
                    <img
                      src={image.url}
                      alt={image.fileName}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="space-y-3 p-3">
                    <p className="truncate text-xs font-bold text-zinc-300">
                      {image.fileName}
                    </p>
                    <select
                      value={image.imageRole}
                      onChange={(event) =>
                        updateImage(image.id, { imageRole: event.target.value })
                      }
                      className="w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs outline-none"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateImage(image.id, { isPrimary: true })}
                        className={`flex items-center justify-center gap-2 border px-3 py-2 text-xs font-bold ${
                          image.isPrimary
                            ? "border-amber-600 text-amber-300"
                            : "border-zinc-800 text-zinc-400 hover:text-white"
                        }`}
                      >
                        <FaStar />
                        主图
                      </button>
                      <button
                        onClick={() => deleteImage(image.id)}
                        className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-400 hover:border-red-700 hover:text-red-300"
                      >
                        <FaTrash />
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="border border-zinc-800 bg-zinc-900/45 p-4 xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-sm font-black text-white">项目状态</h2>
          <dl className="mt-4 space-y-3 text-xs">
            <Info label="商品" value={project.productName || "未填写"} />
            <Info label="平台" value={project.platform} />
            <Info label="比例" value={project.aspectRatio} />
            <Info label="参考图" value={`${project.referenceImages.length} 张`} />
            <Info
              label="主参考图"
              value={project.referenceImages.some((image) => image.isPrimary) ? "已设置" : "未设置"}
            />
          </dl>
        </aside>
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

function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="max-w-[160px] truncate font-bold text-zinc-200">{value}</dd>
    </div>
  );
}
