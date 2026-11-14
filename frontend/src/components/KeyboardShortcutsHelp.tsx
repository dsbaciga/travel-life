/**
 * Keyboard Shortcuts Help Modal
 *
 * Displays all available keyboard shortcuts in a modal.
 * Triggered by pressing `?` key.
 */

import { useKeyboardShortcuts, getShortcutDisplay } from '../hooks/useKeyboardShortcuts';
import type { KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

export default function KeyboardShortcutsHelp() {
  const { showHelp, setShowHelp, shortcuts } = useKeyboardShortcuts();

  if (!showHelp) return null;

  // Built-in shortcuts that are always available
  const builtInShortcuts: KeyboardShortcut[] = [
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      action: () => {},
      category: 'General',
    },
    {
      key: 'Escape',
      description: 'Close modals and forms',
      action: () => {},
      category: 'Navigation',
    },
  ];

  // Combine and categorize all shortcuts
  const allShortcuts = [...builtInShortcuts, ...shortcuts];
  const categories = Array.from(new Set(allShortcuts.map((s) => s.category || 'General')));

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="bg-white dark:bg-navy-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-navy-800 border-b border-gray-200 dark:border-dusk-700 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-white">
                Keyboard Shortcuts
              </h2>
              <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1">
                Boost your productivity with these shortcuts
              </p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dusk-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6 text-gray-500 dark:text-dusk-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 space-y-6">
          {categories.map((category) => {
            const categoryShortcuts = allShortcuts.filter(
              (s) => (s.category || 'General') === category
            );

            if (categoryShortcuts.length === 0) return null;

            return (
              <div key={category}>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 font-display">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={`${shortcut.key}-${index}`}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dusk-700/50 rounded-lg"
                    >
                      <span className="text-sm text-gray-700 dark:text-dusk-300 font-body">
                        {shortcut.description}
                      </span>
                      <kbd className="px-3 py-1.5 bg-white dark:bg-dusk-800 border border-gray-300 dark:border-dusk-600 rounded-md text-sm font-mono font-semibold text-gray-900 dark:text-white shadow-sm">
                        {getShortcutDisplay(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* No shortcuts message */}
          {shortcuts.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-dusk-400">
                No page-specific shortcuts available. Navigate to different pages to see more shortcuts.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-dusk-700/50 border-t border-gray-200 dark:border-dusk-700 p-4 rounded-b-2xl">
          <p className="text-xs text-center text-gray-600 dark:text-dusk-400">
            Press <kbd className="px-2 py-1 bg-white dark:bg-dusk-800 border border-gray-300 dark:border-dusk-600 rounded text-xs font-mono">?</kbd> anytime to show this help,{' '}
            <kbd className="px-2 py-1 bg-white dark:bg-dusk-800 border border-gray-300 dark:border-dusk-600 rounded text-xs font-mono">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
