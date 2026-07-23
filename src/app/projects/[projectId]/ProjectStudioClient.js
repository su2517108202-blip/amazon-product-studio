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
  { value: "front", label: "����" },
  { value: "back", label: "����" },
  { value: "side", label: "����" },
  { value: "inside", label: "�ڲ�" },
  { value: "detail", label: "ϸ��" },
  { value: "packaging", label: "��װ" },
  { value: "scene", label: "����" },
  { value: "other", label: "����" },
];

const PLAN_TABS = [
  { index: 1, taskType: "hero", label: "ͼ1 �����ͼ" },
  { index: 2, taskType: "structure", label: "ͼ2 ���Ľṹ" },
  { index: 3, taskType: "function", label: "ͼ3 ���Ĺ���" },
  { index: 4, taskType: "scenario", label: "ͼ4 ʹ�ó���" },
  { index: 5, taskType: "detail", label: "ͼ5 ϸ������" },
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
    const [projectRes, identityRes, assignmentsRes, runsRes, plansRes, planningRunsRes, summaryRes] =
      await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/product-identity`),
        fetch("/api/model-role-assignments"),
        fetch(`/api/projects/${projectId}/analysis-runs`),
        fetch(`/api/projects/${projectId}/image-plans`),
        fetch(`/api/projects/${projectId}/image-planning-runs`),
        fetch(`/api/projects/${projectId}/generation-summary`),
      ]);

    const projectData = await projectRes.json();
    const identityData = await identityRes.json();
    const assignmentsData = await assignmentsRes.json();
    const runsData = await runsRes.json();
    const plansData = await plansRes.json();
    const planningRunsData = await planningRunsRes.json();
    const summaryData = await summaryRes.json();

    if (!projectRes.ok) throw new Error(projectData.error || "�޷���ȡ��Ŀ");
    if (!identityRes.ok) throw new Error(identityData.error || "�޷���ȡ��Ʒ����֤");
    if (!assignmentsRes.ok) throw new Error(assignmentsData.error || "�޷���ȡģ������");
    if (!runsRes.ok) throw new Error(runsData.error || "�޷���ȡʶ���¼");
    if (!plansRes.ok) throw new Error(plansData.error || "�޷���ȡ��ͼ�߻�");
    if (!planningRunsRes.ok) throw new Error(planningRunsData.error || "�޷���ȡ�߻���¼");
    if (!summaryRes.ok) throw new Error(summaryData.error || "�޷���ȡ����ժҪ");

    setProject(projectData);
    setDraft({
      name: projectData.name || "",
      productName: projectData.productName || "",
      platform: projectData.platform || "ͨ�õ���",
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
        throw new Error(generationData.error || "�޷���ȡͼƬ���ɼ�¼");
      }
      if (!candidatesRes.ok) {
        throw new Error(candidatesData.error || "�޷���ȡ��ѡͼ��ʷ");
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
        if (!res.ok) throw new Error(data.error || "���ʧ��");
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
    if (planDirty && !window.confirm("��ǰ�߻���δ�����޸ģ��л���ᶪʧ���Ƿ������")) {
      return;
    }
    const next = plans.find((plan) => plan.planIndex === index);
    setActivePlanIndex(index);
    setPlanForm(next ? toPlanForm(next) : EMPTY_PLAN_FORM);
    setPlanDirty(false);
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
      if (!res.ok) throw new Error(data.error || "����ʧ��");
      await fetchProject();
      setMessage("��Ŀ�ѱ���");
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
      if (!res.ok) throw new Error(data.error || "�ϴ�ʧ��");
      await fetchProject();
      setMessage("�ο�ͼ���ϴ�����Ʒ����֤������Ҫ����ʶ��");
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
      setError("����ʶ���ͼƬ��� 8 ��");
      return;
    }
    const isGenerationChecking = payload.includeInGeneration === true;
    if (isGenerationChecking && generationReferenceCount >= 4) {
      setError("�������ɵĲο�ͼ��� 4 ��");
      return;
    }
    const res = await fetch(`/api/reference-images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "����ͼƬʧ��");
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
      setError(data.error || "ɾ��ͼƬʧ��");
      return;
    }
    await fetchProject();
  }

  async function analyzeProduct({ force = false } = {}) {
    if (!visionAssignment?.providerProfile) {
      setError("���ȵ� API ���ð���Ʒʶͼģ��");
      return;
    }
    if (!project.referenceImages.some((image) => image.isPrimary)) {
      setError("�����������ο�ͼ");
      return;
    }
    if (selectedCount > 8) {
      setError("����ʶ���ͼƬ��� 8 ��");
      return;
    }
    if (identity && force) {
      const ok = window.confirm("����ʶ��Ḳ�ǵ�ǰ��Ʒ����֤���Ƿ������");
      if (!ok) return;
    }

    setAnalyzing(true);
    setError("");
    setMessage(`���ڶ�ȡ ${selectedCount} �Ųο�ͼ`);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`${data.code || "ERROR"}��${data.message || "ʶ��ʧ��"}`);
      }
      await fetchProject();
      setMessage(data.reused ? "�Ѹ����ϴ�ʶ����" : "ʶ��ɹ�");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function generatePlans({ force = false } = {}) {
    if (!planningAssignment?.providerProfile) {
      setError("���ȵ� API ���ð󶨲߻�ģ��");
      return;
    }
    if (!identity) {
      setError("���������Ʒʶ�����ɲ�Ʒ����֤");
      return;
    }

    const hasPlans = plans.length === 5;
    if (hasPlans && force) {
      const manual = plans.some((plan) => plan.isManuallyEdited);
      const ok = window.confirm(
        `�������ɻḲ�ǵ�ǰ 5 �Ų߻�������Ӱ��ο�ͼ�Ͳ�Ʒ����֤��${manual ? "��ǰ�����ֶ��޸����ݡ�" : ""}�Ƿ������`,
      );
      if (!ok) return;
    }

    const allowStaleIdentity =
      identity.isStale &&
      window.confirm("��Ʒ����֤�����ѹ��ڣ��Ƿ���ʹ�õ�ǰ����֤���ɲ߻���");
    if (identity.isStale && !allowStaleIdentity) return;

    setPlanning(true);
    setError("");
    setMessage("�������� 5 ����ͼ�߻�");
    try {
      const res = await fetch(`/api/projects/${projectId}/image-plans/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, allowStaleIdentity }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`${data.code || "ERROR"}��${data.message || "����ʧ��"}`);
      }
      await fetchProject();
      setMessage(data.reused ? "��ʹ������ 5 �Ų߻�" : "5 ����ͼ�߻�������");
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
      if (!res.ok) throw new Error(data.error || "�����Ʒ����֤ʧ��");
      await fetchProject();
      setMessage("��Ʒ����֤�ѱ��棬���в߻��ѱ��Ϊ���ܹ���");
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
      if (!res.ok) throw new Error(data.error || "����߻�ʧ��");
      await fetchProject();
      setActivePlanIndex(data.planIndex);
      setPlanForm(toPlanForm(data));
      setPlanDirty(false);
      setMessage(`ͼ${data.planIndex} �߻��ѱ���`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPlan(false);
    }
  }

	  async function generateCurrentImage({ force = false } = {}) {
	    if (!selectedPlan) {
	      setError("����ѡ��һ����ͼ�߻�");
	      return;
	    }
	    if (!generationAssignment?.providerProfile) {
	      setError("���ȵ� API ���ð�ͼƬ����ģ��");
	      return;
	    }
	    if (!generationAssignment.providerProfile.supportsReferenceImages) {
	      setError("��ǰͼƬ����Э��δ��ʵ֧�ֲο�ͼ����������Ĭ�ϵ�����Ʒͼ����");
	      return;
	    }
	    if (!identity) {
	      setError("���������Ʒʶ��");
	      return;
	    }
	    if (!project.referenceImages.some((image) => image.isPrimary)) {
	      setError("�����������ο�ͼ");
	      return;
	    }
	    if (generationReferenceCount > 4) {
	      setError("�������ɵĲο�ͼ��� 4 ��");
	      return;
	    }
	    const stale = identity.isStale || selectedPlan.isStale;
	    const allowStaleInput =
	      stale && window.confirm("��ǰ��Ʒ����֤��߻����ܹ��ڣ��Ƿ���Ȼ���ɣ�");
    if (stale && !allowStaleInput) return;

    const confirmed = window.confirm("���ν�������ʵͼƬ���� API �����ܲ������ã��Ƿ������");
    if (!confirmed) return;

    setGeneratingImage(true);
    setError("");
	    setMessage("�������ɵ�ǰͼƬ");
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
	      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "����ʧ��"}`);
	      await fetchProject();
	      setMessage(data.reused ? "��ʹ����������ͼ" : "��ǰͼƬ������");
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
	      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "���ʧ��"}`);
	      await fetchProject();
	      setMessage(data.status === "completed" ? "ͼƬ���������" : "ͼƬ���ڴ�����");
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
    try {
      const res = await fetch(
        `/api/projects/${projectId}/image-plans/${selectedPlan.id}/preferred-image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generatedImageId: nextId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "����ʧ��"}`);
      await fetchProject();
      setMessage(nextId ? `ͼ${selectedPlan.planIndex} ��ѡͼ�ѱ���` : `ͼ${selectedPlan.planIndex} ��ѡͼ��ȡ��`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteCandidate(candidate) {
    const ok = window.confirm(`ȷ��ɾ����ѡͼ ${candidate.candidateNumber}�����ɼ�¼�ᱣ����`);
    if (!ok) return;
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/generated-images/${candidate.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}: ${data.error || "ɾ��ʧ��"}`);
      await fetchProject();
      setMessage(`��ѡͼ ${candidate.candidateNumber} ��ɾ��`);
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
            ���ڶ�ȡ
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
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white"
          >
            <FaArrowLeft />
            ������Ŀ
          </Link>

          <form onSubmit={saveProject} className="space-y-4">
            <Field label="��Ŀ����">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <Field label="��Ʒ����">
              <input
                value={draft.productName}
                onChange={(event) =>
                  setDraft({ ...draft, productName: event.target.value })
                }
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ƽ̨">
                <input
                  value={draft.platform}
                  onChange={(event) =>
                    setDraft({ ...draft, platform: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                />
              </Field>
              <Field label="����">
                <input
                  value={draft.aspectRatio}
                  onChange={(event) =>
                    setDraft({ ...draft, aspectRatio: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                />
              </Field>
            </div>
            <Field label="��ע">
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
              ������Ŀ
            </button>
          </form>

          <WorkflowPanel
            identity={identity}
            selectedCount={selectedCount}
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
              className={`mt-4 border px-3 py-2 text-sm ${
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
          <h2 className="text-sm font-semibold text-white">����ͳ��</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Info label="ʶ��ɹ�" value={`${successfulRuns.length}`} />
            <Info label="ʶ��ʧ��" value={`${failedRuns.length}`} />
            <Info label="�ϴ�ʶ��ģ��" value={lastRun?.model || "��"} />
            <Info label="�߻��ɹ�" value={`${planInfo.stats?.successCount || 0}`} />
            <Info label="�߻�ʧ��" value={`${planInfo.stats?.failureCount || 0}`} />
            <Info label="�ϴβ߻���Ӧ��" value={lastPlanningRun?.provider || "��"} />
            <Info label="�ϴβ߻�ģ��" value={lastPlanningRun?.model || "��"} />
            <Info
              label="�ϴβ߻���ʱ"
              value={
                lastPlanningRun?.durationMs == null
                  ? "��"
                  : `${lastPlanningRun.durationMs}ms`
              }
            />
          </dl>
          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400">����߻���¼</h3>
            {planningRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="border border-zinc-800 bg-zinc-950 p-2 text-sm">
                <p className="font-semibold text-zinc-200">{formatRunStatus(run.status)}</p>
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
  return (
    <div className="mt-5 space-y-5 border-t border-zinc-800 pt-4">
      <section>
        <h2 className="text-sm font-semibold text-white">��Ʒʶ��</h2>
        <p className="mt-2 text-sm text-zinc-500">
          ��ǰ�Ӿ�ģ�ͣ�
          {visionAssignment?.providerProfile
            ? `${visionAssignment.providerProfile.name} / ${visionAssignment.providerProfile.modelId}`
            : "δ����"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">��ѡ {selectedCount}/8 ��</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onAnalyze({ force: false })}
            disabled={analyzing || !visionAssignment?.providerProfile}
            className="flex items-center justify-center gap-2 bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {analyzing ? <FaSpinner className="animate-spin" /> : <FaEye />}
            ʶ����Ʒ
          </button>
          <button
            onClick={() => onAnalyze({ force: true })}
            disabled={analyzing || !identity}
            className="border border-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
          >
            ����ʶ��
          </button>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          ״̬��{analysisStatus(identity, visionAssignment, analyzing)}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">5 ����ͼ�߻�</h2>
        <p className="mt-2 text-sm text-zinc-500">
          ��ǰ�߻�ģ�ͣ�
          {planningAssignment?.providerProfile
            ? `${planningAssignment.providerProfile.name} / ${planningAssignment.providerProfile.modelId}`
            : "δ����"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          ״̬��{planningStatus(identity, planningAssignment, planning, planInfo)}
        </p>
        <button
          onClick={() => onGenerate({ force: hasPlans })}
          disabled={planning || !planningAssignment?.providerProfile || !identity}
          className="mt-3 flex w-full items-center justify-center gap-2 bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {planning ? <FaSpinner className="animate-spin" /> : <FaLightbulb />}
          {hasPlans ? "�������� 5 �Ų߻�" : "���� 5 ����ͼ�߻�"}
        </button>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">����ͼƬ����</h2>
        <p className="mt-2 text-sm text-zinc-500">
          ��ǰͼƬģ�ͣ�
          {generationAssignment?.providerProfile
            ? `${generationAssignment.providerProfile.name} / ${generationAssignment.providerProfile.modelId}`
            : "δ����"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          ״̬��{generationAssignment?.providerProfile ? (generatingImage ? "��������" : "׼������") : "�ȴ�����ͼƬģ��"}
        </p>
      </section>
    </div>
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
          <h1 className="truncate text-xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{project.referenceImages.length}/14</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {uploading ? <FaSpinner className="animate-spin" /> : <FaUpload />}
          �ϴ��ο�ͼ
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => onUpload(Array.from(event.target.files || []))}
      />

      {project.referenceImages.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-[320px] w-full flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        >
          <FaImage className="mb-3 text-3xl" />
          <span className="text-sm font-semibold">������Ʒ�ο�ͼ</span>
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
                  ����ʶ��
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
                  ��������
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
                    ��ͼ
                  </button>
                  <button
                    onClick={() => onDelete(image.id)}
                    className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300"
                  >
                    <FaTrash />
                    ɾ��
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {selectedCount > 8 && (
        <p className="mt-3 text-sm text-red-300">����ʶ��ͼƬ���� 8 ��</p>
      )}
      {generationReferenceCount > 4 && (
        <p className="mt-3 text-sm text-red-300">�������ɲο�ͼ���� 4 ��</p>
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
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">5 ����ͼ�߻�</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {plans.length}/5 {plans.some((plan) => plan.isStale) ? "�����ܹ���" : ""}
          </p>
        </div>
        <button
          onClick={() => onGenerate({ force: plans.length === 5 })}
          disabled={planning}
          className="flex items-center gap-2 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {planning ? <FaSpinner className="animate-spin" /> : <FaLightbulb />}
          {plans.length === 5 ? "��������" : "���� 5 ��"}
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
              className={`min-h-20 border px-3 py-2 text-left text-sm ${
                active
                  ? "border-emerald-500 bg-emerald-950/30 text-emerald-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
              }`}
            >
              <p className="font-semibold">{tab.label}</p>
              <p className="mt-1">{plan ? plan.status : "δ����"}</p>
              {planSummary && (
                <p className="mt-1">
                  ��ѡ {planSummary.candidateCount} �� {planSummary.hasPreferred ? "����ѡ" : "δ��ѡ"}
                </p>
              )}
              {planSummary?.processingRun && <p className="mt-1 text-sky-300">������</p>}
              {planSummary?.failedRunCount > 0 && (
                <p className="mt-1 text-red-300">ʧ�� {planSummary.failedRunCount}</p>
              )}
              {plan?.isManuallyEdited && <p className="mt-1 text-amber-300">�ֶ��޸�</p>}
              {plan?.isStale && <p className="mt-1 text-red-300">���ܹ���</p>}
            </button>
          );
        })}
      </div>

      {!selectedPlan ? (
        <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center text-sm text-zinc-500">
          ��δ���ɲ߻�
        </div>
      ) : (
        <form onSubmit={onSavePlan} className="grid gap-3 lg:grid-cols-2">
          <Field label="��������">
            <input
              value={planForm.coreSellingPoint}
              onChange={(event) => onUpdatePlanForm({ coreSellingPoint: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="������">
            <input
              value={planForm.mainTitle}
              onChange={(event) => onUpdatePlanForm({ mainTitle: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="������">
            <input
              value={planForm.subTitle}
              onChange={(event) => onUpdatePlanForm({ subTitle: event.target.value })}
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="����">
            <textarea
              value={planForm.scene}
              onChange={(event) => onUpdatePlanForm({ scene: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="��ͼ">
            <textarea
              value={planForm.composition}
              onChange={(event) => onUpdatePlanForm({ composition: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="����Ҫ�㣨���У�">
            <textarea
              value={planForm.keyNotes}
              onChange={(event) => onUpdatePlanForm({ keyNotes: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="���뱣�֣����У�">
            <textarea
              value={planForm.mustKeep}
              onChange={(event) => onUpdatePlanForm({ mustKeep: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="��ֹ�ı䣨���У�">
            <textarea
              value={planForm.avoid}
              onChange={(event) => onUpdatePlanForm({ avoid: event.target.value })}
              className="h-24 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
            />
          </Field>
          <Field label="������ʾ��">
            <textarea
              value={planForm.finalPrompt}
              onChange={(event) => onUpdatePlanForm({ finalPrompt: event.target.value })}
              className="h-48 w-full resize-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none lg:col-span-2"
            />
          </Field>
          <div className="lg:col-span-2">
            {planDirty && <p className="mb-2 text-sm text-amber-300">��δ�����޸�</p>}
            <button
              disabled={savingPlan}
              className="flex w-full items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
	            >
	              {savingPlan ? <FaSpinner className="animate-spin" /> : <FaSave />}
	              ���浱ǰ�߻�
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
    .map((plan) => `ͼ${plan.planIndex} ${planTaskLabel(plan.taskType)}`)
    .join("��");

  return (
    <div className="mb-4 grid gap-3 border border-zinc-800 bg-zinc-950 p-3 text-sm md:grid-cols-[1fr_1fr_auto]">
      <Info label="��ͼ����" value={`${summary?.generatedPlanCount || 0}/5`} />
      <Info label="��ѡͼ" value={`${summary?.preferredCount || 0}/5`} />
      <div className="flex min-w-0 flex-col gap-2">
        <button
          type="button"
          onClick={onDownloadPreferredZip}
          disabled={!summary?.zipReady}
          className="flex items-center justify-center gap-2 border border-emerald-800 px-3 py-2 font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600"
        >
          <FaDownload />
          ����������ѡͼ
        </button>
        {!summary?.zipReady && missingText && (
          <p className="truncate text-zinc-500">��ȱ��{missingText}</p>
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
}) {
  const provider = generationAssignment?.providerProfile;
  const latestRun = generationInfo?.latestRun;
  const latestImage = generationInfo?.latestImage;
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
            ����ͼƬ����
          </h3>
          <p className="mt-1 text-sm text-zinc-500">��ǰ�߻���ѡ {candidateInfo?.stats?.candidateCount || 0} ��</p>
        </div>
        <span className="border border-zinc-800 px-2 py-1 text-[13px] text-zinc-400">
          {generationStatus(identity, selectedPlan, provider, latestRun)}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="ͼƬģ��" value={provider ? `${provider.name} / ${provider.modelId}` : "δ����"} />
        <Info label="Э��" value={formatProtocol(provider?.protocol || "δ����")} />
        <Info label="�ο�ͼЭ��" value={provider?.supportsReferenceImages ? "��ʵ����" : "δ֧��"} />
        <Info label="����" value={project.aspectRatio || "1:1"} />
        <Info label="�ο�ͼ" value={`${generationReferenceCount}/4`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
        <Field label="�ֱ���">
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
          className="flex items-center justify-center gap-2 bg-sky-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {generatingImage ? <FaSpinner className="animate-spin" /> : <FaImage />}
          ���ɵ�ǰͼƬ
        </button>
        <button
          type="button"
          onClick={() => onGenerateImage({ force: true })}
          disabled={!canGenerate || !latestImage}
          className="border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
        >
          ǿ����������
        </button>
      </div>

      {latestRun?.status === "processing" && latestRun.mode === "async" && (
        <button
          type="button"
          onClick={onCheckGeneration}
          disabled={generatingImage}
          className="mt-3 w-full border border-sky-900 px-4 py-2.5 text-sm font-semibold text-sky-200 hover:border-sky-700"
        >
          ����첽����״̬
        </button>
      )}

      {latestImage ? (
        <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
          <div className="relative aspect-square bg-black">
            <Image
              src={latestImage.url}
              alt="Generated ecommerce result"
              fill
              sizes="(max-width: 1024px) 100vw, 640px"
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <Info label="״̬" value={formatRunStatus(latestRun?.status || "completed")} />
            <Info label="ģ��" value={latestRun?.model || "δ֪"} />
            <Info label="����ʱ��" value={formatDate(latestImage.createdAt)} />
            <Info label="�ߴ�" value={latestImage.width ? `${latestImage.width}x${latestImage.height}` : "δ֪"} />
            <Info label="��С" value={`${Math.round((latestImage.byteSize || 0) / 1024)} KB`} />
            <Info label="��Դ" value={latestImage.sourceType || "provider"} />
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
          ��ǰ�߻���δ����ͼƬ
        </div>
      )}

      <CandidateHistory
        candidateInfo={candidateInfo}
        onSetPreferredCandidate={onSetPreferredCandidate}
        onDeleteCandidate={onDeleteCandidate}
        onDownloadCandidate={onDownloadCandidate}
      />
    </div>
  );
}

function CandidateHistory({
  candidateInfo,
  onSetPreferredCandidate,
  onDeleteCandidate,
  onDownloadCandidate,
}) {
  const candidates = candidateInfo?.items || [];
  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
          ��ѡͼ��ʷ
        </h3>
        <span className="border border-zinc-800 px-2 py-1 text-[13px] text-zinc-400">
          {candidateInfo?.stats?.candidateCount || 0} ��
        </span>
      </div>

      {!candidates.length ? (
        <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
          ���޺�ѡͼ
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="border border-zinc-800 bg-zinc-950 p-3">
              <div className="relative aspect-square bg-black">
                <Image
                  src={candidate.url}
              alt={`��ѡͼ ${candidate.candidateNumber}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-contain"
                  unoptimized
                />
                <div className="absolute left-2 top-2 flex gap-2">
                  <span className="bg-zinc-950/90 px-2 py-1 text-[13px] font-semibold text-zinc-100">
                    ��ѡ {candidate.candidateNumber}
                  </span>
                  {candidate.isPreferred && (
                    <span className="bg-emerald-500 px-2 py-1 text-[13px] font-semibold text-zinc-950">
                      ��ѡ
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Info label="����ʱ��" value={formatDate(candidate.createdAt)} />
                <Info label="״̬" value={formatRunStatus(candidate.run?.status || "completed")} />
                <Info label="������" value={candidate.run?.provider || "δ֪"} />
                <Info label="ģ��" value={candidate.run?.model || "δ֪"} />
                <Info label="�ӿ�Э��" value={formatProtocol(candidate.run?.protocol || "δ֪")} />
                <Info label="�ߴ�" value={candidate.width ? `${candidate.width}x${candidate.height}` : "δ֪"} />
                <Info label="��С" value={formatBytes(candidate.byteSize)} />
                <Info label="�����Ƿ����" value={candidate.run?.usedStaleInput ? "��" : "��"} />
                <Info label="ǿ�ư汾" value={candidate.isForcedVersion ? "��" : "��"} />
                <Info label="�°汾" value={candidate.isNewVersion ? "��" : "��"} />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => onDownloadCandidate(candidate)}
                  className="flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-white"
                >
                  <FaDownload />
                  ����
                </button>
                <button
                  type="button"
                  onClick={() => onSetPreferredCandidate(candidate)}
                  className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold ${
                    candidate.isPreferred
                      ? "border border-emerald-700 text-emerald-200 hover:border-emerald-500"
                      : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  }`}
                >
                  <FaStar />
                  {candidate.isPreferred ? "ȡ����ѡ" : "��Ϊ��ѡ"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCandidate(candidate)}
                  disabled={candidate.isPreferred}
                  className="flex items-center justify-center gap-2 border border-red-900 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-600 disabled:border-zinc-800 disabled:text-zinc-600"
                >
                  <FaTrash />
                  ɾ��
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IdentitySection({ identity, identityForm, savingIdentity, onChange, onSave }) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">��Ʒ����֤ժҪ</h2>
        <span
          className={`border px-2 py-1 text-[13px] font-semibold ${
            identity?.isStale
              ? "border-amber-900 text-amber-300"
              : identity
                ? "border-emerald-900 text-emerald-300"
                : "border-zinc-800 text-zinc-500"
          }`}
        >
          {identity?.isStale ? "���ܹ���" : identity ? "��Ч" : "δʶ��"}
        </span>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Info label="��Ʒ����" value={identity?.productName || "δ��д"} />
        <Info label="��Ŀ" value={identity?.category || "δ��д"} />
        <Info label="��ɫ" value={identity?.color || "δ��д"} />
        <Info label="����" value={identity?.material || "δ��д"} />
        <Info label="�ṹ" value={identity?.structure || "δ��д"} />
        <Info label="��������" value={`${identity?.sellingPoints?.length || 0} ��`} />
      </div>

      <form onSubmit={onSave} className="mt-5 grid gap-3 lg:grid-cols-2">
        {[
          ["productName", "��Ʒ����", "input"],
          ["category", "��Ŀ", "input"],
          ["color", "��ɫ", "input"],
          ["material", "����", "input"],
          ["structure", "�ṹ", "textarea"],
          ["primaryReferenceDescription", "���ο�ͼ����", "textarea"],
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
          ["visibleFunctions", "�ɼ�����"],
          ["sellingPoints", "��������"],
          ["targetUsers", "Ŀ���û�"],
          ["usageScenarios", "ʹ�ó���"],
          ["mustKeep", "���뱣��"],
          ["avoidChanges", "��ֹ�ı�"],
        ].map(([field, label]) => (
          <Field key={field} label={`${label}�����У�`}>
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
            �����Ʒ����֤
          </button>
        </div>
      </form>
    </section>
  );
}

function analysisStatus(identity, visionAssignment, analyzing) {
  if (analyzing) return "����ʶ����Ʒ";
  if (!visionAssignment?.providerProfile) return "�ȴ������Ӿ�ģ��";
  if (!identity) return "δʶ��";
  if (identity.isStale) return "��Ʒ����֤���ܹ���";
  return "ʶ��ɹ�";
}

function planningStatus(identity, planningAssignment, planning, planInfo) {
  if (planning) return "�������� 5 �Ų߻�";
  if (!identity) return "�ȴ���Ʒ����֤";
  if (identity.isStale) return "��Ʒ����֤�ѹ���";
  if (!planningAssignment?.providerProfile) return "�ȴ����ò߻�ģ��";
  if (planInfo?.plans?.length === 5 && planInfo?.hasStalePlans) return "�߻������ѹ���";
  if (planInfo?.plans?.length === 5) return "���ɳɹ�";
  return "δ����";
}

function generationStatus(identity, selectedPlan, provider, latestRun) {
  if (!identity) return "�ȴ���Ʒ����֤";
  if (identity.isStale) return "��Ʒ����֤�ѹ���";
  if (!selectedPlan) return "�ȴ���ͼ�߻�";
  if (selectedPlan.isStale) return "�߻��ѹ���";
  if (!provider) return "�ȴ�����ͼƬģ��";
  if (!provider.supportsReferenceImages) return "�ο�ͼЭ��δ֧��";
  if (latestRun?.status === "processing") return "���ɴ�����";
  if (latestRun?.status === "completed") return "���ɳɹ�";
  if (latestRun?.status === "failed") return "����ʧ��";
  return "׼������";
}

function formatDate(value) {
  if (!value) return "δ֪";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "δ֪";
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function formatProtocol(protocol) {
  return protocol === "generic-async-image" ? "generic-async-image��Լ��Э�飩" : protocol;
}

function formatRunStatus(status) {
  if (status === "processing") return "������";
  if (status === "completed") return "�����";
  if (status === "failed") return "ʧ��";
  if (status === "pending") return "�ȴ���";
  return status || "δ֪";
}

function planTaskLabel(taskType) {
  const tab = PLAN_TABS.find((item) => item.taskType === taskType);
  return tab?.label.replace(/^ͼ\d+\s*/, "") || taskType || "δ����";
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
      <span className="mb-2 block text-[13px] font-semibold uppercase tracking-widest text-zinc-500">
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
      <dd className="mt-1 truncate font-semibold text-zinc-200">{value}</dd>
    </div>
  );
}
