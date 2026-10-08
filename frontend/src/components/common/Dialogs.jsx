// Stohill Properties - Application dialogs
//
// Promise-based replacements for window.alert / confirm / prompt, rendered as
// a centred modal in the app's own styling:
//
//   if (!(await confirmDialog({ title: 'Delete invoice?', message: '...', tone: 'danger' }))) return
//   await alertDialog({ title: 'Could not post', message: error })
//   const reason = await promptDialog({ title: 'Decline application', label: 'Reason' })  // null if cancelled
//
// <DialogHost /> is mounted once in main.jsx. Dialogs queue: a second request
// waits until the first one is answered.
import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { create } from 'zustand'
import { AlertTriangle, Info, HelpCircle } from 'lucide-react'

const useDialogStore = create((set) => ({
  queue: [],
  push: (dialog) => set((s) => ({ queue: [...s.queue, dialog] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}))

function open(kind, options) {
  const opts = typeof options === 'string' ? { message: options } : options || {}
  return new Promise((resolve) => useDialogStore.getState().push({ kind, ...opts, resolve }))
}

/** Resolves true when confirmed, false when cancelled. */
export const confirmDialog = (options) => open('confirm', options)
/** Resolves when dismissed. */
export const alertDialog = (options) => open('alert', options)
/** Resolves with the entered (or chosen) value, or null when cancelled. */
export const promptDialog = (options) => open('prompt', options)

const TONES = {
  danger: { icon: AlertTriangle, iconClass: 'text-rose-500 bg-rose-500/10', button: 'bg-rose-600 hover:bg-rose-700 text-[#fff]' },
  warning: { icon: AlertTriangle, iconClass: 'text-amber-500 bg-amber-500/10', button: '' },
  default: { icon: HelpCircle, iconClass: 'text-primary bg-primary/10', button: '' },
  info: { icon: Info, iconClass: 'text-primary bg-primary/10', button: '' },
}

export function DialogHost() {
  const current = useDialogStore((s) => s.queue[0])
  const shift = useDialogStore((s) => s.shift)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.defaultValue ?? (current.options?.[0]?.value ?? ''))
    }
  }, [current])

  if (!current) return null

  const { kind, title, message, confirmLabel, cancelLabel, options, label, placeholder, required, multiline } = current
  const tone = TONES[current.tone || (kind === 'alert' ? 'info' : 'default')] || TONES.default
  const Icon = tone.icon

  const finish = (result) => {
    current.resolve(result)
    shift()
  }
  const cancelResult = kind === 'confirm' ? false : kind === 'prompt' ? null : undefined
  const submit = (e) => {
    e?.preventDefault()
    if (kind === 'confirm') finish(true)
    else if (kind === 'prompt') {
      if (required && !String(value).trim()) return
      finish(value)
    } else finish(undefined)
  }

  const heading = title || (kind === 'confirm' ? 'Please confirm' : kind === 'prompt' ? 'Enter a value' : 'Notice')
  const okText = confirmLabel || (kind === 'confirm' ? 'Confirm' : 'OK')

  return (
    <Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen) finish(cancelResult) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          {...(message ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(e) => {
            if (kind === 'prompt') {
              e.preventDefault()
              inputRef.current?.focus()
            }
          }}
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2
                     rounded-2xl border border-white/10 bg-dark-800 p-6 shadow-2xl animate-fade-in focus:outline-none"
        >
          <form onSubmit={submit}>
            <div className="flex items-start gap-4">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tone.iconClass}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Dialog.Title className="text-base font-semibold text-white">{heading}</Dialog.Title>
                {message && (
                  <Dialog.Description className="whitespace-pre-line text-sm text-dark-400">{message}</Dialog.Description>
                )}
                {kind === 'prompt' && (
                  <div className="pt-2">
                    {label && <label className="form-label" htmlFor="app-dialog-input">{label}</label>}
                    {options ? (
                      <select id="app-dialog-input" ref={inputRef} className="form-input" value={value}
                        onChange={(e) => setValue(e.target.value)}>
                        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : multiline ? (
                      <textarea id="app-dialog-input" ref={inputRef} rows={3} className="form-input resize-none"
                        value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
                    ) : (
                      <input id="app-dialog-input" ref={inputRef} className="form-input" value={value}
                        type={current.inputType || 'text'} placeholder={placeholder}
                        onChange={(e) => setValue(e.target.value)} />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {kind !== 'alert' && (
                <button type="button" className="btn-secondary" onClick={() => finish(cancelResult)}>
                  {cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                type="submit"
                autoFocus={kind !== 'prompt'}
                disabled={kind === 'prompt' && required && !String(value).trim()}
                className={tone.button ? `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tone.button}` : 'btn-primary'}
              >
                {okText}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
