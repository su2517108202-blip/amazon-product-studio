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
  const [candidateMap, setCandidateMap] = useState({});
  const [loadingMoreCandidates, setLoadingMoreCandidates] = useState(false);
  const [generationSummary, setGenerationSummary] = useState(null);
  const [planningRuns, setPlanningRuns] = useState([]);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM);
  const [activePlanIndex, setActivePlanIndex] = useState(1);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(1);
  const [assignments, setAssignments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generationMode, setGenerationMode] = useState(1);
  const [batchGeneration, setBatchGeneration] = useState(null);
  const [generationResolution, setGenerationResolution] = useState("1K");
  const [planDirty, setPlanDirty] = useState(false);
  const [draggingUpload, setDraggingUpload] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [analysisMigration, setAnalysisMigration] = useState(null);
  const [nameSuggestions, setNameSuggestions] = useState(null);
  const [userEditedName, setUserEditedName] = useState(false);
  const fileInputRef = useRef(null);
  const fetchRequestIdRef = useRef(0);

  const fetchProject = useCallback(async () => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
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
    if (requestId !== fetchRequestIdRef.current) return;

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
      const candidateRequests = (plansData.plans || []).map(async (plan) => {
        const res = await fetch(`/api/projects/${projectId}/image-plans/${plan.id}/generated-images`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `无法读取图${plan.planIndex}候选图历史`);
        return [plan.id, data];
      });
      const [generationRes, candidatesRes, candidateEntries] = await Promise.all([
        fetch(`/api/projects/${projectId}/image-plans/${nextPlan.id}/generations`),
        fetch(`/api/projects/${projectId}/image-plans/${nextPlan.id}/generated-images`),
        Promise.all(candidateRequests),
      ]);
      const generationData = await generationRes.json();
      const candidatesData = await candidatesRes.json();
      if (!generationRes.ok) {
        throw new Error(generationData.error || "无法读取图片生成记录");
      }
      if (!candidatesRes.ok) {
        throw new Error(candidatesData.error || "无法读取候选图历史");
      }
      if (requestId !== fetchRequestIdRef.current) return;
      setGenerationInfo(generationData);
      setCandidateInfo(candidatesData);
      setCandidateMap(Object.fromEntries(candidateEntries));
    } else {
      setGenerationInfo(null);
      setCandidateInfo(null);
      setCandidateMap({});
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
      const existingIds = new Set((candidateInfo?.items || []).map((item) => item.id));
      const appended = (data.items || []).filter((item) => !existingIds.has(item.id));
      const nextInfo = {
        ...data,
        items: [...(candidateInfo?.items || []), ...appended],
      };
      setCandidateInfo(nextInfo);
      setCandidateMap((currentMap) => ({
        ...currentMap,
        [selectedPlan.id]: nextInfo,
      }));
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

  const uploadFiles = useCallback(async (files) => {
    const incoming = Array.from(files || []).filter((file) => file?.type?.startsWith("image/"));
    if (!incoming.length) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      incoming.forEach((file) => formData.append("files", file));
      formData.append("imageRole", "other");

      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      await fetchProject();
      setMessage("参考图已上传，产品身份证可能需要重新识别");
      setActiveWorkflowStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [fetchProject, projectId]);

  useEffect(() => {
    if (!project) return undefined;
    const onPaste = (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!files.length) return;
      event.preventDefault();
      uploadFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [project, uploadFiles]);

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
    setAnalysisMigration(null);
    setMessage(`正在读取 ${selectedCount} 张参考图`);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "MODEL_UNAVAILABLE_FOR_ACCOUNT" && data.suggestedMigration) {
          setAnalysisMigration(data.suggestedMigration);
        }
        let errorMsg = data.code === "MODEL_UNAVAILABLE_FOR_ACCOUNT"
          ? (data.message || "当前账号无法使用 Gemini 2.5 Flash。请切换到 Gemini 3.6 Flash 后重新识别。")
          : `${data.code || "ERROR"}：${data.message || "识别失败"}`;
        const diag = data.diagnostic;
        if (diag) {
          const parts = [];
          if (diag.provider) parts.push(`服务商: ${diag.provider}`);
          if (diag.model) parts.push(`模型: ${diag.model}`);
          if (diag.upstreamHttpStatus) parts.push(`HTTP ${diag.upstreamHttpStatus}`);
          if (diag.upstreamStatus) parts.push(diag.upstreamStatus);
          if (diag.upstreamMessage) parts.push(diag.upstreamMessage);
          if (parts.length) errorMsg += `\n[诊断: ${parts.join(" | ")}]`;
        }
        throw new Error(errorMsg);
      }
      await fetchProject();
      setActiveWorkflowStep(2);
      if (data.reused) {
        setMessage("已复用上次识别结果");
      } else {
        setMessage("识别成功");
        // 生成命名建议
        const identityData = data.identity;
        if (identityData) {
          const productName = identityData.productName || "";
          const platform = project?.platform || "";
          const suggestedProductName = productName || "";
          const suggestedProjectName = productName
            ? `${productName}${platform && platform !== "通用电商" ? ` ${platform}` : ""}五图`
            : "";
          if (suggestedProductName || suggestedProjectName) {
            setNameSuggestions({ productName: suggestedProductName, projectName: suggestedProjectName });
          }
        }
      }
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
      setActiveWorkflowStep(3);
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
    const targetPlans = getGenerationTargetPlans({
      plans,
      selectedPlan,
      activePlanIndex,
      generationMode,
    });
    if (!targetPlans.length) {
      setError(generationMode === 5 ? "请先生成完整 5 张套图策划" : "请先选择一条主图策划");
      return;
    }
    if (generationMode === 5 && targetPlans.length < 5) {
      setError("整套生成需要先完成图1至图5的策划");
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
    const stale = identity.isStale || targetPlans.some((plan) => plan.isStale);
    const allowStaleInput =
      stale && window.confirm("当前产品身份证或部分策划可能过期，是否仍然生成？");
    if (stale && !allowStaleInput) return;

    const countText = targetPlans.length === 5 ? "整套 5 张" : `${targetPlans.length} 张`;
    const confirmed = window.confirm(`本次将调用真实图片生成 API 生成${countText}并可能产生费用，是否继续？`);
    if (!confirmed) return;

    const referenceImageIds = project.referenceImages
      .filter((image) => image.includeInGeneration || image.isPrimary)
      .map((image) => image.id);
    const items = targetPlans.map((plan) => ({
      planId: plan.id,
      planIndex: plan.planIndex,
      label: planLabel(plan.planIndex, plan.taskType),
      status: "waiting",
      message: "",
    }));
    const truncated = generationMode !== 5 && targetPlans.length < generationMode;

    setGeneratingImage(true);
    setError("");
    setMessage(truncated ? `剩余不足 ${generationMode} 张，将生成剩余 ${targetPlans.length} 张` : `正在生成${countText}`);
    setBatchGeneration({
      total: targetPlans.length,
      current: 0,
      successCount: 0,
      failureCount: 0,
      items,
    });

    let successCount = 0;
    const failures = [];
    try {
      for (const plan of targetPlans) {
        setBatchGeneration((current) => updateBatchItem(current, plan.id, {
          current: successCount + failures.length + 1,
          status: "generating",
          message: "生成中",
        }));
        try {
          const res = await fetch(
            `/api/projects/${projectId}/image-plans/${plan.id}/generations`,
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
          successCount += 1;
          setBatchGeneration((current) => updateBatchItem(current, plan.id, {
            status: "success",
            message: data.reused ? "复用旧结果" : "已生成",
            successCount,
            failureCount: failures.length,
          }));
        } catch (err) {
          failures.push({ plan, message: err.message });
          setBatchGeneration((current) => updateBatchItem(current, plan.id, {
            status: "failure",
            message: err.message,
            successCount,
            failureCount: failures.length,
          }));
        }
      }
      await fetchProject();
      setActiveWorkflowStep(4);
      if (failures.length) {
        setError(`批量生成完成 ${successCount}/${targetPlans.length}，失败：${failures.map((item) => `图${item.plan.planIndex}`).join("、")}`);
      } else {
        setMessage(`${truncated ? "已按剩余图位生成，" : ""}${countText}生成完成`);
      }
    } finally {
      setGeneratingImage(false);
    }
  }

  async function migrateVisionModelAndRetry() {
    if (!analysisMigration?.providerProfileId || !analysisMigration?.toModelId) return;
    setAnalyzing(true);
    setError("");
    setMessage(`正在切换到 ${analysisMigration.displayName || analysisMigration.toModelId}`);
    try {
      const res = await fetch("/api/model-role-assignments/product_vision", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerProfileId: analysisMigration.providerProfileId,
          modelId: analysisMigration.toModelId,
          isUserForced: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "切换商品识别模型失败");
      setMessage(`已切换到 ${analysisMigration.displayName || analysisMigration.toModelId}，正在重新识别商品`);
      const retryRes = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const retryData = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok) throw new Error(retryData.message || retryData.error || "重新识别失败");
      await fetchProject();
      setAnalysisMigration(null);
      setMessage("模型已切换，商品识别成功");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
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
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white"
          >
            <FaArrowLeft />
            返回项目
          </Link>
          <details className="border border-zinc-800 bg-zinc-900/45 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
              项目设置
            </summary>
            <form onSubmit={saveProject} className="mt-4 grid gap-4 lg:grid-cols-2">
              {nameSuggestions && !userEditedName && (() => {
                const projectNameCurrent = draft?.name || project?.name || "";
                const isUnnamed = !projectNameCurrent || projectNameCurrent === "未命名项目";
                const hasSuggestion = (nameSuggestions.productName && nameSuggestions.productName !== (draft?.productName || project?.productName || "")) || (nameSuggestions.projectName && isUnnamed);
                if (!hasSuggestion) return null;
                return (
                  <div className="border border-emerald-900/60 bg-emerald-950/30 px-3 py-3 lg:col-span-2">
                    <p className="text-[13px] font-semibold text-emerald-200">AI 识别出以下名称建议：</p>
                    <div className="mt-2 space-y-1 text-sm text-emerald-100">
                      {nameSuggestions.productName && <p>商品名称：<strong>{nameSuggestions.productName}</strong></p>}
                      {nameSuggestions.projectName && isUnnamed && <p>项目名称：<strong>{nameSuggestions.projectName}</strong></p>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => {
                        if (nameSuggestions.productName) setDraft((d) => ({ ...d, productName: nameSuggestions.productName }));
                        if (nameSuggestions.projectName) setDraft((d) => ({ ...d, name: nameSuggestions.projectName }));
                        setNameSuggestions(null); setMessage("已应用 AI 识别名称");
                      }} className="border border-emerald-700 px-3 py-1.5 text-[13px] font-semibold text-emerald-200 hover:bg-emerald-900/40">采用识别名称</button>
                      <button type="button" onClick={() => { setNameSuggestions(null); setUserEditedName(true); }} className="border border-zinc-700 px-3 py-1.5 text-[13px] font-semibold text-zinc-400 hover:text-zinc-200">保留原名称</button>
                    </div>
                  </div>
                );
              })()}
              <Field label="项目名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /></Field>
              <Field label="商品名称"><input value={draft.productName} onChange={(event) => setDraft({ ...draft, productName: event.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /></Field>
              <Field label="平台"><input value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /></Field>
              <Field label="比例"><input value={draft.aspectRatio} onChange={(event) => setDraft({ ...draft, aspectRatio: event.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /></Field>
              <Field label="备注"><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /></Field>
              <div className="flex items-end">
                <button disabled={saving} className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800">
                  {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                  保存项目
                </button>
              </div>
            </form>
          </details>
        </div>

        {(message || error) && (
          <div className={`mb-5 border px-3 py-2 text-sm ${error ? "border-red-900/60 bg-red-950/40 text-red-200" : "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"}`}>
            <p>{error || message}</p>
            {error && analysisMigration && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/settings/providers?section=roles"
                  data-testid="go-model-roles-button"
                  className="border border-red-800 px-3 py-2 text-xs font-semibold text-red-100 hover:border-red-500"
                >
                  前往模型分工
                </Link>
                <button
                  type="button"
                  onClick={migrateVisionModelAndRetry}
                  disabled={analyzing}
                  data-testid="migrate-vision-model-button"
                  className="bg-amber-500 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  切换到 {analysisMigration.displayName || analysisMigration.toModelId} 并重试
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <StageProgress
            steps={workflowSteps}
            activeStepIndex={activeWorkflowStep}
            summaries={{
              1: `${project.referenceImages.length} 张商品图，主图${project.referenceImages.some((image) => image.isPrimary) ? "已设置" : "未设置"}`,
              2: identity ? `${identity.productName || "未命名商品"} · ${identity.category || "未填写类目"}` : "还没有识别商品",
              3: `${plans.length}/5 张套图策划`,
              4: `${generationSummary?.preferredCount || 0}/5 张首选图`,
            }}
            onSelectStep={setActiveWorkflowStep}
          />

        <section className="min-w-0 space-y-4">
          <StepPanel
            key={`step-1-${workflowSteps[0].status}`}
            step={workflowSteps[0]}
            active={activeWorkflowStep === 1}
            summary={`${project.referenceImages.length} 张商品图，主图${project.referenceImages.some((image) => image.isPrimary) ? "已设置" : "未设置"}`}
          >
            <ReferenceImages
              fileInputRef={fileInputRef}
              project={project}
              uploading={uploading}
              selectedCount={selectedCount}
              generationReferenceCount={generationReferenceCount}
              draggingUpload={draggingUpload}
              onDragState={setDraggingUpload}
              onUpload={uploadFiles}
              onUpdate={updateImage}
              onDelete={deleteImage}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => analyzeProduct({ force: false })}
                disabled={!visionAssignment?.providerProfile || selectedCount === 0 || analyzing}
                data-testid="next-analyze-product-button"
                className="flex items-center justify-center gap-2 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {analyzing ? <FaSpinner className="animate-spin" /> : <FaEye />}
                下一步：识别商品
              </button>
            </div>
          </StepPanel>

          <StepPanel
            key={`step-2-${workflowSteps[1].status}`}
            step={workflowSteps[1]}
            active={activeWorkflowStep === 2}
            summary={identity ? `${identity.productName || "未命名商品"} · ${identity.category || "未填写类目"}` : "还没有识别商品"}
          >
            <WorkflowPanel
              identity={identity}
              selectedCount={selectedCount}
              visionAssignment={visionAssignment}
              analyzing={analyzing}
              onAnalyze={analyzeProduct}
            />
            <IdentitySection
              identity={identity}
              identityForm={identityForm}
              savingIdentity={savingIdentity}
              onChange={setIdentityForm}
              onSave={saveIdentity}
            />
          </StepPanel>

          <StepPanel
            key={`step-3-${workflowSteps[2].status}`}
            step={workflowSteps[2]}
            active={activeWorkflowStep === 3}
            summary={`${plans.length}/5 张套图策划`}
          >
            <PlanningSection
              plans={plans}
              planForm={planForm}
              activePlanIndex={activePlanIndex}
              planDirty={planDirty}
              planning={planning}
              savingPlan={savingPlan}
              selectedPlan={selectedPlan}
              generationSummary={generationSummary}
              onGenerate={generatePlans}
              onSelectPlan={selectPlan}
              onUpdatePlanForm={updatePlanForm}
              onSavePlan={savePlan}
            />
          </StepPanel>

          <StepPanel
            key={`step-4-${workflowSteps[3].status}`}
            step={workflowSteps[3]}
            active={activeWorkflowStep === 4}
            summary={`${generationSummary?.preferredCount || 0}/5 张首选图`}
          >
            <GenerationSummaryBar
              summary={generationSummary}
              onDownloadPreferredZip={downloadPreferredZip}
            />
            <GenerationPanel
              identity={identity}
              project={project}
              selectedPlan={selectedPlan}
              generationAssignment={generationAssignment}
              generationInfo={generationInfo}
              candidateInfo={candidateInfo}
              plans={plans}
              activePlanIndex={activePlanIndex}
              generationReferenceCount={generationReferenceCount}
              generationResolution={generationResolution}
              generationMode={generationMode}
              batchGeneration={batchGeneration}
              generatingImage={generatingImage}
              onResolutionChange={setGenerationResolution}
              onGenerationModeChange={setGenerationMode}
              onGenerateImage={generateCurrentImage}
              onCheckGeneration={checkCurrentGeneration}
            />
            <details data-testid="generation-history-details" className="border border-zinc-800 bg-zinc-900/35 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                查看生成历史（按图位归档）
              </summary>
              <GenerationResultsByPlan
                plans={plans}
                candidateMap={candidateMap}
                selectedPlanId={selectedPlan?.id || ""}
                selectedCandidateInfo={candidateInfo}
                loadingMoreCandidates={loadingMoreCandidates}
                onSelectPlan={selectPlan}
                onSetPreferredCandidate={setPreferredCandidate}
                onDeleteCandidate={deleteCandidate}
                onDownloadCandidate={downloadCandidate}
                onLoadMoreCandidates={loadMoreCandidates}
              />
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <h2 className="text-base font-semibold text-white">调用统计</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="识别成功" value={`${successfulRuns.length}`} />
                  <Info label="识别失败" value={`${failedRuns.length}`} />
                  <Info label="策划成功" value={`${planInfo.stats?.successCount || 0}`} />
                  <Info label="策划失败" value={`${planInfo.stats?.failureCount || 0}`} />
                </dl>
              </div>
            </details>
          </StepPanel>
        </section>
        </div>
      </div>
    </main>
  );
}

function WorkflowPanel({
  identity,
  selectedCount,
  visionAssignment,
  analyzing,
  onAnalyze,
}) {
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
  return (
    <div className="mb-4 border border-zinc-800 bg-zinc-950 p-4">
      <section>
        <h2 className="text-base font-semibold text-white">识别商品</h2>
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
    </div>
  );
}

function StepPanel({ step, active, summary, children }) {
  const isCurrent = step.status === "current";
  const disabled = step.status === "pending";

  return (
    <section
      data-testid={`workflow-step-${step.index}`}
      data-current={isCurrent ? "true" : "false"}
      data-open={active ? "true" : "false"}
      className={`border p-4 ${
        isCurrent
          ? "border-sky-700 bg-sky-950/20"
          : step.status === "complete"
            ? "border-emerald-900 bg-zinc-900/35"
            : "border-zinc-800 bg-zinc-900/20 opacity-75"
      } ${active ? "" : "hidden"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">
            {step.index} {step.label}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {disabled ? step.reason : summary}
          </p>
        </div>
        <span className="border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-300">
          {formatStepStatus(step.status)}
        </span>
      </div>
      {disabled ? (
        <p className="mt-4 border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-500">
          先完成前一步：{step.reason}
        </p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}

function StageProgress({ steps, activeStepIndex, summaries, onSelectStep }) {
  return (
    <aside className="border border-zinc-800 bg-zinc-900/35 p-4 lg:sticky lg:top-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        制作步骤
      </p>
      <ol className="grid gap-2" data-testid="project-four-step-nav">
        {steps.map((step) => (
          <li key={step.index}>
            <button
              type="button"
              onClick={() => onSelectStep(step.index)}
              data-testid={`workflow-step-${step.index}-toggle`}
              data-active={activeStepIndex === step.index ? "true" : "false"}
              className={`w-full border px-3 py-3 text-left text-sm transition ${
                activeStepIndex === step.index
                  ? "border-white bg-zinc-100 text-zinc-950"
                  : step.status === "current"
                ? "border-sky-700 bg-sky-950/30 text-sky-100"
                : step.status === "complete"
                  ? "border-emerald-800 bg-emerald-950/20 text-emerald-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{step.index} {step.label}</span>
                <span className={activeStepIndex === step.index ? "text-zinc-600" : ""}>
                  {formatStepStatus(step.status)}
                </span>
              </div>
              <p className={`mt-1 text-xs ${activeStepIndex === step.index ? "text-zinc-700" : "text-zinc-400"}`}>
                {summaries?.[step.index] || step.reason || "未开始"}
              </p>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ReferenceImages({
  fileInputRef,
  project,
  uploading,
  selectedCount,
  generationReferenceCount,
  draggingUpload,
  onDragState,
  onUpload,
  onUpdate,
  onDelete,
}) {
  function handleDrop(event) {
    event.preventDefault();
    onDragState(false);
    onUpload(Array.from(event.dataTransfer?.files || []));
  }

  function handleDrag(event, active) {
    event.preventDefault();
    onDragState(active);
  }

  return (
    <section className="mt-5 border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">商品参考图</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {project.referenceImages.length}/14 · 可拖拽、点击或 Ctrl+V 上传
          </p>
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

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(event) => handleDrag(event, true)}
        onDragEnter={(event) => handleDrag(event, true)}
        onDragLeave={(event) => handleDrag(event, false)}
        data-testid="reference-drop-zone"
        className={`mb-4 flex min-h-28 w-full flex-col items-center justify-center border border-dashed px-4 py-5 text-center transition ${
          draggingUpload
            ? "border-emerald-500 bg-emerald-950/30 text-emerald-100"
            : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        }`}
      >
        <FaImage className="mb-2 text-2xl" />
        <span className="text-sm font-bold">
          {uploading ? "正在上传参考图" : "拖入图片、点击选择，或 Ctrl+V 粘贴"}
        </span>
      </button>

      {project.referenceImages.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-[220px] w-full flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        >
          <FaImage className="mb-3 text-3xl" />
          <span className="text-sm font-bold">添加商品参考图</span>
        </button>
      ) : (
        <div className="grid gap-4">
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
                <details data-testid="reference-advanced-settings" className="border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-400">
                  <summary className="cursor-pointer font-semibold text-zinc-200">图片高级设置</summary>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-2">
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
                    <label className="flex items-center gap-2">
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
                      className="w-full border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm outline-none"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </details>
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
                    设为主图
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
  generationSummary,
  onGenerate,
  onSelectPlan,
  onUpdatePlanForm,
  onSavePlan,
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
          data-testid="generate-plans-button"
          className="flex items-center gap-2 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {planning ? <FaSpinner className="animate-spin" /> : <FaLightbulb />}
          {plans.length === 5 ? "重新生成策划" : "生成整套策划"}
        </button>
      </div>

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
          <Field label="场景">
            <textarea
              value={planForm.scene}
              onChange={(event) => onUpdatePlanForm({ scene: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <details data-testid="planning-advanced-editor" className="border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400 lg:col-span-2">
            <summary className="cursor-pointer font-semibold text-zinc-200">编辑高级策划</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="副标题">
                <input value={planForm.subTitle} onChange={(event) => onUpdatePlanForm({ subTitle: event.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
              <Field label="构图">
                <textarea value={planForm.composition} onChange={(event) => onUpdatePlanForm({ composition: event.target.value })} className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
              <Field label="补充要点（逐行）">
                <textarea value={planForm.keyNotes} onChange={(event) => onUpdatePlanForm({ keyNotes: event.target.value })} className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
              <Field label="必须保持（逐行）">
                <textarea value={planForm.mustKeep} onChange={(event) => onUpdatePlanForm({ mustKeep: event.target.value })} className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
              <Field label="禁止改变（逐行）">
                <textarea value={planForm.avoid} onChange={(event) => onUpdatePlanForm({ avoid: event.target.value })} className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
              <Field label="最终提示词">
                <textarea value={planForm.finalPrompt} onChange={(event) => onUpdatePlanForm({ finalPrompt: event.target.value })} className="h-48 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              </Field>
            </div>
          </details>
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
  plans,
  activePlanIndex,
  generationReferenceCount,
  generationResolution,
  generationMode,
  batchGeneration,
  generatingImage,
  onResolutionChange,
  onGenerationModeChange,
  onGenerateImage,
  onCheckGeneration,
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
  const targetPlans = getGenerationTargetPlans({
    plans,
    selectedPlan,
    activePlanIndex,
    generationMode,
  });
  const truncated = generationMode !== 5 && targetPlans.length > 0 && targetPlans.length < generationMode;
  const modeLabel = generationMode === 5 ? "整套5张" : `生成${generationMode}张`;

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
            批量图片生成
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            当前图位候选 {candidateInfo?.stats?.candidateCount || 0} 张 · {modeLabel}
            {targetPlans.length ? `：${targetPlans.map((plan) => `图${plan.planIndex}`).join(" + ")}` : ""}
          </p>
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

      <div className="mt-3 border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-sm font-semibold text-zinc-200">生成模式</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {[
            [1, "当前 1 张"],
            [2, "当前 2 张"],
            [3, "当前 3 张"],
            [5, "整套 5 张"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onGenerationModeChange(mode)}
              data-testid={`generation-mode-${mode}`}
              data-active={generationMode === mode ? "true" : "false"}
              className={`border px-3 py-2 text-sm font-semibold ${
                generationMode === mode
                  ? "border-sky-500 bg-sky-950/40 text-sky-100"
                  : "border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {truncated && (
          <p className="mt-2 text-xs text-amber-300">
            当前从图{activePlanIndex}开始剩余不足 {generationMode} 张，将只生成剩余 {targetPlans.length} 张。
          </p>
        )}
      </div>

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
          {generationMode === 5 ? "生成整套5张" : `生成${targetPlans.length || generationMode}张`}
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

      <BatchGenerationStatus batch={batchGeneration} />

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

    </div>
  );
}

function BatchGenerationStatus({ batch }) {
  if (!batch) return null;
  return (
    <div className="mt-4 border border-sky-900/70 bg-sky-950/20 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-sky-100">
          批量任务 {Math.min(batch.current || 0, batch.total)}/{batch.total}
        </p>
        <p className="text-xs text-zinc-400">
          成功 {batch.successCount || 0} · 失败 {batch.failureCount || 0}
        </p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {(batch.items || []).map((item) => (
          <div key={item.planId} className="flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
            <span className="text-zinc-200">{item.label}</span>
            <span className={batchStatusClass(item.status)}>
              {formatBatchStatus(item.status)}
              {item.message ? ` · ${item.message}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenerationResultsByPlan({
  plans,
  candidateMap,
  selectedPlanId,
  selectedCandidateInfo,
  loadingMoreCandidates,
  onSelectPlan,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
  onLoadMoreCandidates,
}) {
  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
          生成结果归档
        </h3>
        <span className="border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400">
          图位分组
        </span>
      </div>

      <div className="space-y-4">
        {[...plans].sort((a, b) => a.planIndex - b.planIndex).map((plan) => {
          const info = plan.id === selectedPlanId
            ? selectedCandidateInfo || candidateMap[plan.id]
            : candidateMap[plan.id];
          const candidates = info?.items || [];
          const selected = plan.id === selectedPlanId;
          return (
            <section
              key={plan.id}
              data-testid="generation-result-plan-group"
              data-plan-id={plan.id}
              className={`border p-3 ${selected ? "border-emerald-800 bg-emerald-950/15" : "border-zinc-800 bg-zinc-950"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan.planIndex)}
                  className="text-left"
                >
                  <h4 className="font-semibold text-white">{planLabel(plan.planIndex, plan.taskType)}</h4>
                  <p className="mt-1 text-xs text-zinc-500">
                    候选 {info?.stats?.candidateCount || candidates.length || 0} · {plan.coreSellingPoint || "未填写核心卖点"}
                  </p>
                </button>
                <span className={`border px-2 py-1 text-xs font-semibold ${candidates.some((item) => item.isPreferred) ? "border-emerald-700 text-emerald-200" : "border-zinc-800 text-zinc-500"}`}>
                  {candidates.some((item) => item.isPreferred) ? "已首选" : "未首选"}
                </span>
              </div>

              {!candidates.length ? (
                <div className="mt-3 border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-center text-sm text-zinc-500">
                  图{plan.planIndex} 暂无候选图
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      exposeTestIds={selected}
                      onSetPreferredCandidate={onSetPreferredCandidate}
                      onDeleteCandidate={onDeleteCandidate}
                      onDownloadCandidate={onDownloadCandidate}
                    />
                  ))}
                </div>
              )}

              {selected && info?.nextCursor && (
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
            </section>
          );
        })}
        {!plans.length && (
          <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
            生成策划后会按图1至图5归档候选图。
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  exposeTestIds,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
}) {
  return (
    <div data-testid={exposeTestIds ? "candidate-card" : undefined} className="border border-zinc-800 bg-zinc-950 p-3">
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

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <a
          href={candidate.url}
          target="_blank"
          rel="noreferrer"
          data-testid={exposeTestIds ? "view-candidate-button" : undefined}
          data-plan-id={candidate.imagePlanId || ""}
          className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-white"
        >
          <FaEye />
          查看
        </a>
        <button
          type="button"
          onClick={() => onDownloadCandidate(candidate)}
          data-testid={exposeTestIds ? "download-candidate-button" : undefined}
          data-plan-id={candidate.imagePlanId || ""}
          className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-white"
        >
          <FaDownload />
          下载
        </button>
        <button
          type="button"
          onClick={() => onSetPreferredCandidate(candidate)}
          data-testid={exposeTestIds ? "set-preferred-candidate-button" : undefined}
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
          data-testid={exposeTestIds ? "delete-candidate-button" : undefined}
          data-plan-id={candidate.imagePlanId || ""}
          className="flex items-center justify-center gap-2 border border-red-900 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-600 disabled:border-zinc-800 disabled:text-zinc-600"
        >
          <FaTrash />
          删除
        </button>
      </div>
    </div>
  );
}

function IdentitySection({ identity, identityForm, savingIdentity, onChange, onSave }) {
  const sellingPoints = Array.isArray(identity?.sellingPoints) ? identity.sellingPoints.slice(0, 5) : [];
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">商品信息</h2>
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
        <Info label="商品类别" value={identity?.category || "未填写"} />
        <Info label="颜色" value={identity?.color || "未填写"} />
        <Info label="材质" value={identity?.material || "未填写"} />
      </div>
      <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-sm font-semibold text-zinc-300">主要卖点</p>
        {sellingPoints.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
            {sellingPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">识别完成后会显示 3-5 个主要卖点。</p>
        )}
      </div>

      <details data-testid="identity-full-details" className="mt-4 border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
        <summary className="cursor-pointer font-semibold text-zinc-200">查看完整识别信息</summary>
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
      </details>
    </section>
  );
}

function getGenerationTargetPlans({ plans, selectedPlan, activePlanIndex, generationMode }) {
  const orderedPlans = [...(plans || [])].sort((a, b) => a.planIndex - b.planIndex);
  if (generationMode === 5) {
    return PLAN_TABS
      .map((tab) => orderedPlans.find((plan) => plan.planIndex === tab.index))
      .filter(Boolean);
  }
  if (!selectedPlan) return [];
  return orderedPlans
    .filter((plan) => plan.planIndex >= activePlanIndex)
    .slice(0, generationMode);
}

function updateBatchItem(current, planId, patch) {
  if (!current) return current;
  return {
    ...current,
    current: patch.current ?? current.current,
    successCount: patch.successCount ?? current.successCount,
    failureCount: patch.failureCount ?? current.failureCount,
    items: current.items.map((item) =>
      item.planId === planId
        ? { ...item, status: patch.status ?? item.status, message: patch.message ?? item.message }
        : item,
    ),
  };
}

function planLabel(planIndex, taskType) {
  const tab = PLAN_TABS.find((item) => item.index === planIndex);
  if (tab) return tab.label;
  return `图${planIndex} ${planTaskLabel(taskType)}`;
}

function formatBatchStatus(status) {
  if (status === "generating") return "生成中";
  if (status === "success") return "成功";
  if (status === "failure") return "失败";
  return "等待";
}

function batchStatusClass(status) {
  if (status === "generating") return "text-sky-300";
  if (status === "success") return "text-emerald-300";
  if (status === "failure") return "text-red-300";
  return "text-zinc-500";
}

function analysisStatus(identity, visionAssignment, analyzing) {
  if (analyzing) return "正在识别商品";
  if (!visionAssignment?.providerProfile) return "等待配置视觉模型";
  if (!identity) return "未识别";
  if (identity.isStale) return "产品身份证可能过期";
  return "识别成功";
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
      label: "上传商品图",
      complete: hasReferences && hasPrimary,
      reason: hasReferences ? (hasPrimary ? "" : "需要设置主参考图") : "需要上传商品参考图",
    },
    {
      index: 2,
      label: "确认商品",
      complete: hasIdentity && !identity?.isStale,
      reason: !hasReferences || !hasPrimary ? "先完成参考图" : hasIdentity ? (identity?.isStale ? "需要重新识别" : "") : "需要商品识别",
    },
    {
      index: 3,
      label: "选择套图方案",
      complete: hasPlans && !planInfo?.hasStalePlans,
      reason: !hasIdentity ? "先完成商品识别" : hasPlans ? (planInfo?.hasStalePlans ? "需要重新策划" : "") : "需要生成五张策划",
    },
    {
      index: 4,
      label: "生成与下载",
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
  if (status === "current") return "进行中";
  return "未开始";
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
