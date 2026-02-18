import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type NavigationLayout = 'tabs' | 'sidebar';

interface NavigationState {
  /** Current navigation layout preference */
  layout: NavigationLayout;
  /** Whether the sidebar is collapsed (only applies when layout is 'sidebar') */
  sidebarCollapsed: boolean;
  /** Set the navigation layout */
  setLayout: (layout: NavigationLayout) => void;
  /** Toggle between tabs and sidebar */
  toggleLayout: () => void;
  /** Toggle sidebar collapsed state */
  toggleSidebar: () => void;
  /** Set sidebar collapsed state */
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      layout: 'tabs',
      sidebarCollapsed: false,
      setLayout: (layout: NavigationLayout) => set({ layout }),
      toggleLayout: () =>
        set((state) => ({
          layout: state.layout === 'tabs' ? 'sidebar' : 'tabs',
        })),
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),
      setSidebarCollapsed: (collapsed: boolean) =>
        set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'navigation-storage',
    }
  )
);

// Selectors for granular subscriptions (prevents unnecessary re-renders)
export const useNavigationLayout = () => useNavigationStore((state) => state.layout);
export const useSidebarCollapsed = () => useNavigationStore((state) => state.sidebarCollapsed);
export const useSetLayout = () => useNavigationStore((state) => state.setLayout);
export const useToggleLayout = () => useNavigationStore((state) => state.toggleLayout);
export const useToggleSidebar = () => useNavigationStore((state) => state.toggleSidebar);
export const useSetSidebarCollapsed = () => useNavigationStore((state) => state.setSidebarCollapsed);

export default useNavigationStore;
