/**
 * TripSidebar Component
 *
 * A collapsible sidebar navigation alternative to the TabGroup.
 * Provides a desktop-friendly sidebar with expandable sections.
 */

import { useState, useEffect } from 'react';
import type { TabGroupItem, SubTab } from './TabGroup';
import { useNavigationStore } from '../store/navigationStore';

interface TripSidebarProps {
  tabs: TabGroupItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export default function TripSidebar({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: TripSidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useNavigationStore();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Auto-expand the group containing the active tab
  useEffect(() => {
    const activeGroup = tabs.find(
      (tab) =>
        tab.id === activeTab ||
        tab.subTabs?.some((sub) => sub.id === activeTab)
    );
    if (!activeGroup) return;
    // Check membership inside the updater so the effect doesn't read
    // `expandedGroups` and can declare a complete dependency list. Returning
    // `prev` unchanged when already expanded avoids a redundant re-render.
    setExpandedGroups((prev) =>
      prev.has(activeGroup.id) ? prev : new Set([...prev, activeGroup.id])
    );
  }, [activeTab, tabs]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const isTabActive = (tab: TabGroupItem | SubTab): boolean => {
    if ('subTabs' in tab && tab.subTabs) {
      return tab.subTabs.some((sub) => sub.id === activeTab);
    }
    return tab.id === activeTab;
  };

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

  const handleTabClick = (tab: TabGroupItem) => {
    if (tab.subTabs && tab.subTabs.length > 0) {
      // Toggle expansion and select first sub-tab if not already active
      toggleGroup(tab.id);
      if (!isTabActive(tab)) {
        onTabChange(tab.subTabs[0].id);
      }
    } else {
      onTabChange(tab.id);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-dusk-800 border-r border-gray-200 dark:border-dusk-700 flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-48 lg:w-64'
      } ${className}`}
    >
      {/* Collapse Toggle */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-dusk-700">
        {!sidebarCollapsed && (
          <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
            Navigation
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700 transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-5 h-5 text-gray-500 dark:text-dusk-400 transition-transform ${
              sidebarCollapsed ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Trip sections">
        {tabs.map((tab) => {
          const isActive = isTabActive(tab);
          const isExpanded = expandedGroups.has(tab.id);
          const count = getGroupCount(tab);
          const subTabs = tab.subTabs ?? [];
          const hasSubTabs = subTabs.length > 0;

          return (
            <div key={tab.id}>
              {/* Main Tab Item */}
              <button
                onClick={() => handleTabClick(tab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-primary-50 dark:bg-gold/10 text-primary-600 dark:text-gold border-r-2 border-primary-500 dark:border-gold'
                    : 'text-gray-700 dark:text-dusk-300 hover:bg-gray-50 dark:hover:bg-dusk-700/50'
                }`}
                title={sidebarCollapsed ? tab.label : undefined}
              >
                <span className="w-5 h-5 flex-shrink-0">{tab.icon}</span>

                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 font-medium truncate">
                      {tab.label}
                    </span>

                    {count > 0 && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          isActive
                            ? 'bg-primary-100 dark:bg-gold/20 text-primary-700 dark:text-gold'
                            : 'bg-gray-100 dark:bg-dusk-700 text-gray-600 dark:text-dusk-400'
                        }`}
                      >
                        {count}
                      </span>
                    )}

                    {hasSubTabs && (
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </>
                )}
              </button>

              {/* Sub-tabs (only show when expanded and not collapsed) */}
              {hasSubTabs && isExpanded && !sidebarCollapsed && (
                <div className="ml-8 border-l border-gray-200 dark:border-dusk-700">
                  {subTabs.map((subTab) => {
                    const isSubActive = subTab.id === activeTab;

                    return (
                      <button
                        key={subTab.id}
                        onClick={() => onTabChange(subTab.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          isSubActive
                            ? 'bg-primary-50 dark:bg-gold/10 text-primary-600 dark:text-gold font-medium'
                            : 'text-gray-600 dark:text-dusk-400 hover:bg-gray-50 dark:hover:bg-dusk-700/50 hover:text-gray-900 dark:hover:text-dusk-200'
                        }`}
                      >
                        {subTab.icon && (
                          <span className="w-4 h-4 flex-shrink-0">
                            {subTab.icon}
                          </span>
                        )}
                        <span className="flex-1 truncate">{subTab.label}</span>
                        {subTab.count !== undefined && subTab.count > 0 && (
                          <span
                            className={`px-1.5 py-0.5 text-xs rounded-full ${
                              isSubActive
                                ? 'bg-primary-100 dark:bg-gold/20 text-primary-700 dark:text-gold'
                                : 'bg-gray-100 dark:bg-dusk-600 text-gray-500 dark:text-dusk-400'
                            }`}
                          >
                            {subTab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

    </div>
  );
}
