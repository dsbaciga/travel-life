/**
 * NavigationLayoutToggle Component
 *
 * A toggle button to switch between tab-based and sidebar navigation layouts.
 * Only shows on desktop screens where sidebar layout is practical.
 */

import { useNavigationStore } from '../store/navigationStore';

interface NavigationLayoutToggleProps {
  className?: string;
}

export default function NavigationLayoutToggle({
  className = '',
}: NavigationLayoutToggleProps) {
  const { layout, toggleLayout } = useNavigationStore();

  return (
    <button
      onClick={toggleLayout}
      className={`hidden md:flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
        layout === 'sidebar'
          ? 'bg-primary-50 dark:bg-gold/10 text-primary-600 dark:text-gold border-primary-200 dark:border-gold/30'
          : 'bg-gray-50 dark:bg-dusk-700 text-gray-600 dark:text-dusk-300 border-gray-200 dark:border-dusk-600 hover:bg-gray-100 dark:hover:bg-dusk-600'
      } ${className}`}
      title={layout === 'tabs' ? 'Switch to sidebar navigation' : 'Switch to tab navigation'}
      aria-label={layout === 'tabs' ? 'Switch to sidebar navigation' : 'Switch to tab navigation'}
    >
      {layout === 'tabs' ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          <span className="hidden lg:inline">Sidebar</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          <span className="hidden lg:inline">Tabs</span>
        </>
      )}
    </button>
  );
}
