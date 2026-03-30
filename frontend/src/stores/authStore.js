// Stohill Properties - Authentication & App State Store
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      executiveMode: false,

      setAuth: (user, access, refresh) =>
        set({
          user,
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: !!access,
        }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),

      toggleExecutiveMode: () =>
        set((state) => ({ executiveMode: !state.executiveMode })),

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        // Super admin has all permissions
        if (user.roles?.some((r) => r.role_type === 'super_admin')) return true
        return user.roles?.some((r) => r[permission] === true)
      },
    }),
    {
      name: 'stohill-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        executiveMode: state.executiveMode,
      }),
    }
  )
)

// UI State (persisted for theme, rest is session-only)
export const useUIStore = create()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      activeSidePanel: null,
      sidePanelData: null,
      theme: 'dark', // 'dark' | 'light'

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      openSidePanel: (panelId, data) => set({ activeSidePanel: panelId, sidePanelData: data || null }),
      closeSidePanel: () => set({ activeSidePanel: null, sidePanelData: null }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'stohill-ui',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
)
