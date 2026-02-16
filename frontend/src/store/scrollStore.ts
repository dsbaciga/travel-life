import { create } from 'zustand';

interface ScrollPositions {
  [key: string]: number;
}

interface PageNumbers {
  [key: string]: number;
}

interface PageStates {
  [key: string]: Record<string, unknown>;
}

interface ScrollState {
  /** Stored scroll positions by page key */
  positions: ScrollPositions;
  /** Stored page numbers by page key */
  pageNumbers: PageNumbers;
  /** Stored arbitrary page state (filters, view mode, etc.) by page key */
  pageStates: PageStates;
  /** Whether to skip the next scroll-to-top (for returning navigation) */
  skipNextScrollToTop: boolean;
  /** Save scroll position for a page */
  savePosition: (pageKey: string, position: number) => void;
  /** Get saved scroll position for a page */
  getPosition: (pageKey: string) => number;
  /** Save page number for a page */
  savePageNumber: (pageKey: string, page: number) => void;
  /** Get saved page number for a page */
  getPageNumber: (pageKey: string) => number;
  /** Save arbitrary page state (filters, view mode, etc.) */
  savePageState: (pageKey: string, state: Record<string, unknown>) => void;
  /** Get saved page state */
  getPageState: (pageKey: string) => Record<string, unknown> | undefined;
  /** Clear all saved state for a page (position, page number, and page state) */
  clearPosition: (pageKey: string) => void;
  /** Clear all saved scroll positions */
  clearAllPositions: () => void;
  /** Set whether to skip the next scroll-to-top */
  setSkipNextScrollToTop: (skip: boolean) => void;
}

export const useScrollStore = create<ScrollState>()((set, get) => ({
  positions: {},
  pageNumbers: {},
  pageStates: {},
  skipNextScrollToTop: false,
  savePosition: (pageKey: string, position: number) =>
    set((state) => ({
      positions: { ...state.positions, [pageKey]: position },
    })),
  getPosition: (pageKey: string) => get().positions[pageKey] || 0,
  savePageNumber: (pageKey: string, page: number) =>
    set((state) => ({
      pageNumbers: { ...state.pageNumbers, [pageKey]: page },
    })),
  getPageNumber: (pageKey: string) => get().pageNumbers[pageKey] || 1,
  savePageState: (pageKey: string, pageState: Record<string, unknown>) =>
    set((state) => ({
      pageStates: { ...state.pageStates, [pageKey]: pageState },
    })),
  getPageState: (pageKey: string) => get().pageStates[pageKey],
  clearPosition: (pageKey: string) =>
    set((state) => {
      const { [pageKey]: _removed, ...rest } = state.positions;
      const { [pageKey]: _removedPage, ...restPages } = state.pageNumbers;
      const { [pageKey]: _removedState, ...restStates } = state.pageStates;
      void _removed;
      void _removedPage;
      void _removedState;
      return { positions: rest, pageNumbers: restPages, pageStates: restStates };
    }),
  clearAllPositions: () => set({ positions: {}, pageNumbers: {}, pageStates: {} }),
  setSkipNextScrollToTop: (skip: boolean) =>
    set({ skipNextScrollToTop: skip }),
}));

export default useScrollStore;
