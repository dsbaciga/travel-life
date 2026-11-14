import { useState, useEffect, useRef, useCallback } from "react";

export interface SubTab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  /**
   * Omit this sub-tab's count from its parent group's total. Set it on sub-tabs
   * that re-present items already counted by a sibling — e.g. "Unscheduled",
   * which is a filtered view of Activities/Transport/Lodging — so the group
   * badge doesn't count the same item twice.
   */
  excludeFromGroupCount?: boolean;
}

export interface TabGroupItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  subTabs?: SubTab[];
  count?: number;
}

interface TabGroupProps {
  tabs: TabGroupItem[];
  activeTab: string;
  onTabChange: (tabId: string, subTabId?: string) => void;
  className?: string;
}

export default function TabGroup({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: TabGroupProps) {
  const [expandedTab, setExpandedTab] = useState<string | null>(activeTab);

  // Sync expanded tab with active tab
  useEffect(() => {
    setExpandedTab(activeTab);
  }, [activeTab]);

  // The tab strip scrolls horizontally on narrow screens. A right-edge fade is
  // the only cue that more tabs follow, so it has to disappear once the strip
  // is scrolled to the end — a permanent fade would imply tabs that aren't there.
  const stripRef = useRef<HTMLElement>(null);
  const [hasOverflowRight, setHasOverflowRight] = useState(false);

  const updateOverflow = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // 1px tolerance: fractional scroll widths never settle exactly on the end.
    setHasOverflowRight(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateOverflow();
    const strip = stripRef.current;
    if (!strip) return;

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [updateOverflow, tabs]);

  // Keep the active tab reachable without hunting: scroll it into view whenever
  // it changes from elsewhere (URL, sidebar, capture sheet).
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-tab-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  // Calculate total count for a tab group
  const getGroupCount = (tab: TabGroupItem): number => {
    if (tab.count !== undefined) return tab.count;
    if (tab.subTabs) {
      return tab.subTabs.reduce(
        (sum, sub) => (sub.excludeFromGroupCount ? sum : sum + (sub.count || 0)),
        0
      );
    }
    return 0;
  };

  // Check if a tab or any of its sub-tabs is active
  const isTabActive = (tab: TabGroupItem): boolean => {
    if (tab.id === activeTab) return true;
    if (tab.subTabs) {
      return tab.subTabs.some((sub) => sub.id === activeTab);
    }
    return false;
  };

  // Handle main tab click
  const handleTabClick = (tab: TabGroupItem) => {
    if (tab.subTabs && tab.subTabs.length > 0) {
      // If clicking an already expanded tab, toggle it
      if (expandedTab === tab.id) {
        // Don't collapse, just select the first sub-tab
        onTabChange(tab.subTabs[0].id);
      } else {
        // Expand and select first sub-tab
        setExpandedTab(tab.id);
        onTabChange(tab.subTabs[0].id);
      }
    } else {
      // No sub-tabs, just select the tab
      setExpandedTab(null);
      onTabChange(tab.id);
    }
  };

  // Handle sub-tab click
  const handleSubTabClick = (subTabId: string) => {
    onTabChange(subTabId);
  };

  return (
    <div className={`bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-primary-500/10 dark:border-gold/20 overflow-hidden ${className}`}>
      <div>
        {/* Main Tab Navigation — scrolls horizontally on narrow screens rather
            than collapsing to a dropdown, so every destination stays one tap
            away and counts remain visible without opening a picker. */}
        <div className="relative">
          <nav
            ref={stripRef}
            onScroll={updateOverflow}
            className="flex overflow-x-auto scrollbar-hide border-b-2 border-primary-500/10 dark:border-gold/20"
          >
            {tabs.map((tab) => {
              const isActive = isTabActive(tab);
              const groupCount = getGroupCount(tab);

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab)}
                  data-tab-active={isActive}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex-none md:flex-1 min-h-[44px] py-3 md:py-4 px-4 text-sm font-body font-medium relative flex flex-col items-center gap-1 whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "text-primary-600 dark:text-gold bg-primary-50/50 dark:bg-gold/5"
                      : "text-slate dark:text-warm-gray hover:text-primary-600 dark:hover:text-gold hover:bg-parchment dark:hover:bg-navy-700/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 hidden sm:block">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {groupCount > 0 && (
                      <span
                        className={`ml-1 px-2 py-0.5 text-xs rounded-full transition-colors ${
                          isActive
                            ? "bg-primary-100 dark:bg-gold/20 text-primary-700 dark:text-gold"
                            : "bg-gray-100 dark:bg-dusk-700 text-gray-600 dark:text-dusk-400"
                        }`}
                      >
                        {groupCount}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary-500 to-accent-400 dark:from-gold dark:to-accent-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {hasOverflowRight && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white dark:from-navy-800 to-transparent"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Sub-Tab Navigation (if applicable) */}
        {tabs.map((tab) => {
          if (!tab.subTabs || !isTabActive(tab)) return null;

          return (
            <div
              key={`${tab.id}-subtabs`}
              className="flex items-center gap-1 px-4 py-2 bg-parchment/50 dark:bg-navy-900/50 border-b border-primary-100 dark:border-gold/15 overflow-x-auto scrollbar-hide"
            >
              {tab.subTabs.map((subTab) => {
                const isSubActive = subTab.id === activeTab;

                return (
                  <button
                    key={subTab.id}
                    onClick={() => handleSubTabClick(subTab.id)}
                    data-tab-active={isSubActive}
                    aria-current={isSubActive ? "page" : undefined}
                    className={`flex-none min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
                      isSubActive
                        ? "bg-white dark:bg-navy-700 text-primary-600 dark:text-gold shadow-sm"
                        : "text-slate dark:text-warm-gray/70 hover:text-primary-600 dark:hover:text-gold hover:bg-white/60 dark:hover:bg-navy-700/60"
                    }`}
                  >
                    {subTab.icon && (
                      <span className="w-4 h-4">{subTab.icon}</span>
                    )}
                    <span>{subTab.label}</span>
                    {subTab.count !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded-full ${
                          isSubActive
                            ? "bg-primary-100 dark:bg-gold/20 text-primary-700 dark:text-gold"
                            : "bg-primary-100/60 dark:bg-navy-700 text-slate dark:text-warm-gray/60"
                        }`}
                      >
                        {subTab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
