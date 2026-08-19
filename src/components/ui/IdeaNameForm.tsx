import { useEffect, useId, useRef, useState } from 'react'

import { BtnBusy } from '#/components/ui/BtnBusy'

export function IdeaNameForm({
  title,
  hint,
  submitLabel,
  initialName = '',
  initialDescription = '',
  showDescription = true,
  pending = false,
  onCancel,
  onSubmit,
}: {
  title: string
  hint?: string
  submitLabel: string
  initialName?: string
  initialDescription?: string | null
  showDescription?: boolean
  pending?: boolean
  onCancel?: () => void
  onSubmit: (data: {
    name: string
    description: string | null
  }) => void | Promise<void>
}) {
  const nameId = useId()
  const descId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  useEffect(() => {
    if (!onCancel) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  return (
    <form
      className="idea-name-form"
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || pending) return
        void onSubmit({
          name: trimmed,
          description: description.trim() ? description.trim() : null,
        })
      }}
    >
      <h3 className="section-title">{title}</h3>
      {hint ? <p className="meta mt-1">{hint}</p> : null}
      <label className="field mt-3" htmlFor={nameId}>
        <span className="field-label">名称</span>
        <input
          id={nameId}
          ref={nameRef}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="这篇叫什么"
          className="input"
          disabled={pending}
        />
      </label>
      {showDescription ? (
        <label className="field mt-2" htmlFor={descId}>
          <span className="field-label">一句话（可选）</span>
          <input
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这篇在谈什么"
            className="input"
            disabled={pending}
          />
        </label>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={pending}
          >
            取消
          </button>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={pending || !name.trim()}
          aria-busy={pending}
        >
          <BtnBusy busy={pending}>{submitLabel}</BtnBusy>
        </button>
      </div>
    </form>
  )
}
