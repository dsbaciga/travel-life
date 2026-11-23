import Icons from 'unplugin-icons/vite';

/**
 * Compiles `~icons/<collection>/<icon>` imports (see `src/components/ui/Icon.tsx`)
 * into small React components at build time, so every glyph is bundled and
 * tree-shaken and works offline in the PWA.
 *
 * unplugin-icons' built-in `jsx` compiler needs `@svgr/core`, which this project
 * does not install, so this is a tiny custom compiler. The glyph markup comes
 * from the pinned `@iconify-json/*` package at build time, never from user input.
 */
export function materialSymbols() {
  return Icons({
    compiler: {
      extension: 'js',
      compiler: (svg: string) => {
        const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
        const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1] ?? '';
        return [
          `import { createElement } from 'react';`,
          `const markup = { __html: ${JSON.stringify(inner)} };`,
          `export default function IconGlyph(props) {`,
          `  return createElement('svg', {`,
          `    xmlns: 'http://www.w3.org/2000/svg',`,
          `    viewBox: ${JSON.stringify(viewBox)},`,
          `    width: '1em',`,
          `    height: '1em',`,
          `    fill: 'currentColor',`,
          `    ...props,`,
          `    dangerouslySetInnerHTML: markup,`,
          `  });`,
          `}`,
        ].join('\n');
      },
    },
  });
}
