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
      rememberMe: false,
      executiveMode: false,

      setAuth: (user, access, refresh, rememberMe = false) =>
        set({
          user,
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: !!access,
          rememberMe,
        }),

      initializeAuth: () => {
        const { rememberMe, isAuthenticated } = get()
        if (!isAuthenticated) return

        // If NOT 'remember me', check if this is a new browser session
        if (!rememberMe) {
          const sessionActive = sessionStorage.getItem('stohill_session_active')
          if (!sessionActive) {
            // New session, user didn't want to be remembered
            get().logout()
            return
          }
        }
        
        // Mark session as active
        sessionStorage.setItem('stohill_session_active', 'true')
      },

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

      canEdit: () => {
        const { executiveMode, isAuthenticated } = get()
        return !!(isAuthenticated && executiveMode)
      },
    }),
    {
      name: 'stohill-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe,
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
