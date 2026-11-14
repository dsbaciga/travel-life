/**
 * Label splitting tests
 *
 * Test cases:
 * - LABEL-001: A leading emoji is separated from the words after it
 * - LABEL-002: Labels without a leading emoji are returned untouched
 * - LABEL-003: Variation selectors and joined sequences stay with the icon
 * - LABEL-004: An emoji-only label is not split, and an empty label is safe
 * - LABEL-005: An emoji in the middle of a label is not touched
 */
import { describe, expect, it } from 'vitest';
import { splitLeadingEmoji } from '../labels';

describe('splitLeadingEmoji', () => {
  it('LABEL-001: separates a leading emoji from the words', () => {
    expect(splitLeadingEmoji('💬 Phrasebook')).toEqual({ icon: '💬', text: 'Phrasebook' });
    expect(splitLeadingEmoji('🚗 Where I parked')).toEqual({ icon: '🚗', text: 'Where I parked' });
    expect(splitLeadingEmoji('📍 Use current GPS location')).toEqual({
      icon: '📍',
      text: 'Use current GPS location',
    });
  });

  it('LABEL-002: leaves plain labels untouched', () => {
    expect(splitLeadingEmoji('Sync now')).toEqual({ icon: null, text: 'Sync now' });
    expect(splitLeadingEmoji('+ Add another photo')).toEqual({ icon: null, text: '+ Add another photo' });
    expect(splitLeadingEmoji('‹')).toEqual({ icon: null, text: '‹' });
  });

  it('LABEL-003: keeps variation selectors and joined sequences with the icon', () => {
    expect(splitLeadingEmoji('☀️ Today')).toEqual({ icon: '☀️', text: 'Today' });
    expect(splitLeadingEmoji('👨‍👩‍👧 Family')).toEqual({ icon: '👨‍👩‍👧', text: 'Family' });
  });

  it('LABEL-004: does not split an emoji-only label; empty is safe', () => {
    expect(splitLeadingEmoji('💬')).toEqual({ icon: null, text: '💬' });
    expect(splitLeadingEmoji('')).toEqual({ icon: null, text: '' });
  });

  it('LABEL-005: does not touch an emoji in the middle', () => {
    expect(splitLeadingEmoji('Photos 📷')).toEqual({ icon: null, text: 'Photos 📷' });
  });
});
