"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaCheck, FaFolderOpen, FaPlug, FaPlus, FaRedo, FaSearch, FaSpinner, FaTrash, FaWrench } from "react-icons/fa";
import {
  CAPABILITIES, IMAGE_GENERATION_PROTOCOLS, PROVIDER_DEFAULTS, ACCEPTANCE_LABELS,
  roleAcceptanceLevel, inferProviderDraftSettings, MODEL_ROLES
} from "@/lib/provider-profiles";

const EMPTY_FORM = { id: "", name: "", provider: "openai", baseUrl: PROVIDER_DEFAULTS.openai.baseUrl, apiKey: "", protocol: PROVIDER_DEFAULTS.openai.protocol, capabilities: PROVIDER_DEFAULTS.openai.capabilities, timeoutMs: 30000, maxRetries: 0, enabled: true };
const ROLE_ORDER = ["product_vision", "image_planning", "image_generation"];
const ROLE_LABELS = { product_vision: "商品识图", image_planning: "策划与提示词", image_generation: "图片生成" };
const ROLE_REQUIRED_CAP = { product_vision: "vision", image_planning: "text", image_generation: null };

function normalizeModelDetails(payload) {
  const source = Array.isArray(payload?.modelDetails) && payload.modelDetails.length
    ? payload.modelDetails
    : (Array.isArray(payload?.models) ? payload.models : []);
  return source
    .map((item) => (typeof item === "string"
      ? { modelId: item, capabilities: [], protocol: "", capabilityStatus: "unverified", reason: "" }
      : item))
    .filter((item) => item?.modelId);
}

export default function ProviderSettingsClient() {
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
      fetch("/api/provider-profiles"), fetch("/api/model-role-assignments"), fetch("/api/local-settings/storage")
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

  useEffect(() => { const timer = setTimeout(() => { loadData().catch((err) => setError(err.message)); }, 0); return () => clearTimeout(timer); }, [loadData]);

  const assignmentMap = useMemo(() => Object.fromEntries(assignments.map((item) => [item.role, item])), [assignments]);

  // P0-1 fix: model objects, not strings
  const filteredModels = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase();
    if (!needle) return draftModels;
    return draftModels.filter((m) => String((m.modelId || "")).toLowerCase().includes(needle));
  }, [draftModels, modelSearch]);

  function patchForm(p) { setForm((c) => ({ ...c, ...p })); }

  function updateProvider(provider) {
    const d = PROVIDER_DEFAULTS[provider];
    setDraftModels([]); setModelSearch(""); setManualModel(false);
    setForm((c) => ({ ...c, provider, baseUrl: d.baseUrl, protocol: d.protocol, capabilities: d.capabilities, modelId: "", name: c.name || `${d.name} 配置` }));
  }

  function applyModelSelection(modelId) {
    setForm((c) => {
      const inf = inferProviderDraftSettings({ provider: c.provider, modelId, protocol: c.protocol, capabilities: c.capabilities });
      return { ...c, modelId, protocol: inf.protocol, capabilities: inf.capabilities };
    });
  }

  function toggleCapability(cap) {
    setForm((c) => ({ ...c, capabilities: c.capabilities.includes(cap) ? c.capabilities.filter((i) => i !== cap) : [...c.capabilities, cap] }));
  }

  function editProfile(profile) { setEditingId(profile.id); setDraftModels([]); setModelSearch(""); setManualModel(false); setForm({ id: profile.id, name: profile.name, provider: profile.provider, baseUrl: profile.baseUrl || "", apiKey: "", modelId: profile.modelId, protocol: profile.protocol, capabilities: profile.capabilities, timeoutMs: profile.timeoutMs, maxRetries: profile.maxRetries, enabled: profile.enabled }); }
  function resetForm() { setEditingId(""); setDraftModels([]); setModelSearch(""); setManualModel(false); setForm({ ...EMPTY_FORM }); }

  async function runJson(url, options = {}) { const res = await fetch(url, options); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || data.message || "操作失败"); return data; }

  async function saveProfile(event) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const url = editingId ? `/api/provider-profiles/${editingId}` : "/api/provider-profiles";
      await runJson(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      await loadData(); resetForm();
      setMessage("配置已保存。可以继续新增服务商配置，或在三角色绑定中选择它。");
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function discoverDraftModels() {
    setBusyAction("discover"); setError(""); setMessage("");
    try {
      const data = await runJson("/api/provider-models/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setDraftModels(normalizeModelDetails(data)); setManualModel(false);
      setMessage(data.message || "模型列表已读取。");
    } catch (err) { setDraftModels([]); setMessage(""); setError(err.message || "该接口不支持自动获取模型"); } finally { setBusyAction(""); }
  }

  async function testDraftConnection() {
    setBusyAction("test-draft"); setError(""); setMessage("");
    try { const data = await runJson("/api/provider-models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); setMessage(data.message || "连接测试完成。"); } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  }

  async function testSavedProfile(profileId) {
    setBusyAction(`test-${profileId}`); setError(""); setMessage("");
    try { const data = await runJson(`/api/provider-profiles/${profileId}/test`, { method: "POST" }); setMessage(data.message || "连接成功。"); await loadData(); } catch (err) { setError(err.message); await loadData().catch(() => {}); } finally { setBusyAction(""); }
  }

  async function discoverSavedProfileModels(profileId) {
    setBusyAction(`discover-${profileId}`); setError("");
    try {
      const data = await runJson("/api/provider-models/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerProfileId: profileId }) });
      setDiscoveredModels((prev) => ({ ...prev, [profileId]: normalizeModelDetails(data) }));
      await loadData();
      setMessage(data.message || `已发现 ${data.count || 0} 个模型`);
    } catch (err) { setError(`模型发现失败: ${err.message}`); } finally { setBusyAction(""); }
  }

  async function deleteProfile(profile) {
    const usedBy = assignments.filter((item) => item.providerProfileId === profile.id).map((item) => ROLE_LABELS[item.role] || item.role);
    if (usedBy.length > 0) { window.alert(`该配置正在被以下角色使用，不能直接删除：${usedBy.join("、")}。请先清除或更换角色绑定。`); return; }
    if (!window.confirm(`确认删除配置「${profile.name}」吗？`)) return;
    setError(""); setMessage("");
    try { await runJson(`/api/provider-profiles/${profile.id}`, { method: "DELETE" }); await loadData(); setMessage("配置已删除。"); } catch (err) { setError(err.message); }
  }

  // P1-1 fix: manual select → isUserForced=true; auto → false
  async function assignRole(role, providerProfileId, modelId = "", isForced = true) {
    setError("");
    try {
      await runJson(`/api/model-role-assignments/${role}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerProfileId, modelId: modelId || null, isUserForced: isForced }) });
      await loadData();
    } catch (err) { setError(err.message); }
  }

  async function clearRole(role) {
    try { await runJson(`/api/model-role-assignments/${role}`, { method: "DELETE" }); await loadData(); } catch (err) { setError(err.message); }
  }

  function toggleRoleLock(role) { setLockedRoles((current) => ({ ...current, [role]: !current[role] })); }

  async function recommendRoles() {
    setBusyAction("recommend-roles"); setError(""); setMessage("");
    try {
      let changed = 0;
      for (const role of ROLE_ORDER) {
        // Skip if user locked (UI toggle) OR assignment is user-forced (from DB)
        if (lockedRoles[role]) continue;
        const current = assignmentMap[role];
        if (current?.isUserForced) continue;
        const recommended = pickRecommendedProfile(role, profiles, current?.providerProfile);
        if (recommended && recommended.id !== current?.providerProfileId) {
          await runJson(`/api/model-role-assignments/${role}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerProfileId: recommended.id, isUserForced: false }) });
          changed += 1;
        }
      }
      await loadData();
      setMessage(changed > 0 ? `已推荐并更新 ${changed} 个角色。` : "当前角色绑定已是推荐状态。");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  }

  async function storageAction(action, extra = {}) {
    setBusyAction(action); setError(""); setMessage("");
    try {
      const data = await runJson("/api/local-settings/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, storageRoot: storagePath, ...extra }) });
      if (data.storageRoot) { setStoragePath(data.storageRoot); setStorage((current) => ({ ...current, storageRoot: data.storageRoot })); }
      setMessage(data.message || "操作完成。");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  }

  async function migrateStorage(confirm = false) {
    setBusyAction("migrate"); setError(""); setMessage("");
    try {
      const data = await runJson("/api/local-settings/storage/migrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storageRoot: storagePath, create: true, confirm }) });
      if (data.requiresConfirmation) { setMigrationPreview(data); setMessage(`准备迁移 ${data.fileCount} 个文件，约 ${formatBytes(data.totalBytes)}。确认后会复制文件并保留旧目录。`); }
      else { setMigrationPreview(null); setMessage(data.message || "迁移完成。"); await loadData(); }
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 xl:grid-cols-[420px_1fr]">
        {/* LEFT: ACCOUNT FORM */}
        <section className="border border-zinc-800 bg-zinc-900/45 p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div><h1 className="text-lg font-semibold text-white">服务商配置</h1><p className="mt-1 text-sm text-zinc-500">一个配置包含服务商、Base URL、API Key、模型和协议。</p></div>
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"><FaPlus /> 新增服务商配置</button>
          </div>
          {!credentialKeyConfigured && (<div className="mb-4 border border-amber-900/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">缺少 CREDENTIAL_ENCRYPTION_KEY，暂时无法安全保存 API Key。</div>)}
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="配置名称"><input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" required /></Field>
            <Field label="服务商"><select value={form.provider} onChange={(e) => updateProvider(e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600">{Object.entries(PROVIDER_DEFAULTS).map(([id, item]) => (<option key={id} value={id}>{item.name}</option>))}</select></Field>
            <Field label="Base URL"><input value={form.baseUrl} onChange={(e) => patchForm({ baseUrl: e.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" placeholder="https://api.example.com/v1" /></Field>
            <Field label="API Key"><input value={form.apiKey} onChange={(e) => patchForm({ apiKey: e.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" placeholder={editingId ? "留空表示保留旧 Key" : "仅在服务端加密保存"} type="password" /></Field>

            {/* P0-1 fix: model objects → model.modelId */}
            <Field label="模型 ID">
              {manualModel ? (
                <input value={form.modelId} onChange={(e) => applyModelSelection(e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" required />
              ) : (
                <select value={form.modelId} onChange={(e) => applyModelSelection(e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" required>
                  <option value="">选择模型或手动填写</option>
                  {filteredModels.map((m) => (<option key={m.modelId} value={m.modelId}>{m.modelId}</option>))}
                  {form.modelId && !filteredModels.some((m) => m.modelId === form.modelId) && (<option value={form.modelId}>{form.modelId}</option>)}
                </select>
              )}
            </Field>
            {draftModels.length > 0 && !manualModel && (<div className="flex items-center gap-2"><FaSearch className="text-zinc-500" /><input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" placeholder="搜索模型" /></div>)}

            <div className="grid grid-cols-2 gap-3"><Field label="超时 ms"><input value={form.timeoutMs} onChange={(e) => patchForm({ timeoutMs: Number(e.target.value) })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" type="number" /></Field><Field label="重试次数"><input value={form.maxRetries} onChange={(e) => patchForm({ maxRetries: Number(e.target.value) })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" type="number" /></Field></div>

            <details className="border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400"><summary className="cursor-pointer font-semibold text-zinc-200">高级设置：协议与模型能力</summary><div className="mt-3 grid gap-3"><Field label="协议"><input list="provider-protocol-options" value={form.protocol} onChange={(e) => patchForm({ protocol: e.target.value })} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600" /><datalist id="provider-protocol-options"><option value="openai-compatible" />{IMAGE_GENERATION_PROTOCOLS.map((p) => (<option key={p} value={p} />))}</datalist></Field><div><span className="mb-2 block text-xs font-semibold uppercase text-zinc-500">自动识别能力，可手动修正</span><div className="grid grid-cols-2 gap-2">{CAPABILITIES.map((c) => (<label key={c} className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"><input checked={form.capabilities.includes(c)} onChange={() => toggleCapability(c)} type="checkbox" />{c}</label>))}</div></div></div></details>

            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300"><input checked={form.enabled} onChange={(e) => patchForm({ enabled: e.target.checked })} type="checkbox" />启用配置</label>

            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={testDraftConnection} disabled={busyAction === "test-draft"} className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">{busyAction === "test-draft" ? <FaSpinner className="animate-spin" /> : <FaPlug />}测试连接</button><button type="button" onClick={discoverDraftModels} disabled={busyAction === "discover"} className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">{busyAction === "discover" ? <FaSpinner className="animate-spin" /> : <FaRedo />}{draftModels.length ? "刷新模型" : "获取模型"}</button><button type="button" onClick={() => setManualModel((v) => !v)} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white">手动填写</button><button disabled={saving} className="inline-flex items-center justify-center gap-2 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800">{saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}{editingId ? "保存修改" : "保存配置"}</button></div>
          </form>
        </section>

        {/* RIGHT: SAVED ACCOUNTS + ROLE BINDING */}
        <section className="space-y-5">
          {(message || error) && (<div className={`border px-3 py-2 text-sm ${error ? "border-red-900/60 bg-red-950/40 text-red-200" : "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"}`}>{error || message}</div>)}

          <section className="border border-zinc-800 bg-zinc-900/35 p-4"><h2 className="mb-4 text-sm font-semibold text-white">已保存配置</h2>
            {profiles.length === 0 ? (<p className="border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">还没有保存任何服务商配置。</p>) : (
              <div className="grid gap-3 lg:grid-cols-2">{profiles.map((profile) => (() => { const dms = discoveredModels[profile.id] || []; return (
                <article key={profile.id} className="border border-zinc-800 bg-zinc-950 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{profile.name}</h3><p className="mt-1 truncate text-sm text-zinc-500">{providerName(profile.provider)} / {profile.modelId}</p><p className="mt-1 truncate text-sm text-zinc-500">{profile.baseUrl || "未设置 Base URL"}</p></div><span className={`border px-2 py-1 text-xs font-semibold ${profile.enabled ? "border-emerald-900 text-emerald-300" : "border-zinc-800 text-zinc-500"}`}>{profile.enabled ? "启用" : "停用"}</span></div>
                  <div className="mb-3 flex flex-wrap gap-2">{profile.capabilities.map((c) => (<span key={c} className="border border-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-400">{c}</span>))}</div>
                  <p className="mb-1 text-sm text-zinc-500">协议：{profile.protocol}</p><p className="mb-1 text-sm text-zinc-500">密钥：{profile.maskedApiKey || "未保存"}</p><p className="mb-1 text-sm text-zinc-500">参考图：{formatReferenceSupport(profile)}</p>
                  {dms.length > 0 && (<div className="mb-3 max-h-32 overflow-y-auto border border-zinc-800 bg-zinc-900/50 p-2"><p className="mb-1 text-xs font-semibold text-zinc-600">已发现模型 ({dms.length})</p>{dms.map((m) => (<div key={m.modelId} className="flex items-center gap-2 py-0.5 text-xs"><span className="truncate text-zinc-300">{m.modelId}</span>{(m.capabilities || []).map((c) => (<span key={c} className="border border-zinc-700 px-1 text-xs text-zinc-500">{c}</span>))}</div>))}</div>)}
                  <div className="grid grid-cols-3 gap-2"><button onClick={() => editProfile(profile)} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white">编辑</button><button onClick={() => testSavedProfile(profile.id)} disabled={busyAction === `test-${profile.id}`} className="inline-flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">{busyAction === `test-${profile.id}` ? <FaSpinner className="animate-spin" /> : <FaPlug />}测试</button><button onClick={() => deleteProfile(profile)} className="inline-flex items-center justify-center border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300"><FaTrash /></button><button onClick={() => discoverSavedProfileModels(profile.id)} disabled={busyAction === `discover-${profile.id}`} className="col-span-3 inline-flex items-center justify-center gap-2 border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600">{busyAction === `discover-${profile.id}` ? <FaSpinner className="animate-spin" /> : <FaRedo />}{dms.length ? "刷新模型列表" : "获取模型列表"}</button></div>
                </article>
              ); })())}</div>
            )}
          </section>

          {/* ROLE BINDING */}
          {profiles.length > 0 && (<section className="border border-zinc-800 bg-zinc-900/35 p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><FaWrench /> 三角色绑定</h2><button type="button" onClick={recommendRoles} disabled={busyAction === "recommend-roles"} data-testid="recommend-roles-button" className="inline-flex items-center gap-2 border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-500 disabled:border-zinc-800 disabled:text-zinc-600">{busyAction === "recommend-roles" ? <FaSpinner className="animate-spin" /> : <FaCheck />}一键推荐三角色</button></div>
            <div className="grid gap-3 lg:grid-cols-3">{ROLE_ORDER.map((role) => {
              const current = assignmentMap[role];
              const currentModelId = current?.modelId || current?.providerProfile?.modelId || "";
              const allModels = [];
              for (const p of profiles) {
                const dms = discoveredModels[p.id] || [];
                dms.forEach((m) => allModels.push({ ...m, providerProfileId: p.id, profileName: p.name, provider: p.provider }));
                if (!dms.length && p.modelId) allModels.push({ modelId: p.modelId, providerProfileId: p.id, profileName: p.name, provider: p.provider, capabilities: p.capabilities || [], protocol: p.protocol, capabilityStatus: "unverified", reason: "未从 API 发现", isProfileDefault: true });
              }
              // P1-3: inject current assignment model if not in list
              if (current && currentModelId && !allModels.some((m) => m.modelId === currentModelId && m.providerProfileId === current.providerProfileId)) {
                allModels.push({ modelId: currentModelId, providerProfileId: current.providerProfileId, profileName: current.providerProfile?.name || "", provider: current.providerProfile?.provider || "", capabilities: current.providerProfile?.capabilities || [], protocol: current.providerProfile?.protocol || "", capabilityStatus: "unverified", reason: "当前已绑定模型（尚未重新发现）" });
              }
              const reqC = role === "product_vision" ? "vision" : role === "image_planning" ? "text" : null;
              const suitable = allModels.filter((m) => { const c = m.capabilities || []; if (role === "product_vision") return c.includes("vision"); if (role === "image_planning") return c.includes("text"); if (role === "image_generation") return (c.includes("image") || c.includes("asyncImage")) && m.provider !== "deepseek"; return false; });
              const unsuitable = allModels.filter((m) => !suitable.includes(m));
              const optionValue = (m) => m.isProfileDefault ? m.providerProfileId : `${m.providerProfileId}::${m.modelId}`;
              const currentSelectValue = current ? (current.modelId ? `${current.providerProfileId}::${current.modelId}` : current.providerProfileId) : "";
              return (
                <article key={role} className="border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">{ROLE_LABELS[role]}</h3><label className="flex items-center gap-2 text-xs font-semibold text-zinc-400"><input data-testid={`role-lock-${role}`} checked={Boolean(lockedRoles[role])} onChange={() => toggleRoleLock(role)} type="checkbox" />锁定</label></div>
                  <p className="mt-1 min-h-12 text-sm text-zinc-500">{current?.providerProfile ? `${providerName(current.providerProfile.provider)} · ${current.providerProfile.name} · ${currentModelId}${current.isUserForced ? "（手动选择）" : "（推荐）"}` : "未绑定"}</p>
                  {/* P1-10: unsuitable models selectable with confirmation */}
                  <select value={currentSelectValue} onChange={(e) => {
                    const v = e.target.value; if (!v) return clearRole(role); const [pp, md] = v.split("::");
                    const m = allModels.find((x) => x.providerProfileId === pp && x.modelId === md);
                    const lv = m ? roleAcceptanceLevel(role, { ...m, enabled: true, supportsReferenceImages: m.protocol === "openai-image-edit" || m.protocol === "gemini-native-image", referenceImageSupportStatus: m.protocol === "openai-image-edit" || m.protocol === "gemini-native-image" ? "verified" : "unverified" }) : "unverified";
                    if (lv === "unsupported" || (m && unsuitable.includes(m))) { if (!window.confirm(`该模型标记为能力不匹配，强制绑定可能导致功能异常。确认继续？`)) return; }
                    assignRole(role, pp, md || undefined, true);
                  }} className="mt-2 w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm outline-none">
                    <option value="">清除绑定</option>
                    {suitable.length > 0 && (<optgroup label="── 可选 ──">{suitable.map((m) => (<option key={`${m.providerProfileId}::${m.modelId}`} value={optionValue(m)}>{m.profileName} / {m.modelId}</option>))}</optgroup>)}
                    {unsuitable.length > 0 && (<optgroup label="── 能力可能不匹配 ──">{unsuitable.map((m) => { const cs = m.capabilities || []; const r = reqC && !cs.includes(reqC) ? `缺少${reqC}` : m.provider === "deepseek" ? "DeepSeek不支持" : "未验证"; return (<option key={`${m.providerProfileId}::${m.modelId}`} value={optionValue(m)}>{m.profileName} / {m.modelId} [{r}]</option>); })}</optgroup>)}
                  </select>
                  {unsuitable.length > 0 && (<details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-zinc-600">能力说明</summary><div className="mt-1 space-y-1">{unsuitable.map((m) => { const cs = m.capabilities || []; const rs = []; if (role === "product_vision" && !cs.includes("vision")) rs.push("无vision"); if (role === "image_planning" && !cs.includes("text")) rs.push("无text"); if (role === "image_generation" && !cs.includes("image") && !cs.includes("asyncImage")) rs.push("无image"); if (role === "image_generation" && m.provider === "deepseek") rs.push("DeepSeek不支持生图"); return (<p key={`${m.providerProfileId}-${m.modelId}`} className="text-xs text-zinc-600">{m.profileName} / {m.modelId}：{rs.join("、") || "未验证能力"}</p>); })}</div></details>)}
                </article>
              );
            })}</div>
          </section>)}

          {/* STORAGE */}
          <section className="border border-zinc-800 bg-zinc-900/35 p-4"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><FaFolderOpen /> 本地存储设置</h2>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]"><Field label="素材存放路径"><input value={storagePath} onChange={(e) => setStoragePath(e.target.value)} disabled={!storage.isLocalMode} className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600 disabled:text-zinc-600" /></Field><div className="flex items-end"><button type="button" onClick={() => setStoragePath("D:\\灵图素材库")} disabled={!storage.isLocalMode} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">使用推荐路径</button></div></div>
            <p className="mt-1 text-sm text-zinc-500">当前路径：{storage.storageRoot || "仅本地模式显示"}；默认路径：{storage.defaultStorageRoot || "仅本地模式显示"}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5"><button onClick={() => storageAction("check")} disabled={!storage.isLocalMode || busyAction === "check"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">检测路径</button><button onClick={() => storageAction("save", { create: true })} disabled={!storage.isLocalMode || busyAction === "save"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">保存路径</button><button onClick={() => storageAction("open")} disabled={!storage.isLocalMode || busyAction === "open"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">打开文件夹</button><button onClick={() => migrateStorage(false)} disabled={!storage.isLocalMode || busyAction === "migrate"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">迁移已有素材</button><button onClick={() => storageAction("reset")} disabled={!storage.isLocalMode || busyAction === "reset"} className="border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600">恢复默认路径</button></div>
            {migrationPreview && (<div className="mt-3 flex items-center justify-between gap-3 border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"><span>确认迁移 {migrationPreview.fileCount} 个文件，约 {formatBytes(migrationPreview.totalBytes)}。旧目录会保留。</span><button onClick={() => migrateStorage(true)} className="bg-amber-500 px-3 py-1.5 font-semibold text-black">确认迁移</button></div>)}
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }) { return (<label className="block"><span className="mb-2 block text-xs font-semibold uppercase text-zinc-500">{label}</span>{children}</label>); }
function providerName(provider) { return PROVIDER_DEFAULTS[provider]?.name || provider; }
function formatReferenceSupport(profile) { if (profile.referenceImageSupportStatus === "verified" || profile.supportsReferenceImages) return "支持参考图"; if (profile.referenceImageSupportStatus === "text_only") return "只支持文字"; if (profile.referenceImageSupportStatus === "unverified") return "参考图未验证"; return "不支持参考图"; }

function pickRecommendedProfile(role, profiles, current) {
  if (current && roleAcceptanceLevel(role, current) !== "unsupported") return current;
  const candidates = profiles.filter((p) => roleAcceptanceLevel(role, p) !== "unsupported");
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => roleScore(role, b) - roleScore(role, a))[0];
}
function roleScore(role, profile) {
  const lv = roleAcceptanceLevel(role, profile); const cs = profile.capabilities || []; let s = profile.enabled ? 10 : 0;
  if (lv === "adapterVerified") s += 50; else if (lv === "inferred") s += 20; else if (lv === "unverified") s += 5; else return 0;
  if (role === "product_vision") { if (cs.includes("vision")) s += 20; if (cs.includes("image") || cs.includes("asyncImage")) s -= 40; if (profile.provider === "gemini") s += 2; }
  if (role === "image_planning") { if (cs.includes("text")) s += 20; if (cs.includes("reasoning")) s += 6; }
  if (role === "image_generation") { if (cs.includes("image")) s += 20; if (profile.supportsReferenceImages) s += 10; }
  return s;
}
function formatBytes(bytes) { const v = Number(bytes || 0); if (v < 1024) return `${v} B`; if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`; return `${(v / 1024 / 1024).toFixed(1)} MB`; }
