const STRING_FIELDS = [
  "productName",
  "category",
  "color",
  "material",
  "structure",
  "primaryReferenceDescription",
];

const ARRAY_FIELDS = [
  "visibleFunctions",
  "sellingPoints",
  "targetUsers",
  "usageScenarios",
  "mustKeep",
  "avoidChanges",
];

const EMPTY_IDENTITY = {
  productName: "",
  category: "",
  color: "",
  material: "",
  structure: "",
  visibleFunctions: [],
  sellingPoints: [],
  targetUsers: [],
  usageScenarios: [],
  mustKeep: [],
  avoidChanges: [],
  primaryReferenceDescription: "",
};

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];

  for (const item of value) {
    const cleaned = cleanText(item, 160);
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      items.push(cleaned);
    }
    if (items.length >= 12) break;
  }

  return items;
}

function assertMostlyChineseIdentity(identity) {
  const text = [
    ...STRING_FIELDS.map((field) => identity[field]),
    ...ARRAY_FIELDS.flatMap((field) => identity[field]),
  ]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return;

  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (text.match(/[A-Za-z]{3,}/g) || []).filter(
    (word) => !["json", "api", "logo", "webp", "jpg", "png"].includes(word.toLowerCase()),
  ).length;

  if (englishWords >= 10 && cjkCount < 12) {
    const error = new Error("商品识别结果必须使用简体中文");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }
}

export function stripJsonMarkdown(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseModelJson(value) {
  const cleaned = stripJsonMarkdown(value);
  try {
    return typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;
  } catch {
    const error = new Error("模型返回的 JSON 无法解析");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }
}

export function sanitizeProductIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("模型返回的产品身份证不是有效对象");
    error.code = "INVALID_MODEL_RESPONSE";
    throw error;
  }

  const allowed = new Set([...STRING_FIELDS, ...ARRAY_FIELDS]);
  const output = { ...EMPTY_IDENTITY };

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) continue;
    if (STRING_FIELDS.includes(key)) {
      output[key] = cleanText(input[key], key === "structure" ? 1000 : 500);
    } else {
      output[key] = cleanArray(input[key]);
    }
  }

  assertMostlyChineseIdentity(output);
  return output;
}

export function identityToResponse(identity) {
  if (!identity) return null;
  return {
    id: identity.id,
    projectId: identity.projectId,
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
    sourceProvider: identity.sourceProvider || "",
    sourceModel: identity.sourceModel || "",
    sourceProfileId: identity.sourceProfileId || "",
    inputFingerprint: identity.inputFingerprint || "",
    isStale: identity.isStale,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

export function identityToDbData(identity) {
  const clean = sanitizeProductIdentity(identity);
  return {
    productName: clean.productName || null,
    category: clean.category || null,
    color: clean.color || null,
    material: clean.material || null,
    structure: clean.structure || null,
    visibleFunctionsJson: JSON.stringify(clean.visibleFunctions),
    sellingPointsJson: JSON.stringify(clean.sellingPoints),
    targetUsersJson: JSON.stringify(clean.targetUsers),
    usageScenariosJson: JSON.stringify(clean.usageScenarios),
    mustKeepJson: JSON.stringify(clean.mustKeep),
    avoidChangesJson: JSON.stringify(clean.avoidChanges),
    primaryReferenceDescription: clean.primaryReferenceDescription || null,
  };
}

export function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listToTextarea(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function textareaToList(value) {
  return cleanArray(String(value || "").split(/\r?\n/));
}
