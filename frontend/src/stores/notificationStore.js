import { create } from 'zustand'
import { notificationsAPI } from '@/services/api'
import { useAuthStore } from './authStore'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  lastFetched: null,
  pollingInterval: null,

  fetchNotifications: async () => {
    if (!useAuthStore.getState().isAuthenticated) return

    set({ loading: true })
    try {
      const { data } = await notificationsAPI.list({ limit: 20 })
      set({ 
        notifications: data.results || data, 
        lastFetched: new Date(),
        loading: false 
      })
      get().fetchUnreadCount()
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  fetchUnreadCount: async () => {
    if (!useAuthStore.getState().isAuthenticated) return
    try {
      const { data } = await notificationsAPI.unreadCount()
      set({ unreadCount: data.unread_count })
    } catch (err) {
      console.error('Failed to fetch unread count', err)
    }
  },

  markAsRead: async (id) => {
    try {
      await notificationsAPI.markRead(id)
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }))
    } catch (err) {
      console.error('Failed to mark notification as read', err)
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationsAPI.markAllRead()
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0
      }))
    } catch (err) {
      console.error('Failed to mark all as read', err)
    }
  },

  startPolling: (intervalMs = 60000) => {
    if (get().pollingInterval) return
    
    // Initial fetch
    get().fetchNotifications()
    
    const interval = setInterval(() => {
      get().fetchNotifications()
    }, intervalMs)
    
    set({ pollingInterval: interval })
  },

  stopPolling: () => {
    if (get().pollingInterval) {
      clearInterval(get().pollingInterval)
      set({ pollingInterval: null })
    }
  }
}))
