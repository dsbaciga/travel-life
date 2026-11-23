import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Icon, { ICON_NAMES } from './Icon';

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(<Icon name="flight" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('20');
  });

  it('exposes a title as an accessible image', () => {
    render(<Icon name="delete" title="Delete trip" size={24} />);
    const img = screen.getByRole('img', { name: 'Delete trip' });
    expect(img.getAttribute('aria-hidden')).toBeNull();
    expect(img.getAttribute('height')).toBe('24');
  });

  it('merges className and uses currentColor glyphs', () => {
    const { container } = render(<Icon name="alert" className="text-red-500" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-red-500');
    expect(container.innerHTML).toContain('currentColor');
  });

  it('renders every registered name', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg'), name).not.toBeNull();
      unmount();
    }
  });
});
