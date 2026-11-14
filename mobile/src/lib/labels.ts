/**
 * Split a leading emoji off a label ("💬 Phrasebook" -> icon "💬", text "Phrasebook").
 *
 * Android text layout can drop the words that follow a leading emoji when the
 * device's emoji font misbehaves (seen on a Samsung phone: the button kept its
 * width but drew no text). Drawing the icon and the words as separate Text
 * nodes keeps a bad glyph from taking the label down with it.
 *
 * Done by code point rather than with `\p{Extended_Pictographic}` so it does not
 * depend on the JS engine's Unicode property support.
 */

const VARIATION_SELECTOR_16 = 0xfe0f;
const ZERO_WIDTH_JOINER = 0x200d;

function isPictographic(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) || // emoji and pictograph blocks
    (codePoint >= 0x2600 && codePoint <= 0x27bf) || // misc symbols and dingbats
    (codePoint >= 0x2b00 && codePoint <= 0x2bff) // arrows and stars some emoji live in
  );
}

export interface SplitLabel {
  /** The leading emoji (with any variation selector or joined parts), or null. */
  icon: string | null;
  /** The label without the emoji and the space after it. */
  text: string;
}

export function splitLeadingEmoji(label: string): SplitLabel {
  const first = label.codePointAt(0);
  if (first === undefined || !isPictographic(first)) return { icon: null, text: label };

  let end = first > 0xffff ? 2 : 1;
  // Keep a variation selector and any zero-width-joined parts (family, flag-like sequences).
  for (;;) {
    const next = label.codePointAt(end);
    if (next === VARIATION_SELECTOR_16) {
      end += 1;
    } else if (next === ZERO_WIDTH_JOINER) {
      const joined = label.codePointAt(end + 1);
      if (joined === undefined || !isPictographic(joined)) break;
      end += 1 + (joined > 0xffff ? 2 : 1);
    } else {
      break;
    }
  }

  const text = label.slice(end).trimStart();
  // A label that is only an emoji stays as it is: there are no words to protect.
  return text === '' ? { icon: null, text: label } : { icon: label.slice(0, end), text };
}
