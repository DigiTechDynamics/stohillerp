// Stohill Properties - Authentication & App State Store
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tokens are never written to storage: the access token is kept in memory and
// the refresh token is an httpOnly cookie the API manages. After a reload the
// first API call gets a 401 and the client refreshes from the cookie.
export const useAuthStore = create()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      executiveMode: false,

      setAuth: (user, access) =>
        set((state) => ({
          user,
          accessToken: access,
          isAuthenticated: !!access,
          // The preference is stored on the user record; follow it on sign-in.
          executiveMode: user ? !!user.executive_mode : state.executiveMode,
        })),

      setAccessToken: (access) => set({ accessToken: access }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        }),

      setExecutiveMode: (on) => set({ executiveMode: !!on }),

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
      // v2: tokens are no longer stored; drop any that older versions left behind.
      version: 2,
      migrate: (persisted) => {
        const { accessToken: _access, refreshToken: _refresh, ...rest } = persisted || {}
        return rest
      },
      partialize: (state) => ({
        user: state.user,
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
