import {
  createFileRoute,
  redirect,
  useHydrated,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  getAiSettingsFn,
  saveAiSettingsFn,
  testAiSettingsFn,
} from '#/features/settings/settings.functions'
import type { AiSettingsPublic } from '#/modules/settings/settings.service'
import type { AiVendor } from '#/server/ai/catalog'
import {
  AI_VENDORS,
  AI_VENDOR_SPECS,
  fallbackModels,
} from '#/server/ai/catalog'

export const Route = createFileRoute('/settings')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const settings = await getAiSettingsFn()
    if (!settings.ok) {
      throw new Error(settings.error.message)
    }
    return {
      user: session.data.user,
      settings: settings.data,
    }
  },
  component: SettingsPage,
})

function runtimeCopy(settings: AiSettingsPublic) {
  if (
    settings.runtimeSource === 'settings' &&
    settings.runtimeVendor !== 'mock'
  ) {
    const label = AI_VENDOR_SPECS[settings.runtimeVendor].label
    return `当前生效：应用内 ${label} 密钥`
  }
  if (settings.runtimeSource === 'env') {
    return '当前生效：环境变量里的 OpenAI 密钥（尚未保存应用内密钥）'
  }
  return '尚未配置密钥，生成会走本地 mock'
}

function SettingsPage() {
  const { user, settings: initial } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveSettings = useServerFn(saveAiSettingsFn)
  const testSettings = useServerFn(testAiSettingsFn)
  const hydrated = useHydrated()

  const [vendor, setVendor] = useState<AiVendor>(initial.vendor)
  const [modelDraft, setModelDraft] = useState(initial.modelDraft)
  const [modelFast, setModelFast] = useState(initial.modelFast)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [saved, setSaved] = useState(initial)
  const [status, setStatus] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | null>(null)
  const [pending, setPending] = useState<'save' | 'test' | null>(null)

  const models = AI_VENDOR_SPECS[vendor].models
  const dirty = useMemo(() => {
    return (
      vendor !== saved.vendor ||
      modelDraft !== saved.modelDraft ||
      modelFast !== saved.modelFast ||
      apiKey.trim().length > 0 ||
      clearKey
    )
  }, [vendor, modelDraft, modelFast, apiKey, clearKey, saved])

  function applyVendor(next: AiVendor) {
    setVendor(next)
    const defaults = fallbackModels(next)
    const allowed = new Set(AI_VENDOR_SPECS[next].models.map((m) => m.id))
    setModelDraft(allowed.has(modelDraft) ? modelDraft : defaults.modelDraft)
    setModelFast(allowed.has(modelFast) ? modelFast : defaults.modelFast)
  }

  async function onSave() {
    setPending('save')
    setStatus(null)
    setStatusKind(null)
    try {
      const result = await saveSettings({
        data: {
          vendor,
          modelDraft,
          modelFast,
          apiKey: apiKey.trim() ? apiKey.trim() : null,
          clearKey,
        },
      })
      if (!result.ok) {
        setStatus(result.error.message)
        setStatusKind('error')
        return
      }
      setSaved(result.data)
      setApiKey('')
      setClearKey(false)
      setStatus('已保存')
      setStatusKind('ok')
      await router.invalidate()
    } finally {
      setPending(null)
    }
  }

  async function onTest() {
    if (dirty) {
      setStatus('请先保存，再探测当前配置')
      setStatusKind('error')
      return
    }
    setPending('test')
    setStatus(null)
    setStatusKind(null)
    try {
      const result = await testSettings()
      if (!result.ok) {
        setStatus(result.error.message)
        setStatusKind('error')
        return
      }
      setStatus(`探测成功 · ${result.data.vendor} · ${result.data.model}`)
      setStatusKind('ok')
    } finally {
      setPending(null)
    }
  }

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <p className="section-kicker">工作台</p>
      <h1 className="page-title mt-1">设置</h1>
      <p className="page-desc">
        目前只兼容 GPT、Grok、DeepSeek 三种 OpenAI
        兼容接口。密钥保存在服务器，不写进浏览器。
      </p>

      <form
        className="panel mt-8 max-w-xl space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          await onSave()
        }}
      >
        <div>
          <p className="section-kicker">模型</p>
          <h2 className="section-title mt-1">生成所用的模型</h2>
          <p className="meta mt-2">{runtimeCopy(saved)}</p>
        </div>

        <fieldset className="field">
          <legend className="field-label">厂商</legend>
          <div className="seg mt-1" role="radiogroup" aria-label="模型厂商">
            {AI_VENDORS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={vendor === id}
                aria-pressed={vendor === id}
                className="seg-item"
                onClick={() => applyVendor(id)}
              >
                {AI_VENDOR_SPECS[id].label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">API Key</span>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={clearKey}
            placeholder={
              clearKey
                ? '将清除已保存的密钥'
                : saved.hasKey && saved.keyLast4
                  ? `已保存 ·••••${saved.keyLast4}，留空则保持不变`
                  : `${AI_VENDOR_SPECS[vendor].label} 的 API Key`
            }
            onChange={(e) => setApiKey(e.target.value)}
            className="input"
          />
        </label>

        {saved.hasKey ? (
          <label className="flex items-center gap-2 text-sm text-[var(--cz-ink-muted)]">
            <input
              type="checkbox"
              checked={clearKey}
              onChange={(e) => {
                setClearKey(e.target.checked)
                if (e.target.checked) setApiKey('')
              }}
            />
            清除已保存的密钥
          </label>
        ) : null}

        <label className="field">
          <span className="field-label">长文 / 结构（draft）</span>
          <select
            className="select"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">选区润色 / 扩写（fast）</span>
          <select
            className="select"
            value={modelFast}
            onChange={(e) => setModelFast(e.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>

        {status ? (
          <p
            className={
              statusKind === 'error'
                ? 'status status-error'
                : 'status status-ok'
            }
            role="status"
          >
            {status}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!hydrated || pending !== null}
          >
            {pending === 'save' ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hydrated || pending !== null}
            onClick={() => void onTest()}
          >
            {pending === 'test' ? '探测中…' : '探测连接'}
          </button>
        </div>
      </form>
    </AppShell>
  )
}
