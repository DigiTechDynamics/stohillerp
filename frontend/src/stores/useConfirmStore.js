import { create } from 'zustand'

export const useConfirmStore = create((set) => ({
  isOpen: false,
  title: 'Confirm Action',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  type: 'confirm', // 'info' | 'confirm' | 'danger'
  onConfirm: null,
  onCancel: null,

  confirm: (options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        title: options.title || 'Confirm Action',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        type: options.type || 'confirm',
        onConfirm: () => {
          set({ isOpen: false })
          resolve(true)
        },
        onCancel: () => {
          set({ isOpen: false })
          resolve(false)
        },
      })
    })
  },

  close: () => set({ isOpen: false }),
}))
