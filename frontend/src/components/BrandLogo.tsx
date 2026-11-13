import logoLight from '../assets/brand/travel-life-logo-horizontal.svg';
import logoDark from '../assets/brand/travel-life-logo-horizontal-on-dark.svg';
import markLight from '../assets/brand/travel-life-mark.svg';
import markDark from '../assets/brand/travel-life-mark-on-dark.svg';

interface BrandLogoProps {
  /** `full` is the mark plus the wordmark; `mark` is the symbol alone. */
  variant?: 'full' | 'mark';
  /** Sizing classes. Set a height; the width follows the artwork. */
  className?: string;
}

/**
 * The Travel Life logo. The artwork comes from `branding/logo` and has
 * separate light and dark renderings, so both are emitted and the theme
 * class picks one. The pair is exposed to assistive tech as one image.
 */
export default function BrandLogo({ variant = 'full', className = 'h-8' }: BrandLogoProps) {
  const light = variant === 'full' ? logoLight : markLight;
  const dark = variant === 'full' ? logoDark : markDark;

  return (
    <span role="img" aria-label="Travel Life" className="inline-flex">
      <img src={light} alt="" className={`${className} w-auto dark:hidden`} />
      <img src={dark} alt="" className={`${className} w-auto hidden dark:block`} />
    </span>
  );
}
