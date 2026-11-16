import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSaveAndAddAnother } from '../useSaveAndAddAnother';

/** Records, after an await, whether each submission was an "add another" one. */
function Harness({ seen, required = false }: { seen: boolean[]; required?: boolean }) {
  const addAnother = useSaveAndAddAnother();
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    addAnother.beginSubmit();
    await Promise.resolve();
    seen.push(addAnother.keepOpen());
  };
  return (
    <>
      <form id="harness" onSubmit={onSubmit}>
        <input aria-label="name" required={required} />
      </form>
      <button type="button" onClick={() => addAnother.submit(document.getElementById('harness'))}>
        another
      </button>
      <button type="submit" form="harness">
        plain
      </button>
    </>
  );
}

describe('useSaveAndAddAnother', () => {
  it('tells the submit it triggered to keep the form open, even after an await', async () => {
    const seen: boolean[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByText('another'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([true]);
  });

  it('does not carry the intent over to a later plain submit', async () => {
    const seen: boolean[] = [];
    render(<Harness seen={seen} />);
    await userEvent.click(screen.getByText('another'));
    await userEvent.click(screen.getByText('plain'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([true, false]);
  });

  it('does not arm anything when the browser rejects the form', async () => {
    const seen: boolean[] = [];
    render(<Harness seen={seen} required />);
    // Required field is empty: no submit happens at all.
    await userEvent.click(screen.getByText('another'));
    expect(seen).toEqual([]);

    await userEvent.type(screen.getByLabelText('name'), 'x');
    await userEvent.click(screen.getByText('plain'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([false]);
  });
});
