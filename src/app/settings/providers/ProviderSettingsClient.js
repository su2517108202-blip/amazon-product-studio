"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaFolderOpen,
  FaPlug,
  FaPlus,
  FaRedo,
  FaSearch,
  FaSpinner,
  FaTrash,
  FaWrench,
} from "react-icons/fa";
import {
  CAPABILITIES,
  IMAGE_GENERATION_PROTOCOLS,
  PROVIDER_DEFAULTS,
  inferProviderDraftSettings,
} from "@/lib/provider-profiles";
import {
  formatModelOptionLabel,
  modelSearchText,
  modelSupportsRole,
  resolveEffectiveModelCapability,
  sortModelsForRole,
} from "@/lib/model-capabilities";

const EMPTY_FORM = {
  id: "",
  name: "",
  provider: "openai",
  baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
  apiKey: "",
  modelId: "",
  protocol: PROVIDER_DEFAULTS.openai.protocol,
  capabilities: PROVIDER_DEFAULTS.openai.capabilities,
  timeoutMs: 30000,
  maxRetries: 0,
  enabled: true,
};
const SECTION_TABS = [
  { id: "service", label: "AI 服务" },
  { id: "roles", label: "模型分工" },
  { id: "storage", label: "本地存储" },
  { id: "advanced", label: "高级设置" },
];
const ROLE_ORDER = ["product_vision", "image_planning", "image_generation"];
const ROLE_LABELS = {
  product_vision: "商品识别用哪个模型",
  image_planning: "文案策划用哪个模型",
  image_generation: "图片生成用哪个模型",
};
const GEMINI_LEGACY_PRODUCT_VISION_MODELS = new Set(["gemini-2.5-flash"]);
const GEMINI_PRODUCT_VISION_REPLACEMENTS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

function normalizeModelDetails(payload) {
  const source = Array.isArray(payload?.modelDetails) && payload.modelDetails.length
    ? payload.modelDetails
    : (Array.isArray(payload?.models) ? payload.models : []);
  return source
    .map((item) => (typeof item === "string"
      ? resolveEffectiveModelCapability({ provider: payload?.provider || "", modelId: item })
      : item))
    .filter((item) => item?.modelId);
}

function normalizeModelIdForUi(modelId = "") {
  return String(modelId || "").trim().replace(/^models\//i, "").toLowerCase();
}

export default function ProviderSettingsClient() {
  const [activeSection, setActiveSection] = useState("service");
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [credentialKeyConfigured, setCredentialKeyConfigured] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [draftModels, setDraftModels] = useState([]);
  const [modelSearch, setModelSearch] = useState("");
  const [manualModel, setManualModel] = useState(false);
  const [lockedRoles, setLockedRoles] = useState({});
  const [discoveredModels, setDiscoveredModels] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storage, setStorage] = useState({ isLocalMode: false, storageRoot: "", defaultStorageRoot: "" });
  const [storagePath, setStoragePath] = useState("D:\\灵图素材库");
  const [migrationPreview, setMigrationPreview] = useState(null);

  const loadData = useCallback(async () => {
    const [profilesRes, assignmentsRes, storageRes] = await Promise.all([
      fetch("/api/provider-profiles"),
      fetch("/api/model-role-assignments"),
      fetch("/api/local-settings/storage"),
    ]);
    const profilesData = await profilesRes.json();
    const assignmentsData = await assignmentsRes.json();
    const storageData = await storageRes.json();
    if (!profilesRes.ok) throw new Error(profilesData.error || "无法读取服务商配置");
    if (!assignmentsRes.ok) throw new Error(assignmentsData.error || "无法读取角色绑定");
    setProfiles(profilesData.profiles || []);
    setCredentialKeyConfigured(profilesData.credentialKeyConfigured);
    setAssignments(assignmentsData || []);
    setStorage(storageData);
    setStoragePath(storageData.storageRoot || "D:\\灵图素材库");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData().catch((err) => setError(err.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const section = new URLSearchParams(window.location.search).get("section");
      if (SECTION_TABS.some((tab) => tab.id === section)) {
        setActiveSection(section);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const assignmentMap = useMemo(
    () => Object.fromEntries(assignments.map((item) => [item.role, item])),
    [assignments],
  );

  const filteredModels = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase();
    if (!needle) return draftModels;
    return draftModels.filter((m) => modelSearchText(m).includes(needle));
  }, [draftModels, modelSearch]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateProvider(provider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setDraftModels([]);
    setModelSearch("");
    setManualModel(false);
    setForm((current) => ({
      ...current,
      provider,
      baseUrl: defaults.baseUrl,
      protocol: defaults.protocol,
      capabilities: defaults.capabilities,
      modelId: "",
      name: current.name || `${defaults.name} 配置`,
    }));
  }

  function applyModelSelection(modelId) {
    setForm((current) => {
      const inferred = inferProviderDraftSettings({
        provider: current.provider,
        modelId,
        protocol: current.protocol,
        capabilities: current.capabilities,
      });
      return { ...current, modelId, protocol: inferred.protocol, capabilities: inferred.capabilities };
    });
  }

  function toggleCapability(capability) {
    setForm((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capability)
        ? current.capabilities.filter((item) => item !== capability)
        : [...current.capabilities, capability],
    }));
  }

  function editProfile(profile) {
    setEditingId(profile.id);
    setDraftModels([]);
    setModelSearch("");
    setManualModel(false);
    setActiveSection("service");
    setForm({
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      baseUrl: profile.baseUrl || "",
      apiKey: "",
      modelId: profile.modelId,
      protocol: profile.protocol,
      capabilities: profile.capabilities,
      timeoutMs: profile.timeoutMs,
      maxRetries: profile.maxRetries,
      enabled: profile.enabled,
    });
  }

  function resetForm() {
    setEditingId("");
    setDraftModels([]);
    setModelSearch("");
    setManualModel(false);
    setForm({ ...EMPTY_FORM });
  }

  async function runJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || "操作失败");
    return data;
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const url = editingId ? `/api/provider-profiles/${editingId}` : "/api/provider-profiles";
      await runJson(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await loadData();
      resetForm();
      setMessage("配置已保存。可以继续新增服务商配置，或在模型分工里选择它。");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function discoverDraftModels() {
    setBusyAction("discover");
    setError("");
    setMessage("");
    try {
      const data = await runJson("/api/provider-models/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setDraftModels(normalizeModelDetails(data));
      setManualModel(false);
      setMessage(data.message || "模型列表已读取。");
    } catch (err) {
      setDraftModels([]);
      setMessage("");
      setError(err.message || "该接口不支持自动获取模型，请手动填写模型ID。");
    } finally {
      setBusyAction("");
    }
  }

  async function testDraftConnection() {
    setBusyAction("test-draft");
    setError("");
    setMessage("");
    try {
      const data = await runJson("/api/provider-models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setMessage(data.message || "连接测试完成。");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function testSavedProfile(profileId) {
    setBusyAction(`test-${profileId}`);
    setError("");
    setMessage("");
    try {
      const data = await runJson(`/api/provider-profiles/${profileId}/test`, { method: "POST" });
      setMessage(data.message || "连接成功。");
      await loadData();
    } catch (err) {
      setError(err.message);
      await loadData().catch(() => {});
    } finally {
      setBusyAction("");
    }
  }

  async function discoverSavedProfileModels(profileId) {
    setBusyAction(`discover-${profileId}`);
    setError("");
    try {
      const data = await runJson("/api/provider-models/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerProfileId: profileId }),
      });
      setDiscoveredModels((prev) => ({ ...prev, [profileId]: normalizeModelDetails(data) }));
      await loadData();
      setMessage(data.message || `已发现 ${data.count || 0} 个模型`);
    } catch (err) {
      setError(`模型发现失败: ${err.message}`);
    } finally {
      setBusyAction("");
    }
  }

  async function deleteProfile(profile) {
    const usedBy = assignments
      .filter((item) => item.providerProfileId === profile.id)
      .map((item) => ROLE_LABELS[item.role] || item.role);
    if (usedBy.length > 0) {
      window.alert(`该配置正在被以下角色使用，不能直接删除：${usedBy.join("、")}。请先清除或更换角色绑定。`);
      return;
    }
    if (!window.confirm(`确认删除配置「${profile.name}」吗？`)) return;
    setError("");
    setMessage("");
    try {
      await runJson(`/api/provider-profiles/${profile.id}`, { method: "DELETE" });
      await loadData();
      setMessage("配置已删除。");
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignRole(role, providerProfileId, modelId = "", isForced = true) {
    setError("");
    try {
      await runJson(`/api/model-role-assignments/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerProfileId, modelId: modelId || null, isUserForced: isForced }),
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearRole(role) {
    try {
      await runJson(`/api/model-role-assignments/${role}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleRoleLock(role) {
    setLockedRoles((current) => ({ ...current, [role]: !current[role] }));
  }

  async function recommendRoles() {
    setBusyAction("recommend-roles");
    setError("");
    setMessage("");
    try {
      let changed = 0;
      for (const role of ROLE_ORDER) {
        if (lockedRoles[role]) continue;
        const current = assignmentMap[role];
        if (current?.isUserForced) continue;
        const recommended = pickRecommendedModel(role, profiles, discoveredModels, current);
        if (
          recommended &&
          (recommended.providerProfileId !== current?.providerProfileId || recommended.modelId !== current?.modelId)
        ) {
          await runJson(`/api/model-role-assignments/${role}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerProfileId: recommended.providerProfileId,
              modelId: recommended.modelId,
              isUserForced: false,
            }),
          });
          changed += 1;
        }
      }
      await loadData();
      setMessage(changed > 0 ? `已推荐并更新 ${changed} 个角色。` : "当前角色绑定已是推荐状态。");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function storageAction(action, extra = {}) {
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const data = await runJson("/api/local-settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, storageRoot: storagePath, ...extra }),
      });
      if (data.storageRoot) {
        setStoragePath(data.storageRoot);
        setStorage((current) => ({ ...current, storageRoot: data.storageRoot }));
      }
      setMessage(data.message || "操作完成。");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function migrateStorage(confirm = false) {
    setBusyAction("migrate");
    setError("");
    setMessage("");
    try {
      const data = await runJson("/api/local-settings/storage/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageRoot: storagePath, create: true, confirm }),
      });
      if (data.requiresConfirmation) {
        setMigrationPreview(data);
        setMessage(`准备迁移 ${data.fileCount} 个文件，约 ${formatBytes(data.totalBytes)}。确认后会复制文件并保留旧目录。`);
      } else {
        setMigrationPreview(null);
        setMessage(data.message || "迁移完成。");
        await loadData();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  const serviceForm = (
    <form onSubmit={saveProfile} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">AI 服务</h1>
          <p className="mt-1 text-sm text-zinc-500">先填 Key，再获取模型，选好后保存为一个独立配置。</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
        >
          <FaPlus /> 新增服务商配置
        </button>
      </div>

      {!credentialKeyConfigured && (
        <div className="border border-amber-900/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          缺少 CREDENTIAL_ENCRYPTION_KEY，暂时无法安全保存 API Key。
        </div>
      )}

      <Field label="配置名称">
        <input
          value={form.name}
          onChange={(event) => patchForm({ name: event.target.value })}
          className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
          required
        />
      </Field>
      <Field label="服务商">
        <select
          value={form.provider}
          onChange={(event) => updateProvider(event.target.value)}
          className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
        >
          {Object.entries(PROVIDER_DEFAULTS).map(([id, item]) => (
            <option key={id} value={id}>{item.name}</option>
          ))}
        </select>
      </Field>
      <Field label="API Key">
        <input
          value={form.apiKey}
          onChange={(event) => patchForm({ apiKey: event.target.value })}
          className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
          placeholder={editingId ? "留空表示保留旧 Key" : "仅在本机加密保存"}
          type="password"
        />
      </Field>
      <Field label="选择模型">
        {manualModel ? (
          <input
            value={form.modelId}
            onChange={(event) => applyModelSelection(event.target.value)}
            className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
            placeholder="手动输入模型 ID"
            required
          />
        ) : (
          <select
            value={form.modelId}
            onChange={(event) => applyModelSelection(event.target.value)}
            className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
            required
          >
            <option value="">先点“获取模型”，或切换手动填写</option>
            {filteredModels.map((model) => (
              <option key={model.modelId} value={model.modelId}>{formatModelOptionLabel(model)}</option>
            ))}
            {form.modelId && !filteredModels.some((model) => model.modelId === form.modelId) && (
              <option value={form.modelId}>{form.modelId}</option>
            )}
          </select>
        )}
      </Field>
      {draftModels.length > 0 && !manualModel && (
        <div className="flex items-center gap-2">
          <FaSearch className="text-zinc-500" />
          <input
            value={modelSearch}
            onChange={(event) => setModelSearch(event.target.value)}
            className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
            placeholder="搜索模型"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={testDraftConnection}
          disabled={busyAction === "test-draft"}
          className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
        >
          {busyAction === "test-draft" ? <FaSpinner className="animate-spin" /> : <FaPlug />}测试连接
        </button>
        <button
          type="button"
          onClick={discoverDraftModels}
          disabled={busyAction === "discover"}
          className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
        >
          {busyAction === "discover" ? <FaSpinner className="animate-spin" /> : <FaRedo />}
          {draftModels.length ? "刷新模型" : "获取模型"}
        </button>
        <button
          type="button"
          onClick={() => setManualModel((value) => !value)}
          className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
        >
          高级：手动填写模型 ID
        </button>
        <button
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
        >
          {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
          {editingId ? "保存修改" : "保存配置"}
        </button>
      </div>
    </form>
  );

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <nav className="mb-5 grid gap-2 md:grid-cols-4" data-testid="settings-beginner-tabs">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              data-active={activeSection === tab.id ? "true" : "false"}
              className={`border px-4 py-3 text-sm font-semibold ${
                activeSection === tab.id
                  ? "border-violet-500 bg-violet-950/35 text-white"
                  : "border-zinc-800 bg-zinc-900/35 text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {(message || error) && (
          <div className={`mb-5 border px-3 py-2 text-sm ${error ? "border-red-900/60 bg-red-950/40 text-red-200" : "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"}`}>
            {error || message}
          </div>
        )}

        {activeSection === "service" && (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <section className="border border-zinc-800 bg-zinc-900/45 p-5">
              {serviceForm}
            </section>
            <section className="border border-zinc-800 bg-zinc-900/35 p-4">
              <h2 className="mb-4 text-sm font-semibold text-white">已保存配置</h2>
              {profiles.length === 0 ? (
                <p className="border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
                  还没有保存任何服务商配置。
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {profiles.map((profile) => {
                    const foundModels = discoveredModels[profile.id] || [];
                    return (
                      <article key={profile.id} className="border border-zinc-800 bg-zinc-950 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-white">{profile.name}</h3>
                            <p className="mt-1 truncate text-sm text-zinc-500">
                              {providerName(profile.provider)} / {profile.modelId}
                            </p>
                            <p className="mt-1 text-sm text-zinc-500">
                              密钥：{profile.maskedApiKey || "未保存"}
                            </p>
                          </div>
                          <span className={`border px-2 py-1 text-xs font-semibold ${profile.enabled ? "border-emerald-900 text-emerald-300" : "border-zinc-800 text-zinc-500"}`}>
                            {profile.enabled ? "启用" : "停用"}
                          </span>
                        </div>
                        {foundModels.length > 0 && (
                          <div className="mb-3 max-h-32 overflow-y-auto border border-zinc-800 bg-zinc-900/50 p-2">
                            <p className="mb-1 text-xs font-semibold text-zinc-600">已发现模型 ({foundModels.length})</p>
                            {foundModels.map((model) => (
                              <p key={model.modelId} className="truncate py-0.5 text-xs text-zinc-300">
                                {model.modelId}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => editProfile(profile)} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white">编辑</button>
                          <button onClick={() => testSavedProfile(profile.id)} disabled={busyAction === `test-${profile.id}`} className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">
                            {busyAction === `test-${profile.id}` ? <FaSpinner className="animate-spin" /> : <FaPlug />}测试
                          </button>
                          <button onClick={() => deleteProfile(profile)} className="inline-flex items-center justify-center border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300"><FaTrash /></button>
                          <button onClick={() => discoverSavedProfileModels(profile.id)} disabled={busyAction === `discover-${profile.id}`} className="col-span-3 inline-flex items-center justify-center gap-2 border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600">
                            {busyAction === `discover-${profile.id}` ? <FaSpinner className="animate-spin" /> : <FaRedo />}
                            {foundModels.length ? "刷新模型列表" : "获取模型列表"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeSection === "roles" && (
          <RoleBindingSection
            profiles={profiles}
            assignments={assignments}
            assignmentMap={assignmentMap}
            discoveredModels={discoveredModels}
            lockedRoles={lockedRoles}
            busyAction={busyAction}
            onRecommendRoles={recommendRoles}
            onToggleRoleLock={toggleRoleLock}
            onAssignRole={assignRole}
            onClearRole={clearRole}
          />
        )}

        {activeSection === "storage" && (
          <StorageSection
            storage={storage}
            storagePath={storagePath}
            migrationPreview={migrationPreview}
            busyAction={busyAction}
            onStoragePath={setStoragePath}
            onStorageAction={storageAction}
            onMigrateStorage={migrateStorage}
          />
        )}

        {activeSection === "advanced" && (
          <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="border border-zinc-800 bg-zinc-900/45 p-5">
              <h1 className="text-lg font-semibold text-white">高级设置</h1>
              <p className="mt-1 text-sm text-zinc-500">这里保留协议、地址、能力和超时参数，日常配置不用展开。</p>
              <div className="mt-5 space-y-4">
                <Field label="Base URL">
                  <input
                    value={form.baseUrl}
                    onChange={(event) => patchForm({ baseUrl: event.target.value })}
                    className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                    placeholder="https://api.example.com/v1"
                  />
                </Field>
                <Field label="协议">
                  <input
                    list="provider-protocol-options"
                    value={form.protocol}
                    onChange={(event) => patchForm({ protocol: event.target.value })}
                    className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  />
                  <datalist id="provider-protocol-options">
                    <option value="openai-compatible" />
                    {IMAGE_GENERATION_PROTOCOLS.map((protocol) => (
                      <option key={protocol} value={protocol} />
                    ))}
                  </datalist>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="超时 ms">
                    <input value={form.timeoutMs} onChange={(event) => patchForm({ timeoutMs: Number(event.target.value) })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" type="number" />
                  </Field>
                  <Field label="重试次数">
                    <input value={form.maxRetries} onChange={(event) => patchForm({ maxRetries: Number(event.target.value) })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" type="number" />
                  </Field>
                </div>
                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase text-zinc-500">模型能力</span>
                  <div className="grid grid-cols-2 gap-2">
                    {CAPABILITIES.map((capability) => (
                      <label key={capability} className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                        <input checked={form.capabilities.includes(capability)} onChange={() => toggleCapability(capability)} type="checkbox" />
                        {capability}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <input checked={form.enabled} onChange={(event) => patchForm({ enabled: event.target.checked })} type="checkbox" />
                  启用配置
                </label>
              </div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/35 p-5">
              <h2 className="text-sm font-semibold text-white">高级模型信息</h2>
              {draftModels.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">获取模型后，这里会显示接口返回的模型摘要。</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {draftModels.map((model) => (
                    <article key={model.modelId} className="border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
                      <p className="font-semibold text-zinc-200">{model.modelId}</p>
                      <p className="mt-1">{model.displayName || model.metadata?.displayName || "未提供显示名称"}</p>
                      <p className="mt-1">{(model.capabilities || []).join("、") || "能力未验证"}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function RoleBindingSection({
  profiles,
  assignments,
  assignmentMap,
  discoveredModels,
  lockedRoles,
  busyAction,
  onRecommendRoles,
  onToggleRoleLock,
  onAssignRole,
  onClearRole,
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">模型分工</h1>
          <p className="mt-1 text-sm text-zinc-500">三个角色互不影响，锁定后不会被一键推荐覆盖。</p>
        </div>
        <button
          type="button"
          onClick={onRecommendRoles}
          disabled={busyAction === "recommend-roles" || profiles.length === 0}
          data-testid="recommend-roles-button"
          className="inline-flex items-center gap-2 border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600"
        >
          {busyAction === "recommend-roles" ? <FaSpinner className="animate-spin" /> : <FaCheck />}一键推荐
        </button>
      </div>
      {profiles.length === 0 ? (
        <p className="border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          先在 AI 服务里保存一个模型配置。
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <RoleCard
              key={role}
              role={role}
              assignments={assignments}
              assignment={assignmentMap[role]}
              profiles={profiles}
              discoveredModels={discoveredModels}
              locked={Boolean(lockedRoles[role])}
              onToggleLock={() => onToggleRoleLock(role)}
              onAssignRole={onAssignRole}
              onClearRole={onClearRole}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleCard({
  role,
  assignment,
  profiles,
  discoveredModels,
  locked,
  onToggleLock,
  onAssignRole,
  onClearRole,
}) {
  const [profileDraftId, setProfileDraftId] = useState("");
  const selectedProfileId = profileDraftId === "__none__"
    ? ""
    : (profileDraftId || assignment?.providerProfileId || profiles[0]?.id || "");

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;
  const currentModelId = assignment?.modelId || assignment?.providerProfile?.modelId || "";
  const profileModels = selectedProfile
    ? buildRoleModelsForProfile(selectedProfile, discoveredModels, assignment, currentModelId, role)
    : [];
  const migration = productVisionMigrationForCurrentBinding({
    role,
    assignment,
    selectedProfile,
    profileModels,
    currentModelId,
  });
  const sortedModels = sortModelsForRole(
    role,
    profileModels.map((model) => applyClientUnavailableState(model, migration, currentModelId)),
    currentModelId,
  );
  const suitable = sortedModels.filter((model) => isSuitableForRole(role, model));
  const unsuitable = sortedModels.filter((model) => !isSuitableForRole(role, model));
  const modelSelectValue = assignment?.providerProfileId === selectedProfileId
    ? (assignment?.modelId || assignment?.providerProfile?.modelId || "")
    : "";

  function bindModel(profileId, modelId) {
    if (!profileId) return onClearRole(role);
    const model = profileModels.find((item) => item.modelId === modelId);
    if (model && !isSuitableForRole(role, model)) {
      if (!window.confirm("该模型能力尚未验证或与当前角色不匹配，强制绑定可能导致功能异常。确认继续？")) return;
    }
    onAssignRole(role, profileId, modelId || undefined, true);
  }

  function applyMigration() {
    if (!migration) return;
    onAssignRole(role, selectedProfileId, migration.modelId, true);
  }

  return (
    <article className="border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{ROLE_LABELS[role]}</h3>
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <input data-testid={`role-lock-${role}`} checked={locked} onChange={onToggleLock} type="checkbox" />锁定
        </label>
      </div>
      <p className="mt-2 min-h-12 text-sm text-zinc-500">
        {assignment?.providerProfile
          ? `${providerName(assignment.providerProfile.provider)} / ${assignment.providerProfile.name} / ${currentModelId}${assignment.isUserForced ? "（手动选择）" : "（推荐）"}`
          : "未绑定"}
      </p>

      {migration && (
        <div className="mb-3 border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-100">
          <p className="font-semibold">当前商品识别模型已不可用</p>
          <p className="mt-1">推荐切换到：{migration.displayName}</p>
          {locked && (
            <p className="mt-1 text-xs text-amber-200">
              当前角色已锁定，不会后台静默覆盖；点击按钮后只切换商品识别角色。
            </p>
          )}
          <button
            type="button"
            onClick={applyMigration}
            data-testid="product-vision-migrate-model-button"
            className="mt-3 inline-flex items-center gap-2 bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400"
          >
            <FaCheck />
            立即切换
          </button>
        </div>
      )}

      <Field label="使用哪个 AI 配置">
        <select
          value={selectedProfileId}
          onChange={(event) => {
            const profileId = event.target.value;
            setProfileDraftId(profileId || "__none__");
            if (!profileId) {
              onClearRole(role);
              return;
            }
            const profile = profiles.find((item) => item.id === profileId);
            if (profile?.modelId) bindModel(profileId, profile.modelId);
          }}
          className="w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm outline-none"
        >
          <option value="">清除绑定</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {providerName(profile.provider)} / {profile.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="mt-3">
        <Field label="使用该配置下的哪个模型">
          <select
            value={modelSelectValue}
            onChange={(event) => bindModel(selectedProfileId, event.target.value)}
            disabled={!selectedProfile}
            className="w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm outline-none disabled:text-zinc-600"
          >
            <option value="">清除绑定</option>
            {suitable.length > 0 && (
              <optgroup label="可用模型">
                {suitable.map((model) => (
                  <option key={`${model.providerProfileId}::${model.modelId}`} value={model.modelId}>
                    {formatModelOptionLabel(model)}
                  </option>
                ))}
              </optgroup>
            )}
            {unsuitable.length > 0 && (
              <optgroup label="不可用或未验证模型">
                {unsuitable.map((model) => (
                  <option key={`${model.providerProfileId}::${model.modelId}`} value={model.modelId}>
                    {formatModelOptionLabel(model)} [{friendlyRoleReason(role, model)}]
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      </div>

      {unsuitable.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-600">查看不可用原因</summary>
          <div className="mt-2 space-y-1">
            {unsuitable.map((model) => (
              <p key={`${model.providerProfileId}-${model.modelId}`} className="text-xs text-zinc-600">
                {formatModelOptionLabel(model)}：{friendlyRoleReason(role, model)}
              </p>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
function StorageSection({
  storage,
  storagePath,
  migrationPreview,
  busyAction,
  onStoragePath,
  onStorageAction,
  onMigrateStorage,
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/35 p-4">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><FaFolderOpen /> 本地存储</h1>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <Field label="素材存放路径">
          <input
            value={storagePath}
            onChange={(event) => onStoragePath(event.target.value)}
            disabled={!storage.isLocalMode}
            className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600 disabled:text-zinc-600"
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onStoragePath("D:\\灵图素材库")}
            disabled={!storage.isLocalMode}
            className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
          >
            使用推荐路径
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        当前路径：{storage.storageRoot || "仅本地模式显示"}；默认路径：{storage.defaultStorageRoot || "仅本地模式显示"}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <button onClick={() => onStorageAction("check")} disabled={!storage.isLocalMode || busyAction === "check"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">检测路径</button>
        <button onClick={() => onStorageAction("save", { create: true })} disabled={!storage.isLocalMode || busyAction === "save"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">保存路径</button>
        <button onClick={() => onStorageAction("open")} disabled={!storage.isLocalMode || busyAction === "open"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">打开文件夹</button>
        <button onClick={() => onMigrateStorage(false)} disabled={!storage.isLocalMode || busyAction === "migrate"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">迁移已有素材</button>
        <button onClick={() => onStorageAction("reset")} disabled={!storage.isLocalMode || busyAction === "reset"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">恢复默认路径</button>
      </div>
      {migrationPreview && (
        <div className="mt-3 flex items-center justify-between gap-3 border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <span>确认迁移 {migrationPreview.fileCount} 个文件，约 {formatBytes(migrationPreview.totalBytes)}。旧目录会保留。</span>
          <button onClick={() => onMigrateStorage(true)} className="bg-amber-500 px-3 py-1.5 font-semibold text-black">确认迁移</button>
        </div>
      )}
    </section>
  );
}

function buildRoleModelsForProfile(profile, discoveredModels, assignment, currentModelId, role) {
  const foundModels = discoveredModels[profile.id] || [];
  const models = foundModels.map((model) => ({
    ...resolveEffectiveModelCapability({
      provider: profile.provider,
      modelId: model.modelId,
      discoveredModel: model,
      profile,
    }),
    ...model,
    providerProfileId: profile.id,
    profileName: profile.name,
    provider: profile.provider,
    enabled: profile.enabled,
  }));

  if (!foundModels.length && profile.modelId) {
    const resolved = resolveEffectiveModelCapability({
      provider: profile.provider,
      modelId: profile.modelId,
      profile,
      adapterProbe: {
        capabilities: profile.capabilities || [],
        protocol: profile.protocol,
        supportsReferenceImages: profile.supportsReferenceImages,
        capabilityStatus: profile.lastTestOk ? "adapterVerified" : "unverified",
      },
    });
    models.push({
      ...resolved,
      providerProfileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
      enabled: profile.enabled,
      reason: resolved.reason || "未从 API 发现",
      isProfileDefault: true,
    });
  }

  if (
    assignment?.providerProfileId === profile.id &&
    currentModelId &&
    !models.some((model) => model.modelId === currentModelId)
  ) {
    const resolved = resolveEffectiveModelCapability({
      provider: profile.provider,
      modelId: currentModelId,
      profile,
    });
    models.push({
      ...resolved,
      providerProfileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
      enabled: profile.enabled,
      reason: "当前已绑定模型（尚未重新发现）",
    });
  }

  return sortModelsForRole(role, models, currentModelId);
}

function isSuitableForRole(role, model) {
  if (model?.capabilityStatus === "unavailable_for_account" || model?.unavailableForAccount) return false;
  return modelSupportsRole(role, model);
}

function friendlyRoleReason(role, model) {
  if (!model.enabled) return "配置已停用";
  if (model.capabilityStatus === "unavailable_for_account" || model.unavailableForAccount) {
    return model.reason || "当前账号不可用";
  }
  const capabilities = model.capabilities || [];
  if (role === "product_vision" && model.capabilityStatus === "unverified") return model.reason || "视觉能力未验证";
  if (role === "product_vision" && !capabilities.includes("vision")) return model.reason || "该模型明确不支持图片输入";
  if (role === "image_planning" && !capabilities.includes("text")) return "只支持非文案任务或能力未验证";
  if (role === "image_generation" && model.provider === "deepseek") return "该厂商不支持图片生成";
  if (role === "image_generation" && !capabilities.includes("image") && !capabilities.includes("asyncImage")) {
    return capabilities.includes("vision") ? "只支持图片理解，不支持图片输出" : "图片协议不支持生成图";
  }
  if (role === "image_generation" && model.supportsReferenceImages === false) return "当前协议不支持传参考图";
  return model.reason || "能力未验证";
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function providerName(provider) {
  return PROVIDER_DEFAULTS[provider]?.name || provider;
}

function pickRecommendedModel(role, profiles, discoveredModels, current) {
  const candidates = profiles.flatMap((profile) => {
    const models = buildRoleModelsForProfile(
      profile,
      discoveredModels,
      current,
      current?.providerProfileId === profile.id ? (current?.modelId || current?.providerProfile?.modelId || "") : "",
      role,
    );
    return models.filter((model) => isSuitableForRole(role, model));
  });
  if (!candidates.length) return null;
  const sorted = sortModelsForRole(role, candidates, current?.modelId || "");
  return sorted[0] || null;
}

function productVisionMigrationForCurrentBinding({
  role,
  assignment,
  selectedProfile,
  profileModels,
  currentModelId,
}) {
  if (role !== "product_vision") return null;
  if (!assignment?.providerProfile || !selectedProfile) return null;
  if (assignment.providerProfileId !== selectedProfile.id) return null;
  if (selectedProfile.provider !== "gemini") return null;
  if (!GEMINI_LEGACY_PRODUCT_VISION_MODELS.has(normalizeModelIdForUi(currentModelId))) return null;
  const candidates = profileModels.filter((model) =>
    model.provider === "gemini" &&
    model.enabled !== false &&
    isSuitableForRole("product_vision", model) &&
    !model.capabilities?.includes("image") &&
    !model.capabilities?.includes("asyncImage") &&
    !model.unavailableForAccount &&
    model.capabilityStatus !== "unavailable_for_account",
  );
  for (const preferred of GEMINI_PRODUCT_VISION_REPLACEMENTS) {
    const match = candidates.find((model) => normalizeModelIdForUi(model.modelId) === preferred);
    if (match) {
      return {
        modelId: match.modelId,
        displayName: match.displayName || match.modelId,
      };
    }
  }
  return null;
}

function applyClientUnavailableState(model, migration, currentModelId) {
  if (model.capabilityStatus === "unavailable_for_account" || model.unavailableForAccount) return model;
  if (
    migration &&
    GEMINI_LEGACY_PRODUCT_VISION_MODELS.has(normalizeModelIdForUi(model.modelId)) &&
    normalizeModelIdForUi(model.modelId) === normalizeModelIdForUi(currentModelId)
  ) {
    return {
      ...model,
      capabilityStatus: "unavailable_for_account",
      unavailableForAccount: true,
      recommendedFor: [],
      reason: "当前账号无法使用 Gemini 2.5 Flash，请切换到推荐模型",
    };
  }
  return model;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
