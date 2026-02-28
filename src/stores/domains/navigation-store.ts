/**
 * Navigation Store
 * 
 * Handles UI navigation state: active tabs, sidebar, etc.
 * 
 * @module stores/domains/navigation
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

// ==================== STATE ====================

interface NavigationState {
  activeTab: string
  sidebarOpen: boolean
}

// ==================== ACTIONS ====================

interface NavigationActions {
  setActiveTab: (tab: string) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

// ==================== STORE ====================

export type NavigationStore = NavigationState & NavigationActions

export const useNavigationStore = create<NavigationStore>()(
  persist(
    (set) => ({
      // State
      activeTab: "dashboard",
      sidebarOpen: true,
      
      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: "citarion-navigation",
      partialize: (state) => ({
        activeTab: state.activeTab,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)

// ==================== SELECTORS ====================

export const selectActiveTab = (state: NavigationStore) => state.activeTab
export const selectSidebarOpen = (state: NavigationStore) => state.sidebarOpen

// ==================== EXPORTS ====================

export default useNavigationStore
