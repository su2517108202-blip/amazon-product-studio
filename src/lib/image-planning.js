import crypto from "crypto";
import { parseStoredArray, stripJsonMarkdown } from "@/lib/product-identity";

export const PLAN_TASKS = [
  { index: 1, taskType: "hero", label: "点击首图" },
  { index: 2, taskType: "structure", label: "核心结构" },
  { index: 3, taskType: "function", label: "核心功能" },
  { index: 4, taskType: "scenario", label: "使用场景" },
  { index: 5, taskType: "detail", label: "细节理由" },
];

const TASK_BY_INDEX = new Map(PLAN_TASKS.map((task) => [task.index, task]));
const STRING_FIELDS = [
  "coreSellingPoint",
  "scene",
  "composition",
  "mainTitle",
  "subTitle",
  "finalPrompt",
];
const ARRAY_FIELDS = ["keyNotes", "mustKeep", "avoid"];

function cleanText(value, maxLength = 1200) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function containsMarkup(value) {
  return typeof value === "string" && /<script[\s\S]*?>|<\/script>|<[^>]+>/i.test(value);
}

function assertNoMarkup(value) {
  if (containsMarkup(value)) {
    const error = new Error("策划响应不能包含 HTML 或脚本");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }
}

function cleanArray(value, maxItems = 10, { rejectMarkup = false } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];

  for (const item of value) {
    if (rejectMarkup) assertNoMarkup(item);
    const cleaned = cleanText(item, 220);
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      output.push(cleaned);
    }
    if (output.length >= maxItems) break;
  }

  return output;
}

export function parsePlanningJson(value) {
  const cleaned = stripJsonMarkdown(value);
  try {
    const parsed = typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.plans)) return parsed.plans;
  } catch {
    const match = typeof cleaned === "string" ? cleaned.match(/\[[\s\S]*\]/) : null;
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through to the shared error below.
      }
    }
  }

  const error = new Error("模型返回的策划 JSON 无法解析");
  error.code = "INVALID_MODEL_RESPONSE";
  throw error;
}

export function sanitizeImagePlans(input) {
  if (!Array.isArray(input) || input.length !== 5) {
    const error = new Error("模型必须一次返回 5 条策划");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }

  const seenIndexes = new Set();
  const plans = input
    .map((item) => {
      const index = Number(item?.index);
      if (seenIndexes.has(index)) {
        const error = new Error("策划 index 必须为 1-5 且不能重复");
        error.code = "INVALID_MODEL_RESPONSE";
        throw error;
      }
      seenIndexes.add(index);
      return sanitizeOneImagePlan(item, { rejectMarkup: true });
    })
    .sort((a, b) => a.index - b.index);

  for (const task of PLAN_TASKS) {
    if (plans[task.index - 1]?.index !== task.index) {
      const error = new Error("策划 index 不完整");
      error.code = "INVALID_MODEL_RESPONSE";
      throw error;
    }
  }

  return plans;
}

export function sanitizeEditableImagePlan(input, currentPlan) {
  const base = imagePlanToResponse(currentPlan);
  const draft = {
    index: base.planIndex,
    taskType: base.taskType,
    coreSellingPoint: input.coreSellingPoint ?? base.coreSellingPoint,
    scene: input.scene ?? base.scene,
    composition: input.composition ?? base.composition,
    mainTitle: input.mainTitle ?? base.mainTitle,
    subTitle: input.subTitle ?? base.subTitle,
    keyNotes: input.keyNotes ?? base.keyNotes,
    mustKeep: input.mustKeep ?? base.mustKeep,
    avoid: input.avoid ?? base.avoid,
    finalPrompt: input.finalPrompt ?? base.finalPrompt,
  };

  return sanitizeOneImagePlan(draft);
}

function sanitizeOneImagePlan(item, { rejectMarkup = false } = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    const error = new Error("策划项不是有效对象");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }

  const index = Number(item.index);
  const fixedTask = TASK_BY_INDEX.get(index);
  if (!fixedTask) {
    const error = new Error("策划 index 必须为 1-5");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }

  const taskType = cleanText(item.taskType, 40);
  if (taskType !== fixedTask.taskType) {
    const error = new Error("策划 taskType 与固定分工不一致");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }

  const plan = {
    index,
    taskType,
    keyNotes: cleanArray(item.keyNotes, 4, { rejectMarkup }),
    mustKeep: cleanArray(item.mustKeep, 12, { rejectMarkup }),
    avoid: cleanArray(item.avoid, 14, { rejectMarkup }),
  };

  for (const field of STRING_FIELDS) {
    if (rejectMarkup) assertNoMarkup(item[field]);
    const limit = field === "finalPrompt" ? 4000 : field === "mainTitle" ? 28 : 800;
    plan[field] = cleanText(item[field], limit);
  }

  for (const field of [
    "coreSellingPoint",
    "scene",
    "composition",
    "mainTitle",
    "finalPrompt",
  ]) {
    if (!plan[field]) {
      const error = new Error(`策划缺少必填字段 ${field}`);
      error.code = "INVALID_MODEL_RESPONSE";
      throw error;
    }
  }

  return plan;
}

export function imagePlanToDbData(plan, meta = {}) {
  return {
    planIndex: plan.index,
    taskType: plan.taskType,
    coreSellingPoint: plan.coreSellingPoint,
    scene: plan.scene,
    composition: plan.composition,
    mainTitle: plan.mainTitle || null,
    subTitle: plan.subTitle || null,
    keyNotesJson: JSON.stringify(plan.keyNotes || []),
    mustKeepJson: JSON.stringify(plan.mustKeep || []),
    avoidJson: JSON.stringify(plan.avoid || []),
    finalPrompt: plan.finalPrompt,
    status: meta.status || "ready",
    isManuallyEdited: Boolean(meta.isManuallyEdited),
    isStale: Boolean(meta.isStale),
    inputFingerprint: meta.inputFingerprint || null,
    sourceProvider: meta.sourceProvider || null,
    sourceModel: meta.sourceModel || null,
    sourceProfileId: meta.sourceProfileId || null,
  };
}

export function imagePlanToResponse(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    projectId: plan.projectId,
    index: plan.planIndex,
    planIndex: plan.planIndex,
    taskType: plan.taskType,
    taskLabel: TASK_BY_INDEX.get(plan.planIndex)?.label || plan.taskType,
    coreSellingPoint: plan.coreSellingPoint || "",
    scene: plan.scene || "",
    composition: plan.composition || "",
    mainTitle: plan.mainTitle || "",
    subTitle: plan.subTitle || "",
    keyNotes: parseStoredArray(plan.keyNotesJson),
    mustKeep: parseStoredArray(plan.mustKeepJson),
    avoid: parseStoredArray(plan.avoidJson),
    finalPrompt: plan.finalPrompt || "",
    status: plan.status,
    isManuallyEdited: plan.isManuallyEdited,
    isStale: plan.isStale,
    inputFingerprint: plan.inputFingerprint || "",
    sourceProvider: plan.sourceProvider || "",
    sourceModel: plan.sourceModel || "",
    sourceProfileId: plan.sourceProfileId || "",
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export function planningRunToResponse(run) {
  return {
    id: run.id,
    projectId: run.projectId,
    providerProfileId: run.providerProfileId || "",
    provider: run.provider || "",
    model: run.model || "",
    status: run.status,
    inputFingerprint: run.inputFingerprint || "",
    errorCode: run.errorCode || "",
    errorMessage: run.errorMessage || "",
    durationMs: run.durationMs,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

export function calculatePlanningFingerprint({ project, identity, providerProfile }) {
  const payload = {
    projectId: project.id,
    platform: project.platform || "",
    aspectRatio: project.aspectRatio || "",
    projectName: project.name || "",
    productName: project.productName || "",
    notes: project.notes || "",
    identityUpdatedAt: identity.updatedAt?.toISOString?.() || String(identity.updatedAt || ""),
    identityIsStale: Boolean(identity.isStale),
    identity: {
      productName: identity.productName || "",
      category: identity.category || "",
      color: identity.color || "",
      material: identity.material || "",
      structure: identity.structure || "",
      visibleFunctionsJson: identity.visibleFunctionsJson || "[]",
      sellingPointsJson: identity.sellingPointsJson || "[]",
      targetUsersJson: identity.targetUsersJson || "[]",
      usageScenariosJson: identity.usageScenariosJson || "[]",
      mustKeepJson: identity.mustKeepJson || "[]",
      avoidChangesJson: identity.avoidChangesJson || "[]",
      primaryReferenceDescription: identity.primaryReferenceDescription || "",
    },
    providerProfileId: providerProfile.id,
    modelId: providerProfile.modelId,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildImagePlanningInput(project, identity, referenceImages = []) {
  const primary = referenceImages.find((image) => image.isPrimary);
  return {
    project: {
      id: project.id,
      name: project.name || "",
      productName: project.productName || "",
      platform: project.platform || "",
      aspectRatio: project.aspectRatio || "1:1",
      notes: project.notes || "",
    },
    identity: {
      productName: identity.productName || "",
      category: identity.category || "",
      color: identity.color || "",
      material: identity.material || "",
      structure: identity.structure || "",
      visibleFunctions: parseStoredArray(identity.visibleFunctionsJson),
      sellingPoints: parseStoredArray(identity.sellingPointsJson),
      targetUsers: parseStoredArray(identity.targetUsersJson),
      usageScenarios: parseStoredArray(identity.usageScenariosJson),
      mustKeep: parseStoredArray(identity.mustKeepJson),
      avoidChanges: parseStoredArray(identity.avoidChangesJson),
      primaryReferenceDescription: identity.primaryReferenceDescription || "",
      isStale: identity.isStale,
    },
    referenceSummary: {
      count: referenceImages.length,
      primaryRole: primary?.imageRole || "",
      roles: referenceImages.map((image) => image.imageRole).filter(Boolean),
      primaryReferenceDescription: identity.primaryReferenceDescription || "",
    },
  };
}

export const IMAGE_PLANNING_PROMPT = `你是严谨的电商主图策划，不是自由艺术创作者。只能基于输入的产品身份证和项目资料策划，不能编造尺寸、认证、成分、承重、低价、夸张广告词或不存在的配件。

请一次返回 5 张不同电商主图策划，必须是严格 JSON 数组，不要 Markdown，不要解释，不要 JSON 之外内容。

固定分工：
1 hero 点击首图：第一眼看清卖什么，商品主体最大，一个核心卖点，不拼图。
2 structure 核心结构：展示最重要结构或外观构成，不编造剖面。
3 function 核心功能：展示已确认的关键可见功能，不夸大性能。
4 scenario 使用场景：符合商品类别的真实使用场景，商品仍是主体。
5 detail 细节理由：展示一个细节或信任理由，不做九宫格，不堆参数。

每项字段：
index, taskType, coreSellingPoint, scene, composition, mainTitle, subTitle, keyNotes, mustKeep, avoid, finalPrompt。

taskType 必须依次为 hero, structure, function, scenario, detail。mainTitle 用中文，尽量不超过 14 个汉字。subTitle 不超过 22 个汉字，可为空。keyNotes 最多 4 条。五张图的卖点、场景、构图不能重复，不能只是换背景。

mustKeep 必须继承产品身份证 mustKeep。avoid 必须继承 avoidChanges，并加入不改变商品颜色、不改变结构、不增加不存在配件、不减少真实部件、不修改品牌或 Logo、不做拼图、不做九宫格。

finalPrompt 必须包含商品主体、当前图片任务、核心卖点、场景、构图、产品一致性、必须保持、禁止改变、目标比例、电商平台风格、文字排版要求，并明确不允许拼图和合集。`;
