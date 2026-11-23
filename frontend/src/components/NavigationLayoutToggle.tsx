/**
 * NavigationLayoutToggle Component
 *
 * A toggle button to switch between tab-based and sidebar navigation layouts.
 * Only shows on desktop screens where sidebar layout is practical.
 */

import { useNavigationStore } from '../store/navigationStore';
import Icon from './ui/Icon';

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
          <Icon name="menu" size={16} />
          <span className="hidden lg:inline">Sidebar</span>
        </>
      ) : (
        <>
          <Icon name="list" size={16} />
          <span className="hidden lg:inline">Tabs</span>
        </>
      )}
    </button>
  );
}
