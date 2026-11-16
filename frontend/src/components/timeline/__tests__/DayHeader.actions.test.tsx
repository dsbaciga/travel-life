/**
 * Timeline day header - per-day actions
 *
 * Test cases:
 * - DHA-001: The day journal actions render in the header and report the day they were given (YYYY-MM-DD)
 * - DHA-002: A view-only user gets nothing in the header
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DayHeader from '../DayHeader';
import { DayJournalActions } from '../../journal/DayJournalComposer';

const stats = { activities: 0, transportation: 0, lodging: 0, journal: 0, customItems: 0, totalPhotosLinked: 0 };

const renderHeader = (canEdit: boolean, onOpen = vi.fn()) => {
  render(
    <DayHeader
      date="Tue, Jun 2, 2026"
      dayNumber={2}
      stats={stats}
      eventCount={0}
      isCollapsed={false}
      onToggleCollapse={() => undefined}
      actions={
        <DayJournalActions day="2026-06-02" canEdit={canEdit} canDraftOn={() => true} onOpen={onOpen} />
      }
    />
  );
  return onOpen;
};

describe('DayHeader actions', () => {
  it('DHA-001: opens the form for the day it was given', () => {
    const onOpen = renderHeader(true);
    fireEvent.click(screen.getByRole('button', { name: /add journal entry/i }));
    expect(onOpen).toHaveBeenLastCalledWith('2026-06-02', false);
    fireEvent.click(screen.getByRole('button', { name: /draft with ai/i }));
    expect(onOpen).toHaveBeenLastCalledWith('2026-06-02', true);
  });

  it('DHA-002: view-only users see no actions', () => {
    renderHeader(false);
    expect(screen.queryByRole('button', { name: /journal entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /draft with ai/i })).not.toBeInTheDocument();
  });
});
