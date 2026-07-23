"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaPlug,
  FaSpinner,
  FaTrash,
  FaWrench,
} from "react-icons/fa";
import {
  CAPABILITIES,
  IMAGE_GENERATION_PROTOCOLS,
  MODEL_ROLES,
  PROVIDER_DEFAULTS,
} from "@/lib/provider-profiles";

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

export default function ProviderSettingsClient() {
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [credentialKeyConfigured, setCredentialKeyConfigured] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [models, setModels] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [profilesRes, assignmentsRes] = await Promise.all([
      fetch("/api/provider-profiles"),
      fetch("/api/model-role-assignments"),
    ]);
    const profilesData = await profilesRes.json();
    const assignmentsData = await assignmentsRes.json();

    if (!profilesRes.ok) throw new Error(profilesData.error || "无法读取配置");
    if (!assignmentsRes.ok) throw new Error(assignmentsData.error || "无法读取角色绑定");

    setProfiles(profilesData.profiles);
    setCredentialKeyConfigured(profilesData.credentialKeyConfigured);
    setAssignments(assignmentsData);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData().catch((err) => setError(err.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const assignmentMap = useMemo(
    () => Object.fromEntries(assignments.map((item) => [item.role, item])),
    [assignments],
  );

  function updateProvider(provider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm({
      ...form,
      provider,
      baseUrl: defaults.baseUrl,
      protocol: defaults.protocol,
      capabilities: defaults.capabilities,
    });
  }

  function toggleCapability(capability) {
    setForm((current) => {
      const hasCapability = current.capabilities.includes(capability);
      return {
        ...current,
        capabilities: hasCapability
          ? current.capabilities.filter((item) => item !== capability)
          : [...current.capabilities, capability],
      };
    });
  }

  function editProfile(profile) {
    setEditingId(profile.id);
    setModels([]);
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
    setModels([]);
    setForm(EMPTY_FORM);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const url = editingId
        ? `/api/provider-profiles/${editingId}`
        : "/api/provider-profiles";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      await loadData();
      resetForm();
      setMessage("配置已保存");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testProfile(profileId) {
    setTestingId(profileId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/provider-profiles/${profileId}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}：${data.message}`);
      setMessage(`${data.provider} / ${data.modelId} 连接成功，${data.latencyMs}ms`);
      await loadData();
    } catch (err) {
      setError(err.message);
      await loadData();
    } finally {
      setTestingId("");
    }
  }

  async function listModels(profileId) {
    setTestingId(profileId);
    setError("");
    setModels([]);
    try {
      const res = await fetch(`/api/provider-profiles/${profileId}/models`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.code || "ERROR"}：${data.message}`);
      setModels(data.models || []);
      setMessage(data.message || "模型列表已返回");
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingId("");
    }
  }

  async function deleteProfile(profileId) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/provider-profiles/${profileId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    await loadData();
    setMessage("配置已删除");
  }

  async function assignRole(role, providerProfileId) {
    setError("");
    const res = await fetch(`/api/model-role-assignments/${role}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerProfileId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "保存角色失败");
      return;
    }
    await loadData();
  }

  async function clearRole(role) {
    const res = await fetch(`/api/model-role-assignments/${role}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "清除角色失败");
      return;
    }
    await loadData();
  }

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 xl:grid-cols-[380px_1fr]">
        <section className="border border-zinc-800 bg-zinc-900/45 p-5">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-white">API 与模型设置</h1>
            <p className="mt-1 text-sm text-zinc-500">
              保存自己的 API Key，并为三个模型角色选择默认配置。
            </p>
          </div>

          {!credentialKeyConfigured && (
            <div className="mb-4 border border-amber-900/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
              缺少 CREDENTIAL_ENCRYPTION_KEY。请运行 npm run generate:credential-key
              后写入 .env。
            </div>
          )}

          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="配置名称">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                  <option key={id} value={id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="接口地址">
              <input
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                placeholder="https://api.example.com/v1"
              />
            </Field>

            <Field label="API Key">
              <input
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                placeholder={editingId ? "留空表示保留原 Key" : "只在服务端加密保存"}
                type="password"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="模型 ID">
                <input
                  value={form.modelId}
                  onChange={(event) =>
                    setForm({ ...form, modelId: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  required
                />
              </Field>
              <Field label="协议">
	                <input
	                  list="provider-protocol-options"
	                  value={form.protocol}
                  onChange={(event) =>
                    setForm({ ...form, protocol: event.target.value })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
	                />
	                <datalist id="provider-protocol-options">
	                  <option value="openai" />
	                  <option value="openai-compatible" />
	                  {IMAGE_GENERATION_PROTOCOLS.map((protocol) => (
	                    <option key={protocol} value={protocol} />
	                  ))}
	                </datalist>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="超时 ms">
                <input
                  value={form.timeoutMs}
                  onChange={(event) =>
                    setForm({ ...form, timeoutMs: Number(event.target.value) })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  type="number"
                />
              </Field>
              <Field label="重试次数">
                <input
                  value={form.maxRetries}
                  onChange={(event) =>
                    setForm({ ...form, maxRetries: Number(event.target.value) })
                  }
                  className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-violet-600"
                  type="number"
                />
              </Field>
            </div>

            <div>
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-widest text-zinc-500">
                能力标签
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map((capability) => (
                  <label
                    key={capability}
                    className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <input
                      checked={form.capabilities.includes(capability)}
                      onChange={() => toggleCapability(capability)}
                      type="checkbox"
                    />
                    {capability}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <input
                checked={form.enabled}
                onChange={(event) =>
                  setForm({ ...form, enabled: event.target.checked })
                }
                type="checkbox"
              />
              启用配置
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-zinc-800"
              >
                {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                {editingId ? "保存修改" : "新建配置"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white"
              >
                清空
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-5">
          {(message || error) && (
            <div
              className={`border px-3 py-2 text-sm ${
                error
                  ? "border-red-900/60 bg-red-950/40 text-red-200"
                  : "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"
              }`}
            >
              {error || message}
            </div>
          )}

          <div className="border border-zinc-800 bg-zinc-900/35 p-4">
            <h2 className="mb-4 text-sm font-semibold text-white">服务商配置</h2>
            {profiles.length === 0 ? (
              <p className="border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
                暂无 API 配置
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {profiles.map((profile) => (
                  <article key={profile.id} className="border border-zinc-800 bg-zinc-950 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {profile.name}
                        </h3>
                        <p className="mt-1 truncate text-sm text-zinc-500">
                          {profile.provider} / {profile.modelId}
                        </p>
                        <p className="mt-1 truncate text-sm text-zinc-500">
                          协议：{formatProtocol(profile.protocol)}
                        </p>
                      </div>
                      <span
                        className={`border px-2 py-1 text-[13px] font-semibold ${
                          profile.enabled
                            ? "border-emerald-900 text-emerald-300"
                            : "border-zinc-800 text-zinc-500"
                        }`}
                      >
                        {profile.enabled ? "启用" : "停用"}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {profile.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="border border-zinc-800 px-2 py-1 text-[13px] font-semibold text-zinc-400"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                    <p className="mb-3 truncate text-sm text-zinc-500">
                      密钥：{profile.maskedApiKey || "未保存"}
                    </p>
                    <p className="mb-3 text-sm text-zinc-500">
                      参考图：{profile.supportsReferenceImages ? "真实参与生成" : "纯文生图/未实现"}
                    </p>
                    {profile.lastTestMessage && (
                      <p
                        className={`mb-3 text-sm ${
                          profile.lastTestOk ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {profile.lastTestMessage}
                      </p>
                    )}
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => editProfile(profile)}
                        className="col-span-1 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => testProfile(profile.id)}
                        disabled={testingId === profile.id}
                        className="col-span-2 flex items-center justify-center gap-2 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:text-zinc-600"
                      >
                        {testingId === profile.id ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaPlug />
                        )}
                        测试
                      </button>
                      <button
                        onClick={() => listModels(profile.id)}
                        className="col-span-1 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
                      >
                        模型
                      </button>
                      <button
                        onClick={() => deleteProfile(profile.id)}
                        className="col-span-1 border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:border-red-700 hover:text-red-300"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {models.length > 0 && (
              <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
                <h3 className="mb-2 text-sm font-semibold text-zinc-300">模型列表</h3>
                <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                  {models.map((model) => (
                    <button
                      key={model}
                      onClick={() => setForm((current) => ({ ...current, modelId: model }))}
                      className="border border-zinc-800 px-2 py-1 text-[13px] text-zinc-400 hover:text-white"
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border border-zinc-800 bg-zinc-900/35 p-4">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <FaWrench />
              三角色默认配置
            </h2>
            <div className="grid gap-3 lg:grid-cols-3">
              {Object.entries(MODEL_ROLES).map(([role, config]) => {
                const eligible = profiles.filter((profile) =>
                  config.accepts(profile.capabilities, profile),
                );
                const current = assignmentMap[role];
                return (
                  <article key={role} className="border border-zinc-800 bg-zinc-950 p-4">
                    <h3 className="text-sm font-semibold text-white">{config.label}</h3>
                    <p className="mt-1 min-h-8 text-sm text-zinc-500">
                      {current?.providerProfile
                        ? `${current.providerProfile.name} / ${current.providerProfile.modelId}`
                        : "未配置"}
                    </p>
                    <select
                      value={current?.providerProfileId || ""}
                      onChange={(event) =>
                        event.target.value && assignRole(role, event.target.value)
                      }
                      className="mt-3 w-full border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm outline-none"
                    >
                      <option value="">选择配置</option>
                      {eligible.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} - {profile.modelId}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => clearRole(role)}
                      className="mt-2 w-full border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-white"
                    >
                      清除配置
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
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

function formatProtocol(protocol) {
  return protocol === "generic-async-image" ? "generic-async-image（约定协议）" : protocol;
}
