"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaDownload,
  FaEye,
  FaImage,
  FaLightbulb,
  FaSave,
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

const PLAN_TABS = [
  { index: 1, taskType: "hero", label: "图1 点击首图" },
  { index: 2, taskType: "structure", label: "图2 核心结构" },
  { index: 3, taskType: "function", label: "图3 核心功能" },
  { index: 4, taskType: "scenario", label: "图4 使用场景" },
  { index: 5, taskType: "detail", label: "图5 细节理由" },
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

const EMPTY_PLAN_FORM = {
  coreSellingPoint: "",
  scene: "",
  composition: "",
  mainTitle: "",
  subTitle: "",
  keyNotes: "",
  mustKeep: "",
  avoid: "",
  finalPrompt: "",
};

export default function ProjectStudioClient({ projectId }) {
  const [project, setProject] = useState(null);
  const [draft, setDraft] = useState(null);
  const [identityInfo, setIdentityInfo] = useState(null);
  const [identityForm, setIdentityForm] = useState(EMPTY_IDENTITY_FORM);
  const [planInfo, setPlanInfo] = useState(null);
  const [generationInfo, setGenerationInfo] = useState(null);
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [loadingMoreCandidates, setLoadingMoreCandidates] = useState(false);
  const [generationSummary, setGenerationSummary] = useState(null);
  const [planningRuns, setPlanningRuns] = useState([]);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM);
  const [activePlanIndex, setActivePlanIndex] = useState(1);
  const [assignments, setAssignments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generationResolution, setGenerationResolution] = useState("1K");
  const [planDirty, setPlanDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const fetchProject = useCallback(async () => {
    setError("");
    const projectRes = await fetch(`/api/projects/${projectId}`);
    const identityRes = await fetch(`/api/projects/${projectId}/product-identity`);
    const assignmentsRes = await fetch("/api/model-role-assignments");
    const runsRes = await fetch(`/api/projects/${projectId}/analysis-runs`);
    const plansRes = await fetch(`/api/projects/${projectId}/image-plans`);
    const planningRunsRes = await fetch(`/api/projects/${projectId}/image-planning-runs`);
    const summaryRes = await fetch(`/api/projects/${projectId}/generation-summary`);

    const projectData = await projectRes.json();
    const identityData = await identityRes.json();
    const assignmentsData = await assignmentsRes.json();
    const runsData = await runsRes.json();
    const plansData = await plansRes.json();
    const planningRunsData = await planningRunsRes.json();
    const summaryData = await summaryRes.json();

    if (!projectRes.ok) throw new Error(projectData.error || "无法读取项目");
    if (!identityRes.ok) throw new Error(identityData.error || "无法读取产品身份证");
    if (!assignmentsRes.ok) throw new Error(assignmentsData.error || "无法读取模型配置");
    if (!runsRes.ok) throw new Error(runsData.error || "无法读取识别记录");
    if (!plansRes.ok) throw new Error(plansData.error || "无法读取主图策划");
    if (!planningRunsRes.ok) throw new Error(planningRunsData.error || "无法读取策划记录");
    if (!summaryRes.ok) throw new Error(summaryData.error || "无法读取生成摘要");

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
    setPlanInfo(plansData);
    setPlanningRuns(planningRunsData);
    setGenerationSummary(summaryData);
    const selectedPlan =
      plansData.plans?.find((plan) => plan.planIndex === activePlanIndex) ||
      plansData.plans?.[0] ||
      null;
    if (selectedPlan) {
      setActivePlanIndex(selectedPlan.planIndex);
      setPlanForm(toPlanForm(selectedPlan));
    } else {
      setPlanForm(EMPTY_PLAN_FORM);
    }
    setPlanDirty(false);
    const nextPlan =
      plansData.plans?.find((plan) => plan.planIndex === activePlanIndex) ||
      plansData.plans?.[0] ||
      null;
    if (nextPlan) {
      const [generationRes, candidatesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/image-plans/${nextPlan.id}/generations`),
        fetch(`/api/projects/${projectId}/image-plans/${nextPlan.id}/generated-images`),
      ]);
      const generationData = await generationRes.json();
      const candidatesData = await candidatesRes.json();
      if (!generationRes.ok) {
        throw new Error(generationData.error || "无法读取图片生成记录");
      }
      if (!candidatesRes.ok) {
        throw new Error(candidatesData.error || "无法读取候选图历史");
      }
      setGenerationInfo(generationData);
      setCandidateInfo(candidatesData);
    } else {
      setGenerationInfo(null);
      setCandidateInfo(null);
    }
  }, [activePlanIndex, projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProject().catch((err) => setError(err.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProject]);

  const visionAssignment = assignments.find((item) => item.role === "product_vision");
  const planningAssignment = assignments.find((item) => item.role === "image_planning");
  const generationAssignment = assignments.find((item) => item.role === "image_generation");
  const identity = identityInfo?.identity;
  const plans = planInfo?.plans || [];
  const selectedPlan = plans.find((plan) => plan.planIndex === activePlanIndex);
  const selectedCount =
    project?.referenceImages.filter((image) => image.includeInAnalysis || image.isPrimary)
      .length || 0;
  const generationReferenceCount =
    project?.referenceImages.filter((image) => image.includeInGeneration || image.isPrimary)
      .length || 0;
  const successfulRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const lastRun = runs[0];
  const lastPlanningRun = planningRuns[0];
  const workflowSteps = buildWorkflowSteps({
    project,
    identity,
    planInfo,
    generationSummary,
  });

  useEffect(() => {
    const processingRun = generationSummary?.plans?.find(
      (plan) => plan.id === selectedPlan?.id,
    )?.processingRun;
    if (!processingRun?.id) return undefined;

    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(`/api/image-generations/${processingRun.id}/check`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "检查失败");
        if (data.status === "completed" || data.status === "failed") {
          await fetchProject();
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    const timer = window.setInterval(poll, 5000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchProject, generationSummary, selectedPlan?.id]);

  function updatePlanForm(patch) {
    setPlanForm((current) => ({ ...current, ...patch }));
    setPlanDirty(true);
  }

  function selectPlan(index) {
    if (index === activePlanIndex) return;
    if (planDirty && !window.confirm("当前策划有未保存修改，切换后会丢失。是否继续？")) {
      return;
    }
    const next = plans.find((plan) => plan.planIndex === index);
    setActivePlanIndex(index);
    setPlanForm(next ? toPlanForm(next) : EMPTY_PLAN_FORM);
    setGenerationInfo(null);
    setCandidateInfo(null);
    setPlanDirty(false);
  }

  async function loadMoreCandidates() {
    if (!selectedPlan || !candidateInfo?.nextCursor || loadingMoreCandidates) return;
    setLoadingMoreCandidates(true);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/image-plans/${selectedPlan.id}/generated-images?cursor=${encodeURIComponent(
          candidateInfo.nextCursor,
        )}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "无法读取更多候选图");
      setCandidateInfo((current) => {
        const existingIds = new Set((current?.items || []).map((item) => item.id));
        const appended = (data.items || []).filter((item) => !existingIds.has(item.id));
        return {
          ...data,
          items: [...(current?.items || []), ...appended],
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMoreCandidates(false);
    }
  }

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
    const isGenerationChecking = payload.includeInGeneration === true;
    if (isGenerationChecking && generationReferenceCount >= 4) {
      setError("参与生成的参考图最多 4 张");
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
    const ok = window.confirm("确认删除这张参考图？如果它是主参考图，系统会自动选择下一张作为主参考图。");
    if (!ok) return;
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
      setError("请先到 API 设置绑定商品识图模型");
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

  async function generatePlans({ force = false } = {}) {
    if (!planningAssignment?.providerProfile) {
      setError("请先到 API 设置绑定策划模型");
      return;
    }
    if (!identity) {
      setError("请先完成商品识别，生成产品身份证");
      return;
    }

    const hasPlans = plans.length === 5;
    if (hasPlans && force) {
      const manual = plans.some((plan) => plan.isManuallyEdited);
      const ok = window.confirm(
        `重新生成会覆盖当前 5 张策划，但不影响参考图和产品身份证。${manual ? "当前包含手动修改内容。" : ""}是否继续？`,
      );
      if (!ok) return;
    }

    const allowStaleIdentity =
      identity.isStale &&
      window.confirm("产品身份证可能已过期，是否仍使用当前身份证生成策划？");
    if (identity.isStale && !allowStaleIdentity) return;

    setPlanning(true);
    setError("");
    setMessage("正在生成 5 张主图策划");
    try {
      const res = await fetch(`/api/projects/${projectId}/image-plans/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, allowStaleIdentity }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`${data.code || "ERROR"}：${data.message || "生成失败"}`);
      }
      await fetchProject();
      setMessage(data.reused ? "已使用现有 5 张策划" : "5 张主图策划已生成");
    } catch (err) {
      setError(err.message);
    } finally {
      setPlanning(false);
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
      setMessage("产品身份证已保存，现有策划已标记为可能过期");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingIdentity(false);
    }
  }

  async function savePlan(event) {
    event.preventDefault();
    if (!selectedPlan) return;
    setSavingPlan(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/image-plans/${selectedPlan.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fromPlanForm(planForm)),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存策划失败");
      await fetchProject();
      setActivePlanIndex(data.planIndex);
      setPlanForm(toPlanForm(data));
      setPlanDirty(false);
      setMessage(`图${data.planIndex} 策划已保存`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPlan(false);
    }
  }

	  async function generateCurrentImage({ force = false } = {}) {
	    if (!selectedPlan) {
	      setError("请先选择一条主图策划");
	      return;
	    }
	    if (!generationAssignment?.providerProfile) {
	      setError("请先到 API 设置绑定图片生成模型");
	      return;
	    }
	    if (!generationAssignment.providerProfile.supportsReferenceImages) {
	      setError("当前图片生成协议未真实支持参考图，不能用于默认电商商品图生成");
	      return;
	    }
	    if (!identity) {
	      setError("请先完成商品识别");
	      return;
	    }
	    if (!project.referenceImages.some((image) => image.isPrimary)) {
	      setError("请先设置主参考图");
	      return;
	    }
	    if (generationReferenceCount > 4) {
	      setError("参与生成的参考图最多 4 张");
	      return;
	    }
	    const stale = identity.isStale || selectedPlan.isStale;
	    const allowStaleInput =
	      stale && window.confirm("当前产品身份证或策划可能过期，是否仍然生成？");
    if (stale && !allowStaleInput) return;

    const confirmed = window.confirm("本次将调用真实图片生成 API 并可能产生费用，是否继续？");
    if (!confirmed) return;

    setGeneratingImage(true);
    setError("");
	    setMessage("正在生成当前图片");
    try {
      const referenceImageIds = project.referenceImages
        .filter((image) => image.includeInGeneration || image.isPrimary)
        .map((image) => image.id);
      const res = await fetch(
        `/api/projects/${projectId}/image-plans/${selectedPlan.id}/generations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force,
            allowStaleInput,
            referenceImageIds,
            resolution: generationResolution,
            aspectRatio: project.aspectRatio,
          }),
        },
      );
      const data = await res.json();
	      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "生成失败"}`);
	      await fetchProject();
	      setMessage(data.reused ? "已使用现有生成图" : "当前图片已生成");
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function checkCurrentGeneration() {
    const runId = generationInfo?.latestRun?.id;
    if (!runId) return;
    setGeneratingImage(true);
    setError("");
    try {
      const res = await fetch(`/api/image-generations/${runId}/check`, { method: "POST" });
      const data = await res.json();
	      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "检查失败"}`);
	      await fetchProject();
	      setMessage(data.status === "completed" ? "图片生成已完成" : "图片仍在处理中");
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function setPreferredCandidate(candidate) {
    if (!selectedPlan) return;
    setError("");
    setMessage("");
    const nextId = candidate.isPreferred ? null : candidate.id;
    const targetPlanId = candidate.imagePlanId || selectedPlan.id;
    const targetPlanIndex =
      plans.find((plan) => plan.id === targetPlanId)?.planIndex || selectedPlan.planIndex;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/image-plans/${targetPlanId}/preferred-image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generatedImageId: nextId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "设置失败"}`);
      await fetchProject();
      setMessage(nextId ? `图${targetPlanIndex} 首选图已保存` : `图${targetPlanIndex} 首选图已取消`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteCandidate(candidate) {
    const ok = window.confirm(`确认删除候选图 ${candidate.candidateNumber}？生成记录会保留。`);
    if (!ok) return;
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/generated-images/${candidate.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "删除失败"}`);
      await fetchProject();
      setMessage(`候选图 ${candidate.candidateNumber} 已删除`);
    } catch (err) {
      setError(err.message);
    }
  }

  function downloadCandidate(candidate) {
    window.location.href = `/api/generated-images/${candidate.id}/download`;
  }

  function downloadPreferredZip() {
    if (!generationSummary?.zipReady) return;
    window.location.href = `/api/projects/${projectId}/exports/preferred-images`;
  }

  if (!project || !draft || !identityInfo || !planInfo) {
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
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
            >
              {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
              保存项目
            </button>
          </form>

          <StageProgress steps={workflowSteps} />

          <WorkflowPanel
            identity={identity}
            selectedCount={selectedCount}
            generationReferenceCount={generationReferenceCount}
            visionAssignment={visionAssignment}
            planningAssignment={planningAssignment}
            generationAssignment={generationAssignment}
            analyzing={analyzing}
            planning={planning}
            generatingImage={generatingImage}
            planInfo={planInfo}
            onAnalyze={analyzeProduct}
            onGenerate={generatePlans}
          />

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
          <ReferenceImages
            fileInputRef={fileInputRef}
            project={project}
            uploading={uploading}
            selectedCount={selectedCount}
            generationReferenceCount={generationReferenceCount}
            onUpload={uploadFiles}
            onUpdate={updateImage}
            onDelete={deleteImage}
          />

          <PlanningSection
            plans={plans}
            planForm={planForm}
            activePlanIndex={activePlanIndex}
            planDirty={planDirty}
            planning={planning}
            savingPlan={savingPlan}
            selectedPlan={selectedPlan}
            identity={identity}
            project={project}
            generationAssignment={generationAssignment}
            generationInfo={generationInfo}
            candidateInfo={candidateInfo}
            generationSummary={generationSummary}
            generationReferenceCount={generationReferenceCount}
            generationResolution={generationResolution}
            generatingImage={generatingImage}
            onGenerate={generatePlans}
            onSelectPlan={selectPlan}
            onUpdatePlanForm={updatePlanForm}
            onSavePlan={savePlan}
            onResolutionChange={setGenerationResolution}
            onGenerateImage={generateCurrentImage}
            onCheckGeneration={checkCurrentGeneration}
            onSetPreferredCandidate={setPreferredCandidate}
            onDeleteCandidate={deleteCandidate}
            onDownloadCandidate={downloadCandidate}
            onDownloadPreferredZip={downloadPreferredZip}
            onLoadMoreCandidates={loadMoreCandidates}
            loadingMoreCandidates={loadingMoreCandidates}
          />

          <IdentitySection
            identity={identity}
            identityForm={identityForm}
            savingIdentity={savingIdentity}
            onChange={setIdentityForm}
            onSave={saveIdentity}
          />
        </section>

        <aside className="border border-zinc-800 bg-zinc-900/45 p-4 xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-base font-semibold text-white">调用统计</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Info label="识别成功" value={`${successfulRuns.length}`} />
            <Info label="识别失败" value={`${failedRuns.length}`} />
            <Info label="策划成功" value={`${planInfo.stats?.successCount || 0}`} />
            <Info label="策划失败" value={`${planInfo.stats?.failureCount || 0}`} />
            <Info
              label="上次策划耗时"
              value={
                lastPlanningRun?.durationMs == null
                  ? "无"
                  : `${lastPlanningRun.durationMs}ms`
              }
            />
          </dl>
          <details className="mt-5 border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
            <summary className="cursor-pointer font-semibold text-zinc-200">高级信息</summary>
            <dl className="mt-3 space-y-3">
              <Info label="识别 Provider" value={lastRun?.provider || "无"} />
              <Info label="识别 Model ID" value={lastRun?.model || "无"} />
              <Info label="识别 fingerprint" value={lastRun?.inputFingerprint || "无"} />
              <Info label="策划 Provider" value={lastPlanningRun?.provider || "无"} />
              <Info label="策划 Model ID" value={lastPlanningRun?.model || "无"} />
              <Info label="策划 fingerprint" value={lastPlanningRun?.inputFingerprint || "无"} />
            </dl>
          </details>
          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400">最近策划记录</h3>
            {planningRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="border border-zinc-800 bg-zinc-950 p-2 text-sm">
                <p className="font-bold text-zinc-200">{run.status}</p>
                <p className="mt-1 truncate text-zinc-500">
                  {run.provider || "unknown"} / {run.model || "unknown"}
                </p>
                {run.errorCode && <p className="mt-1 text-red-300">{run.errorCode}</p>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function WorkflowPanel({
  identity,
  selectedCount,
  generationReferenceCount,
  visionAssignment,
  planningAssignment,
  generationAssignment,
  analyzing,
  planning,
  generatingImage,
  planInfo,
  onAnalyze,
  onGenerate,
}) {
  const hasPlans = planInfo?.plans?.length === 5;
  const analyzeDisabledReason = analyzing
    ? "正在识别，请稍候"
    : !visionAssignment?.providerProfile
      ? "请先到 API 设置绑定商品识图模型"
      : selectedCount === 0
        ? "请先上传并选择参与识别的参考图"
        : "";
  const reanalyzeDisabledReason = analyzing
    ? "正在识别，请稍候"
    : !identity
      ? "还没有可重新识别的产品身份证"
      : "";
  const planningDisabledReason = planning
    ? "正在生成策划，请稍候"
    : !planningAssignment?.providerProfile
      ? "请先到 API 设置绑定策划模型"
      : !identity
        ? "请先完成商品识别"
        : "";
  const generationReason = !generationAssignment?.providerProfile
    ? "请先到 API 设置绑定图片生成模型"
    : generationReferenceCount === 0
      ? "请先选择参与生成的参考图"
      : generationReferenceCount > 4
        ? "参与生成的参考图最多 4 张"
        : generatingImage
          ? "图片生成处理中"
          : "准备就绪";
  return (
    <div className="mt-5 space-y-5 border-t border-zinc-800 pt-4">
      <section>
        <h2 className="text-base font-semibold text-white">商品识别</h2>
        <p className="mt-2 text-sm text-zinc-500">
          当前视觉模型：
          {visionAssignment?.providerProfile
            ? `${visionAssignment.providerProfile.name} / ${visionAssignment.providerProfile.modelId}`
            : "未配置"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">已选 {selectedCount}/8 张</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onAnalyze({ force: false })}
            disabled={Boolean(analyzeDisabledReason)}
            title={analyzeDisabledReason || "开始商品识别"}
            data-testid="analyze-product-button"
            className="flex items-center justify-center gap-2 bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {analyzing ? <FaSpinner className="animate-spin" /> : <FaEye />}
            识别商品
          </button>
          <button
            onClick={() => onAnalyze({ force: true })}
            disabled={Boolean(reanalyzeDisabledReason)}
            title={reanalyzeDisabledReason || "重新识别商品"}
            className="border border-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
          >
            重新识别
          </button>
        </div>
        <DisabledReason reason={analyzeDisabledReason || reanalyzeDisabledReason} />
        <p className="mt-3 text-sm text-zinc-500">
          状态：{analysisStatus(identity, visionAssignment, analyzing)}
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-white">5 张主图策划</h2>
        <p className="mt-2 text-sm text-zinc-500">
          当前策划模型：
          {planningAssignment?.providerProfile
            ? `${planningAssignment.providerProfile.name} / ${planningAssignment.providerProfile.modelId}`
            : "未配置"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          状态：{planningStatus(identity, planningAssignment, planning, planInfo)}
        </p>
        <button
          onClick={() => onGenerate({ force: hasPlans })}
          disabled={Boolean(planningDisabledReason)}
          title={planningDisabledReason || "生成五张主图策划"}
          data-testid="generate-plans-button"
          className="mt-3 flex w-full items-center justify-center gap-2 bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {planning ? <FaSpinner className="animate-spin" /> : <FaLightbulb />}
          {hasPlans ? "重新生成 5 张策划" : "生成 5 张主图策划"}
        </button>
        <DisabledReason reason={planningDisabledReason} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-white">单张图片生成</h2>
        <p className="mt-2 text-sm text-zinc-500">
          当前图片模型：
          {generationAssignment?.providerProfile
            ? `${generationAssignment.providerProfile.name} / ${generationAssignment.providerProfile.modelId}`
            : "未配置"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          状态：{generationReason}
        </p>
      </section>
    </div>
  );
}

function StageProgress({ steps }) {
  return (
    <section className="mt-5 border-t border-zinc-800 pt-4">
      <h2 className="text-base font-semibold text-white">四步流程</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li
            key={step.index}
            className={`border px-3 py-2 text-sm ${
              step.status === "current"
                ? "border-sky-700 bg-sky-950/30 text-sky-100"
                : step.status === "complete"
                  ? "border-emerald-800 bg-emerald-950/20 text-emerald-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{step.index} {step.label}</span>
              <span>{formatStepStatus(step.status)}</span>
            </div>
            {step.reason && <p className="mt-1 text-xs text-zinc-400">{step.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReferenceImages({
  fileInputRef,
  project,
  uploading,
  selectedCount,
  generationReferenceCount,
  onUpload,
  onUpdate,
  onDelete,
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="truncate text-xl font-bold text-white">{project.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{project.referenceImages.length}/14</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="reference-upload-button"
          className="flex items-center gap-2 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {uploading ? <FaSpinner className="animate-spin" /> : <FaUpload />}
          上传参考图
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        data-testid="reference-file-input"
        className="hidden"
        onChange={(event) => onUpload(Array.from(event.target.files || []))}
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
            <article
              key={image.id}
              data-testid="reference-image-card"
              data-primary={image.isPrimary ? "true" : "false"}
              className="border border-zinc-800 bg-zinc-950"
            >
              <div className="aspect-square bg-black">
                <img
                  src={image.url}
                  alt={image.fileName}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="space-y-3 p-3">
                <p className="truncate text-sm font-semibold text-zinc-300">{image.fileName}</p>
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    checked={image.includeInAnalysis || image.isPrimary}
                    disabled={image.isPrimary}
                    onChange={(event) =>
                      onUpdate(image.id, { includeInAnalysis: event.target.checked })
                    }
                    type="checkbox"
                  />
                  参与识别
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    checked={image.includeInGeneration || image.isPrimary}
                    disabled={image.isPrimary}
                    onChange={(event) =>
                      onUpdate(image.id, { includeInGeneration: event.target.checked })
                    }
                    type="checkbox"
                  />
                  参与生成
                </label>
                <select
                  value={image.imageRole}
                  onChange={(event) => onUpdate(image.id, { imageRole: event.target.value })}
                  className="w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm outline-none"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onUpdate(image.id, { isPrimary: true })}
                    className={`flex items-center justify-center gap-2 border px-3 py-2 text-sm font-semibold ${
                      image.isPrimary
                        ? "border-amber-600 text-amber-300"
                        : "border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <FaStar />
                    主图
                  </button>
                  <button
                    onClick={() => onDelete(image.id)}
                    className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300"
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
      {selectedCount > 8 && (
        <p className="mt-3 text-xs text-red-300">参与识别图片超过 8 张</p>
      )}
      {generationReferenceCount > 4 && (
        <p className="mt-3 text-xs text-red-300">参与生成参考图超过 4 张</p>
      )}
    </section>
  );
}

function PlanningSection({
  plans,
  planForm,
  activePlanIndex,
  planDirty,
  planning,
  savingPlan,
  selectedPlan,
  identity,
  project,
  generationAssignment,
  generationInfo,
  candidateInfo,
  generationSummary,
  generationReferenceCount,
  generationResolution,
  generatingImage,
  onGenerate,
  onSelectPlan,
  onUpdatePlanForm,
  onSavePlan,
  onResolutionChange,
  onGenerateImage,
  onCheckGeneration,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
  onDownloadPreferredZip,
  onLoadMoreCandidates,
  loadingMoreCandidates,
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">5 张主图策划</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {plans.length}/5 {plans.some((plan) => plan.isStale) ? "，可能过期" : ""}
          </p>
        </div>
        <button
          onClick={() => onGenerate({ force: plans.length === 5 })}
          disabled={planning}
          className="flex items-center gap-2 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {planning ? <FaSpinner className="animate-spin" /> : <FaLightbulb />}
          {plans.length === 5 ? "重新生成" : "生成 5 张"}
        </button>
      </div>

      <GenerationSummaryBar
        summary={generationSummary}
        onDownloadPreferredZip={onDownloadPreferredZip}
      />

      <div className="mb-4 grid gap-2 md:grid-cols-5">
        {PLAN_TABS.map((tab) => {
          const plan = plans.find((item) => item.planIndex === tab.index);
          const planSummary = generationSummary?.plans?.find(
            (item) => item.planIndex === tab.index,
          );
          const active = activePlanIndex === tab.index;
          return (
            <button
              key={tab.index}
              onClick={() => onSelectPlan(tab.index)}
              data-testid={`plan-tab-${tab.index}`}
              data-active={active ? "true" : "false"}
              className={`min-h-20 border px-3 py-2 text-left text-sm ${
                active
                  ? "border-emerald-500 bg-emerald-950/30 text-emerald-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
              }`}
            >
              <p className="font-semibold">{tab.label}</p>
              <p className="mt-1">{plan ? plan.status : "未生成"}</p>
              {planSummary && (
                <p className="mt-1">
                  候选 {planSummary.candidateCount} · {planSummary.hasPreferred ? "已首选" : "未首选"}
                </p>
              )}
              {planSummary?.processingRun && <p className="mt-1 text-sky-300">处理中</p>}
              {planSummary?.failedRunCount > 0 && (
                <p className="mt-1 text-red-300">失败 {planSummary.failedRunCount}</p>
              )}
              {plan?.isManuallyEdited && <p className="mt-1 text-amber-300">手动修改</p>}
              {plan?.isStale && <p className="mt-1 text-red-300">可能过期</p>}
            </button>
          );
        })}
      </div>

      {!selectedPlan ? (
        <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center text-sm text-zinc-500">
          尚未生成策划
        </div>
      ) : (
        <form onSubmit={onSavePlan} className="grid gap-3 lg:grid-cols-2">
          <Field label="核心卖点">
            <input
              value={planForm.coreSellingPoint}
              onChange={(event) => onUpdatePlanForm({ coreSellingPoint: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="主标题">
            <input
              value={planForm.mainTitle}
              onChange={(event) => onUpdatePlanForm({ mainTitle: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="副标题">
            <input
              value={planForm.subTitle}
              onChange={(event) => onUpdatePlanForm({ subTitle: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="场景">
            <textarea
              value={planForm.scene}
              onChange={(event) => onUpdatePlanForm({ scene: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="构图">
            <textarea
              value={planForm.composition}
              onChange={(event) => onUpdatePlanForm({ composition: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="补充要点（逐行）">
            <textarea
              value={planForm.keyNotes}
              onChange={(event) => onUpdatePlanForm({ keyNotes: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="必须保持（逐行）">
            <textarea
              value={planForm.mustKeep}
              onChange={(event) => onUpdatePlanForm({ mustKeep: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="禁止改变（逐行）">
            <textarea
              value={planForm.avoid}
              onChange={(event) => onUpdatePlanForm({ avoid: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="最终提示词">
            <textarea
              value={planForm.finalPrompt}
              onChange={(event) => onUpdatePlanForm({ finalPrompt: event.target.value })}
              className="h-48 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none lg:col-span-2"
            />
          </Field>
          <div className="lg:col-span-2">
            {planDirty && <p className="mb-2 text-sm text-amber-300">有未保存修改</p>}
            <button
              disabled={savingPlan}
              data-testid="save-plan-button"
              data-plan-id={selectedPlan?.id || ""}
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
	            >
	              {savingPlan ? <FaSpinner className="animate-spin" /> : <FaSave />}
	              保存当前策划
	            </button>
	            <GenerationPanel
	              identity={identity}
	              project={project}
	              selectedPlan={selectedPlan}
	              generationAssignment={generationAssignment}
	              generationInfo={generationInfo}
	              candidateInfo={candidateInfo}
	              generationReferenceCount={generationReferenceCount}
	              generationResolution={generationResolution}
	              generatingImage={generatingImage}
	              onResolutionChange={onResolutionChange}
	              onGenerateImage={onGenerateImage}
	              onCheckGeneration={onCheckGeneration}
	              onSetPreferredCandidate={onSetPreferredCandidate}
	              onDeleteCandidate={onDeleteCandidate}
	              onDownloadCandidate={onDownloadCandidate}
	              onLoadMoreCandidates={onLoadMoreCandidates}
	              loadingMoreCandidates={loadingMoreCandidates}
	            />
	          </div>
	        </form>
      )}
    </section>
  );
}

function GenerationSummaryBar({ summary, onDownloadPreferredZip }) {
  const missing = summary?.missingPreferredPlans || [];
  const missingText = missing
    .map((plan) => `图${plan.planIndex} ${planTaskLabel(plan.taskType)}`)
    .join("、");

  return (
    <div className="mb-4 grid gap-3 border border-zinc-800 bg-zinc-950 p-3 text-sm md:grid-cols-[1fr_1fr_auto]">
      <Info label="主图生成" value={`${summary?.generatedPlanCount || 0}/5`} />
      <Info label="首选图" value={`${summary?.preferredCount || 0}/5`} />
      <div className="flex min-w-0 flex-col gap-2">
        <button
          type="button"
          onClick={onDownloadPreferredZip}
          disabled={!summary?.zipReady}
          data-testid="download-preferred-zip-button"
          className="flex items-center justify-center gap-2 border border-emerald-800 px-3 py-2 font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600"
        >
          <FaDownload />
          下载整套首选图
        </button>
        {!summary?.zipReady && missingText && (
          <p className="truncate text-zinc-500">还缺：{missingText}</p>
        )}
      </div>
    </div>
  );
}

function GenerationPanel({
  identity,
  project,
  selectedPlan,
  generationAssignment,
  generationInfo,
  candidateInfo,
  generationReferenceCount,
  generationResolution,
  generatingImage,
  onResolutionChange,
  onGenerateImage,
  onCheckGeneration,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
  onLoadMoreCandidates,
  loadingMoreCandidates,
}) {
  const provider = generationAssignment?.providerProfile;
  const latestRun = generationInfo?.latestRun;
  const latestImage = generationInfo?.latestImage;
  const generateDisabledReason = generatingImage
    ? "图片生成处理中"
    : !provider
      ? "请先到 API 设置绑定图片生成模型"
      : !provider.supportsReferenceImages
        ? "当前图片生成协议不会真实传递参考图"
        : !identity
          ? "请先完成商品识别"
          : !selectedPlan
            ? "请先选择一条主图策划"
            : generationReferenceCount === 0
              ? "请先选择参与生成的参考图"
              : generationReferenceCount > 4
                ? "参与生成的参考图最多 4 张"
                : "";
  const canGenerate =
    provider &&
    provider.supportsReferenceImages &&
    identity &&
    selectedPlan &&
    !generatingImage &&
    generationReferenceCount > 0 &&
    generationReferenceCount <= 4;

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
            单张图片生成
          </h3>
          <p className="mt-1 text-sm text-zinc-500">当前策划候选 {candidateInfo?.stats?.candidateCount || 0} 张</p>
        </div>
        <span className="border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400">
          {generationStatus(identity, selectedPlan, provider, latestRun)}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="参考图能力" value={formatReferenceSupport(provider)} />
        <Info label="比例" value={project.aspectRatio || "1:1"} />
        <Info label="参考图" value={`${generationReferenceCount}/4`} />
      </div>
      <details className="mt-3 border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
        <summary className="cursor-pointer font-semibold text-zinc-200">高级信息</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Info label="服务商" value={provider?.provider || "未配置"} />
          <Info label="模型 ID" value={provider?.modelId || "未配置"} />
          <Info label="接口协议" value={formatProtocol(provider?.protocol || "未配置")} />
          <Info label="上次 fingerprint" value={latestRun?.inputFingerprint || "无"} />
          <Info label="上次 run ID" value={latestRun?.id || "无"} />
        </div>
      </details>

      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
        <Field label="分辨率">
          <select
            value={generationResolution}
            onChange={(event) => onResolutionChange(event.target.value)}
            className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
          >
            <option value="1K">1K</option>
            <option value="2K">2K</option>
          </select>
        </Field>
        <button
          type="button"
          onClick={() => onGenerateImage({ force: false })}
          disabled={!canGenerate}
          title={generateDisabledReason || "生成当前策划图片"}
          data-testid="generate-current-image-button"
          data-plan-id={selectedPlan?.id || ""}
          className="flex items-center justify-center gap-2 bg-sky-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {generatingImage ? <FaSpinner className="animate-spin" /> : <FaImage />}
          生成当前图片
        </button>
        <button
          type="button"
          onClick={() => onGenerateImage({ force: true })}
          disabled={!canGenerate || !latestImage}
          title={!latestImage ? "当前策划还没有旧候选图" : generateDisabledReason || "强制重新生成当前图片"}
          data-testid="force-generate-current-image-button"
          data-plan-id={selectedPlan?.id || ""}
          className="border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
        >
          强制重新生成
        </button>
      </div>
      <DisabledReason reason={generateDisabledReason || (!latestImage ? "" : "")} />

      {latestRun?.status === "processing" && latestRun.mode === "async" && (
        <button
          type="button"
          onClick={onCheckGeneration}
          disabled={generatingImage}
          className="mt-3 w-full border border-sky-900 px-4 py-2.5 text-sm font-semibold text-sky-200 hover:border-sky-700"
        >
          检查异步生成状态
        </button>
      )}

      {latestImage ? (
        <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
          <div className="relative aspect-square bg-black">
            <Image
              src={latestImage.url}
              alt="生成的电商图片"
              fill
              sizes="(max-width: 1024px) 100vw, 640px"
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <Info label="状态" value={formatRunStatus(latestRun?.status || "completed")} />
            <Info label="模型" value={latestRun?.model || "未知"} />
            <Info label="生成时间" value={formatDate(latestImage.createdAt)} />
            <Info label="尺寸" value={latestImage.width ? `${latestImage.width}x${latestImage.height}` : "未知"} />
            <Info label="大小" value={`${Math.round((latestImage.byteSize || 0) / 1024)} KB`} />
            <Info label="来源" value={latestImage.sourceType || "provider"} />
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center text-xs text-zinc-500">
          当前策划尚未生成图片
        </div>
      )}

      <CandidateHistory
        candidateInfo={candidateInfo}
        onSetPreferredCandidate={onSetPreferredCandidate}
        onDeleteCandidate={onDeleteCandidate}
        onDownloadCandidate={onDownloadCandidate}
        onLoadMoreCandidates={onLoadMoreCandidates}
        loadingMoreCandidates={loadingMoreCandidates}
      />
    </div>
  );
}

function CandidateHistory({
  candidateInfo,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
  onLoadMoreCandidates,
  loadingMoreCandidates,
}) {
  const candidates = candidateInfo?.items || [];
  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
          候选图历史
        </h3>
        <span className="border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400">
          {candidateInfo?.stats?.candidateCount || 0} 张
        </span>
      </div>

      {!candidates.length ? (
        <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
          暂无候选图
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate) => (
            <div key={candidate.id} data-testid="candidate-card" className="border border-zinc-800 bg-zinc-950 p-3">
              <div className="relative aspect-square bg-black">
                <Image
                  src={candidate.url}
                  alt={`候选图 ${candidate.candidateNumber}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-contain"
                  unoptimized
                />
                <div className="absolute left-2 top-2 flex gap-2">
                  <span className="bg-zinc-950/90 px-2 py-1 text-xs font-medium text-zinc-100">
                    候选 {candidate.candidateNumber}
                  </span>
                  {candidate.isPreferred && (
                    <span className="bg-emerald-500 px-2 py-1 text-xs font-medium text-zinc-950">
                      首选
                    </span>
                  )}
                </div>
              </div>

              <details className="mt-3 border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-400">
                <summary className="cursor-pointer font-semibold text-zinc-200">高级信息</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Info label="生成时间" value={formatDate(candidate.createdAt)} />
                <Info label="状态" value={formatRunStatus(candidate.run?.status || "completed")} />
                <Info label="服务商" value={candidate.run?.provider || "未知"} />
                <Info label="模型" value={candidate.run?.model || "未知"} />
                <Info label="接口协议" value={formatProtocol(candidate.run?.protocol || "未知")} />
                <Info label="尺寸" value={candidate.width ? `${candidate.width}x${candidate.height}` : "未知"} />
                <Info label="大小" value={formatBytes(candidate.byteSize)} />
                <Info label="输入是否过期" value={candidate.run?.usedStaleInput ? "是" : "否"} />
                <Info label="强制版本" value={candidate.isForcedVersion ? "是" : "否"} />
                <Info label="新版本" value={candidate.isNewVersion ? "是" : "否"} />
                </div>
              </details>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => onDownloadCandidate(candidate)}
                  data-testid="download-candidate-button"
                  data-plan-id={candidate.imagePlanId || ""}
                  className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-white"
                >
                  <FaDownload />
                  下载
                </button>
                <button
                  type="button"
                  onClick={() => onSetPreferredCandidate(candidate)}
                  data-testid="set-preferred-candidate-button"
                  data-plan-id={candidate.imagePlanId || ""}
                  className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold ${
                    candidate.isPreferred
                      ? "border border-emerald-700 text-emerald-200 hover:border-emerald-500"
                      : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  }`}
                >
                  <FaStar />
                  {candidate.isPreferred ? "取消首选" : "设为首选"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCandidate(candidate)}
                  disabled={candidate.isPreferred}
                  data-testid="delete-candidate-button"
                  data-plan-id={candidate.imagePlanId || ""}
                  className="flex items-center justify-center gap-2 border border-red-900 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-600 disabled:border-zinc-800 disabled:text-zinc-600"
                >
                  <FaTrash />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {candidateInfo?.nextCursor && (
        <button
          type="button"
          onClick={onLoadMoreCandidates}
          disabled={loadingMoreCandidates}
          className="mt-3 flex w-full items-center justify-center gap-2 border border-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
        >
          {loadingMoreCandidates && <FaSpinner className="animate-spin" />}
          加载更多候选图
        </button>
      )}
    </div>
  );
}

function IdentitySection({ identity, identityForm, savingIdentity, onChange, onSave }) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">产品身份证摘要</h2>
        <span
          className={`border px-2 py-1 text-xs font-medium ${
            identity?.isStale
              ? "border-amber-900 text-amber-300"
              : identity
                ? "border-emerald-900 text-emerald-300"
                : "border-zinc-800 text-zinc-500"
          }`}
        >
          {identity?.isStale ? "可能过期" : identity ? "有效" : "未识别"}
        </span>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Info label="商品名称" value={identity?.productName || "未填写"} />
        <Info label="类目" value={identity?.category || "未填写"} />
        <Info label="颜色" value={identity?.color || "未填写"} />
        <Info label="材质" value={identity?.material || "未填写"} />
        <Info label="结构" value={identity?.structure || "未填写"} />
        <Info label="核心卖点" value={`${identity?.sellingPoints?.length || 0} 条`} />
      </div>

      <form onSubmit={onSave} className="mt-5 grid gap-3 lg:grid-cols-2">
        {[
          ["productName", "商品名称", "input"],
          ["category", "类目", "input"],
          ["color", "颜色", "input"],
          ["material", "材质", "input"],
          ["structure", "结构", "textarea"],
          ["primaryReferenceDescription", "主参考图描述", "textarea"],
        ].map(([field, label, type]) => (
          <Field key={field} label={label}>
            {type === "input" ? (
              <input
                value={identityForm[field]}
                onChange={(event) => onChange({ ...identityForm, [field]: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
              />
            ) : (
              <textarea
                value={identityForm[field]}
                onChange={(event) => onChange({ ...identityForm, [field]: event.target.value })}
                className="h-20 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
              />
            )}
          </Field>
        ))}
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
              onChange={(event) => onChange({ ...identityForm, [field]: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
        ))}
        <div className="lg:col-span-2">
          <button
            disabled={savingIdentity}
            className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
          >
            {savingIdentity ? <FaSpinner className="animate-spin" /> : <FaCheck />}
            保存产品身份证
          </button>
        </div>
      </form>
    </section>
  );
}

function analysisStatus(identity, visionAssignment, analyzing) {
  if (analyzing) return "正在识别商品";
  if (!visionAssignment?.providerProfile) return "等待配置视觉模型";
  if (!identity) return "未识别";
  if (identity.isStale) return "产品身份证可能过期";
  return "识别成功";
}

function planningStatus(identity, planningAssignment, planning, planInfo) {
  if (planning) return "正在生成 5 张策划";
  if (!identity) return "等待产品身份证";
  if (identity.isStale) return "产品身份证已过期";
  if (!planningAssignment?.providerProfile) return "等待配置策划模型";
  if (planInfo?.plans?.length === 5 && planInfo?.hasStalePlans) return "策划可能已过期";
  if (planInfo?.plans?.length === 5) return "生成成功";
  return "未生成";
}

function generationStatus(identity, selectedPlan, provider, latestRun) {
  if (!identity) return "等待产品身份证";
  if (identity.isStale) return "商品身份证已过期";
  if (!selectedPlan) return "等待主图策划";
  if (selectedPlan.isStale) return "策划已过期";
  if (!provider) return "等待配置图片模型";
  if (!provider.supportsReferenceImages) return "参考图协议未支持";
  if (latestRun?.status === "processing") return "生成处理中";
  if (latestRun?.status === "completed") return "生成成功";
  if (latestRun?.status === "failed") return "生成失败";
  return "准备生成";
}

function buildWorkflowSteps({ project, identity, planInfo, generationSummary }) {
  const hasReferences = (project?.referenceImages || []).length > 0;
  const hasPrimary = (project?.referenceImages || []).some((image) => image.isPrimary);
  const hasIdentity = Boolean(identity);
  const hasPlans = planInfo?.plans?.length === 5;
  const hasGenerated = (generationSummary?.generatedPlanCount || 0) > 0;
  const zipReady = Boolean(generationSummary?.zipReady);

  const base = [
    {
      index: 1,
      label: "参考图",
      complete: hasReferences && hasPrimary,
      reason: hasReferences ? (hasPrimary ? "" : "需要设置主参考图") : "需要上传商品参考图",
    },
    {
      index: 2,
      label: "商品识别",
      complete: hasIdentity && !identity?.isStale,
      reason: !hasReferences || !hasPrimary ? "先完成参考图" : hasIdentity ? (identity?.isStale ? "需要重新识别" : "") : "需要商品识别",
    },
    {
      index: 3,
      label: "五图策划",
      complete: hasPlans && !planInfo?.hasStalePlans,
      reason: !hasIdentity ? "先完成商品识别" : hasPlans ? (planInfo?.hasStalePlans ? "需要重新策划" : "") : "需要生成五张策划",
    },
    {
      index: 4,
      label: "图片生成与导出",
      complete: zipReady,
      reason: !hasPlans ? "先生成五张策划" : zipReady ? "" : hasGenerated ? "等待五张首选图" : "需要逐张生成图片",
    },
  ];

  const currentIndex = base.find((step) => !step.complete)?.index || 4;
  return base.map((step) => ({
    ...step,
    status: step.complete ? "complete" : step.index === currentIndex ? "current" : "pending",
  }));
}

function formatStepStatus(status) {
  if (status === "complete") return "已完成";
  if (status === "current") return "当前步骤";
  return "等待";
}

function DisabledReason({ reason }) {
  if (!reason) return null;
  return <p className="mt-2 text-xs text-amber-300">暂不可用：{reason}</p>;
}

function formatDate(value) {
  if (!value) return "未知";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "未知";
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function formatProtocol(protocol) {
  if (!protocol) return "未知";
  if (protocol === "openai-image-edit") return "openai-image-edit（图片编辑）";
  if (protocol === "gemini-native-image") return "gemini-native-image（原生图片）";
  if (protocol === "openai-images") return "openai-images（纯文生图）";
  if (protocol === "doubao-image") return "doubao-image（未验证参考图）";
  if (protocol === "generic-async-image") return "generic-async-image（约定协议）";
  return protocol;
}

function formatRunStatus(status) {
  if (status === "processing") return "处理中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "pending") return "等待中";
  return status || "未知";
}

function formatReferenceSupport(provider) {
  if (!provider) return "未配置";
  if (provider.referenceImageSupportStatus === "verified" || provider.supportsReferenceImages) {
    return "已验证支持参考图";
  }
  if (provider.referenceImageSupportStatus === "text_only") return "仅文字生图";
  if (provider.referenceImageSupportStatus === "unverified") return "未验证参考图";
  return "不支持参考图";
}

function planTaskLabel(taskType) {
  const tab = PLAN_TABS.find((item) => item.taskType === taskType);
  return tab?.label.replace(/^图\d+\s*/, "") || taskType || "未命名";
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

function toPlanForm(plan) {
  if (!plan) return EMPTY_PLAN_FORM;
  return {
    coreSellingPoint: plan.coreSellingPoint || "",
    scene: plan.scene || "",
    composition: plan.composition || "",
    mainTitle: plan.mainTitle || "",
    subTitle: plan.subTitle || "",
    keyNotes: listToText(plan.keyNotes),
    mustKeep: listToText(plan.mustKeep),
    avoid: listToText(plan.avoid),
    finalPrompt: plan.finalPrompt || "",
  };
}

function fromPlanForm(form) {
  return {
    coreSellingPoint: form.coreSellingPoint,
    scene: form.scene,
    composition: form.composition,
    mainTitle: form.mainTitle,
    subTitle: form.subTitle,
    keyNotes: textToList(form.keyNotes),
    mustKeep: textToList(form.mustKeep),
    avoid: textToList(form.avoid),
    finalPrompt: form.finalPrompt,
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
      <span className="mb-2 block text-sm font-semibold uppercase tracking-widest text-zinc-500">
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
