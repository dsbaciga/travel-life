import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoLightbox from '../PhotoLightbox';
import type { Photo } from '../../types/photo';

vi.mock('../../hooks/useTripLinkSummary', () => ({
  useTripLinkSummary: () => ({ getLinkSummary: () => undefined, invalidate: vi.fn() }),
}));
vi.mock('../LinkButton', () => ({ default: () => null }));
vi.mock('../LinkedEntitiesDisplay', () => ({ default: () => null }));
vi.mock('../PhotoDetailsPanel', () => ({ default: () => null }));
vi.mock('../FavoriteStarButton', () => ({ default: () => null }));

const LONG_CAPTION = 'A very long caption about the trip '.repeat(6);

function makePhoto(id: number, caption: string | null = null): Photo {
  return { id, caption, mediaType: 'image', source: 'local' } as unknown as Photo;
}

function renderLightbox(overrides: Partial<React.ComponentProps<typeof PhotoLightbox>> = {}) {
  const photos = [makePhoto(1, LONG_CAPTION), makePhoto(2), makePhoto(3)];
  const props = {
    photo: photos[0],
    photos,
    getPhotoUrl: () => '/x.jpg',
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  };
  render(<PhotoLightbox {...props} />);
  return props;
}

describe('PhotoLightbox header', () => {
  it('lets a long caption shrink and wrap so Close stays on screen', () => {
    renderLightbox();
    const caption = screen.getByRole('button', { name: LONG_CAPTION.trim() });
    expect(caption.className).toContain('line-clamp-2');
    expect(caption.className).toContain('[overflow-wrap:anywhere]');
    expect(caption.parentElement?.className).toContain('min-w-0');
    expect(caption.parentElement?.className).toContain('flex-1');
    expect(screen.getByLabelText('Close lightbox').className).toContain('flex-shrink-0');
  });

  it('expands the full caption on tap', () => {
    renderLightbox();
    const caption = screen.getByRole('button', { name: LONG_CAPTION.trim() });
    fireEvent.click(caption);
    expect(caption.getAttribute('aria-expanded')).toBe('true');
    expect(caption.className).not.toContain('line-clamp-2');
  });

  it('uses a real bullet in the keyboard hint', () => {
    renderLightbox();
    expect(document.body.textContent).not.toContain('&bull;');
    expect(document.body.textContent).toContain('Navigate • ');
  });
});

describe('PhotoLightbox touch gestures', () => {
  function touch(el: Element, type: string, x: number, y: number) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    el.dispatchEvent(event);
  }

  it('navigates to the next photo on a left swipe', () => {
    const props = renderLightbox();
    const container = screen.getByRole('dialog').firstElementChild as HTMLElement;
    container.setPointerCapture = vi.fn();
    touch(container, 'pointerdown', 300, 300);
    touch(container, 'pointermove', 200, 305);
    touch(container, 'pointerup', 150, 305);
    expect(props.onNavigate).toHaveBeenCalledWith(props.photos[1]);
  });

  it('closes on a tap of the backdrop', () => {
    const props = renderLightbox();
    const container = screen.getByRole('dialog').firstElementChild as HTMLElement;
    container.setPointerCapture = vi.fn();
    touch(container, 'pointerdown', 20, 20);
    touch(container, 'pointerup', 20, 20);
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(container);
    expect(props.onClose).toHaveBeenCalled();
  });
});
