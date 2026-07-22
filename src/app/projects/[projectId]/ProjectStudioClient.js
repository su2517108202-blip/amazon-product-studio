"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaEye,
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

const EMPTY_IDENTITY_FORM = {
  productName: "",
  category: "",
  color: "",
  material: "",
  structure: "",
  visibleFunctions: "",
  sellingPoints: "",
  targetUsers: "",
  usageScenarios: "",
  mustKeep: "",
  avoidChanges: "",
  primaryReferenceDescription: "",
};

export default function ProjectStudioClient({ projectId }) {
  const [project, setProject] = useState(null);
  const [draft, setDraft] = useState(null);
  const [identityInfo, setIdentityInfo] = useState(null);
  const [identityForm, setIdentityForm] = useState(EMPTY_IDENTITY_FORM);
  const [assignments, setAssignments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const fetchProject = useCallback(async () => {
    setError("");
    const [projectRes, identityRes, assignmentsRes, runsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/projects/${projectId}/product-identity`),
      fetch("/api/model-role-assignments"),
      fetch(`/api/projects/${projectId}/analysis-runs`),
    ]);

    const projectData = await projectRes.json();
    const identityData = await identityRes.json();
    const assignmentsData = await assignmentsRes.json();
    const runsData = await runsRes.json();

    if (!projectRes.ok) throw new Error(projectData.error || "无法读取项目");
    if (!identityRes.ok) throw new Error(identityData.error || "无法读取产品身份证");
    if (!assignmentsRes.ok) throw new Error(assignmentsData.error || "无法读取模型配置");
    if (!runsRes.ok) throw new Error(runsData.error || "无法读取识别记录");

    setProject(projectData);
    setDraft({
      name: projectData.name || "",
      productName: projectData.productName || "",
      platform: projectData.platform || "通用电商",
      aspectRatio: projectData.aspectRatio || "1:1",
      notes: projectData.notes || "",
    });
    setIdentityInfo(identityData);
    setIdentityForm(toIdentityForm(identityData.identity));
    setAssignments(assignmentsData);
    setRuns(runsData);
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProject().catch((err) => setError(err.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProject]);

  const visionAssignment = assignments.find((item) => item.role === "product_vision");
  const identity = identityInfo?.identity;
  const selectedCount =
    project?.referenceImages.filter((image) => image.includeInAnalysis || image.isPrimary)
      .length || 0;
  const successfulRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const lastRun = runs[0];

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
      await fetchProject();
      setMessage("项目已保存");
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
    setMessage("");
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
      setMessage("参考图已上传，产品身份证可能需要重新识别");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function updateImage(imageId, payload) {
    setError("");
    setMessage("");
    const isChecking = payload.includeInAnalysis === true;
    if (isChecking && selectedCount >= 8) {
      setError("参与识别的图片最多 8 张");
      return;
    }
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
    setMessage("");
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

  async function analyzeProduct({ force = false } = {}) {
    if (!visionAssignment?.providerProfile) {
      setError("等待配置视觉模型：请先到 API 设置绑定商品识图模型");
      return;
    }
    if (!project.referenceImages.some((image) => image.isPrimary)) {
      setError("请先设置主参考图");
      return;
    }
    if (selectedCount > 8) {
      setError("参与识别的图片最多 8 张");
      return;
    }
    if (identity && force) {
      const ok = window.confirm("重新识别会覆盖当前产品身份证，是否继续？");
      if (!ok) return;
    }

    setAnalyzing(true);
    setError("");
    setMessage(`正在读取 ${selectedCount} 张参考图`);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`${data.code || "ERROR"}：${data.message || "识别失败"}`);
      }
      await fetchProject();
      setMessage(data.reused ? "已复用上次识别结果" : "识别成功");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveIdentity(event) {
    event.preventDefault();
    setSavingIdentity(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/projects/${projectId}/product-identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromIdentityForm(identityForm)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存产品身份证失败");
      await fetchProject();
      setMessage("产品身份证已保存");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingIdentity(false);
    }
  }

  if (!project || !draft || !identityInfo) {
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
                className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <button
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:bg-zinc-800"
            >
              {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
              保存项目
            </button>
          </form>

          <div className="mt-5 border-t border-zinc-800 pt-4">
            <h2 className="text-sm font-black text-white">商品识别</h2>
            <p className="mt-2 text-xs text-zinc-500">
              当前视觉模型：
              {visionAssignment?.providerProfile
                ? `${visionAssignment.providerProfile.name} / ${visionAssignment.providerProfile.modelId}`
                : "未配置"}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              已选 {selectedCount}/8 张，本次参与识别：
              {identityInfo.selectedImages?.length
                ? identityInfo.selectedImages.map((image) => image.imageRole).join("、")
                : "暂无"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => analyzeProduct({ force: false })}
                disabled={analyzing || !visionAssignment?.providerProfile}
                className="flex items-center justify-center gap-2 bg-zinc-100 px-3 py-2.5 text-xs font-black text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {analyzing ? <FaSpinner className="animate-spin" /> : <FaEye />}
                识别商品
              </button>
              <button
                onClick={() => analyzeProduct({ force: true })}
                disabled={analyzing || !identity}
                className="border border-zinc-800 px-3 py-2.5 text-xs font-black text-zinc-300 hover:text-white disabled:text-zinc-600"
              >
                重新识别
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              状态：{analysisStatus(identity, visionAssignment, analyzing)}
            </p>
            {identity?.isStale && (
              <p className="mt-2 border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                参考图已变化，建议重新识别
              </p>
            )}
          </div>

          {(message || error) && (
            <p
              className={`mt-4 border px-3 py-2 text-xs ${
                error
                  ? "border-red-900/60 bg-red-950/40 text-red-200"
                  : "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"
              }`}
            >
              {error || message}
            </p>
          )}
        </aside>

        <section className="min-w-0 space-y-5">
          <section className="border border-zinc-800 bg-zinc-900/35 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h1 className="truncate text-xl font-black text-white">
                  {project.name}
                </h1>
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
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => uploadFiles(Array.from(event.target.files || []))}
            />

            {project.referenceImages.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[320px] w-full flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
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
                      <label className="flex items-center gap-2 text-xs text-zinc-400">
                        <input
                          checked={image.includeInAnalysis || image.isPrimary}
                          disabled={image.isPrimary}
                          onChange={(event) =>
                            updateImage(image.id, {
                              includeInAnalysis: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        参与识别
                      </label>
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

          <section className="border border-zinc-800 bg-zinc-900/35 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black text-white">产品身份证摘要</h2>
              <span
                className={`border px-2 py-1 text-[10px] font-bold ${
                  identity?.isStale
                    ? "border-amber-900 text-amber-300"
                    : identity
                      ? "border-emerald-900 text-emerald-300"
                      : "border-zinc-800 text-zinc-500"
                }`}
              >
                {identity?.isStale ? "可能已过期" : identity ? "有效" : "未识别"}
              </span>
            </div>
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <Info label="商品名称" value={identity?.productName || "未填写"} />
              <Info label="类目" value={identity?.category || "未填写"} />
              <Info label="颜色" value={identity?.color || "未填写"} />
              <Info label="材质" value={identity?.material || "未填写"} />
              <Info label="结构" value={identity?.structure || "未填写"} />
              <Info label="核心卖点" value={`${identity?.sellingPoints?.length || 0} 条`} />
              <Info label="必须保持" value={`${identity?.mustKeep?.length || 0} 条`} />
              <Info label="来源" value={identity?.sourceProvider || "手动/未识别"} />
              <Info label="模型" value={identity?.sourceModel || "无"} />
            </div>

            <form onSubmit={saveIdentity} className="mt-5 grid gap-3 lg:grid-cols-2">
              <Field label="商品名称">
                <input
                  value={identityForm.productName}
                  onChange={(event) =>
                    setIdentityForm({ ...identityForm, productName: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="类目">
                <input
                  value={identityForm.category}
                  onChange={(event) =>
                    setIdentityForm({ ...identityForm, category: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="颜色">
                <input
                  value={identityForm.color}
                  onChange={(event) =>
                    setIdentityForm({ ...identityForm, color: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="材质">
                <input
                  value={identityForm.material}
                  onChange={(event) =>
                    setIdentityForm({ ...identityForm, material: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="结构">
                <textarea
                  value={identityForm.structure}
                  onChange={(event) =>
                    setIdentityForm({ ...identityForm, structure: event.target.value })
                  }
                  className="h-20 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="主参考图描述">
                <textarea
                  value={identityForm.primaryReferenceDescription}
                  onChange={(event) =>
                    setIdentityForm({
                      ...identityForm,
                      primaryReferenceDescription: event.target.value,
                    })
                  }
                  className="h-20 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </Field>
              {[
                ["visibleFunctions", "可见功能"],
                ["sellingPoints", "核心卖点"],
                ["targetUsers", "目标用户"],
                ["usageScenarios", "使用场景"],
                ["mustKeep", "必须保持"],
                ["avoidChanges", "禁止改变"],
              ].map(([field, label]) => (
                <Field key={field} label={`${label}（逐行）`}>
                  <textarea
                    value={identityForm[field]}
                    onChange={(event) =>
                      setIdentityForm({ ...identityForm, [field]: event.target.value })
                    }
                    className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                  />
                </Field>
              ))}
              <div className="lg:col-span-2">
                <button
                  disabled={savingIdentity}
                  className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:bg-zinc-800"
                >
                  {savingIdentity ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                  保存产品身份证
                </button>
              </div>
            </form>
          </section>
        </section>

        <aside className="border border-zinc-800 bg-zinc-900/45 p-4 xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-sm font-black text-white">识别统计</h2>
          <dl className="mt-4 space-y-3 text-xs">
            <Info label="成功次数" value={`${successfulRuns.length}`} />
            <Info label="失败次数" value={`${failedRuns.length}`} />
            <Info label="上次供应商" value={lastRun?.provider || "无"} />
            <Info label="上次模型" value={lastRun?.model || "无"} />
            <Info
              label="上次耗时"
              value={lastRun?.durationMs == null ? "无" : `${lastRun.durationMs}ms`}
            />
          </dl>
          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-black text-zinc-400">最近记录</h3>
            {runs.slice(0, 5).map((run) => (
              <div key={run.id} className="border border-zinc-800 bg-zinc-950 p-2 text-xs">
                <p className="font-bold text-zinc-200">{run.status}</p>
                <p className="mt-1 truncate text-zinc-500">
                  {run.provider || "unknown"} / {run.model || "unknown"}
                </p>
                {run.errorCode && (
                  <p className="mt-1 text-red-300">{run.errorCode}</p>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function analysisStatus(identity, visionAssignment, analyzing) {
  if (analyzing) return "正在识别商品";
  if (!visionAssignment?.providerProfile) return "等待配置视觉模型";
  if (!identity) return "未识别";
  if (identity.isStale) return "参考图已变化";
  return "识别成功";
}

function toIdentityForm(identity) {
  if (!identity) return EMPTY_IDENTITY_FORM;
  return {
    productName: identity.productName || "",
    category: identity.category || "",
    color: identity.color || "",
    material: identity.material || "",
    structure: identity.structure || "",
    visibleFunctions: listToText(identity.visibleFunctions),
    sellingPoints: listToText(identity.sellingPoints),
    targetUsers: listToText(identity.targetUsers),
    usageScenarios: listToText(identity.usageScenarios),
    mustKeep: listToText(identity.mustKeep),
    avoidChanges: listToText(identity.avoidChanges),
    primaryReferenceDescription: identity.primaryReferenceDescription || "",
  };
}

function fromIdentityForm(form) {
  return {
    productName: form.productName,
    category: form.category,
    color: form.color,
    material: form.material,
    structure: form.structure,
    visibleFunctions: textToList(form.visibleFunctions),
    sellingPoints: textToList(form.sellingPoints),
    targetUsers: textToList(form.targetUsers),
    usageScenarios: textToList(form.usageScenarios),
    mustKeep: textToList(form.mustKeep),
    avoidChanges: textToList(form.avoidChanges),
    primaryReferenceDescription: form.primaryReferenceDescription,
  };
}

function listToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function textToList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
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
    <div className="min-w-0 border-b border-zinc-800 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 truncate font-bold text-zinc-200">{value}</dd>
    </div>
  );
}
