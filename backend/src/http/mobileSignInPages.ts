import crypto from 'crypto';
import { Response } from 'express';

/**
 * Server-rendered pages for the mobile SSO hand-off. They are shown in the
 * system browser the companion app opened, between the identity provider and
 * the redirect back to the app's URL scheme.
 *
 * The pages run no script and load nothing external, so the policy can be as
 * tight as CSP allows.
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STYLES = `
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f5f5f4; color: #1c1917; }
  main { width: 100%; max-width: 24rem; margin: 1rem; padding: 1.5rem; border-radius: 1rem; background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
  h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
  p { margin: 0 0 1rem; line-height: 1.5; }
  .account { font-weight: 600; overflow-wrap: anywhere; }
  .note { font-size: 0.875rem; opacity: 0.75; }
  button { display: block; width: 100%; margin-top: 0.75rem; padding: 0.875rem 1rem; border-radius: 0.75rem;
    font: inherit; font-weight: 600; cursor: pointer; }
  .primary { border: 0; background: #2563eb; color: #fff; }
  .secondary { border: 1px solid #a8a29e; background: transparent; color: inherit; }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1917; color: #f5f5f4; }
    main { background: #292524; }
  }
`;

/**
 * Headers shared by every page here: never cached, never framed, nothing loaded
 * or executed beyond the one nonce'd stylesheet. These replace the app-wide
 * helmet policy, which is written for the SPA and is looser.
 *
 * @param formAction - Sources the page's form may submit (and be redirected) to
 */
const applyPageHeaders = (res: Response, styleNonce: string, formAction: string): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `style-src 'nonce-${styleNonce}'`,
      `form-action ${formAction}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; ')
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
};

const renderDocument = (title: string, styleNonce: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style nonce="${styleNonce}">${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;

export interface MobileConfirmPageOptions {
  /** Account the identity provider authenticated. */
  email: string;
  /** Single-use nonce for the pending sign-in; the form's credential. */
  nonce: string;
  /** Path the form posts to, relative to the current URL. */
  formAction: string;
  /**
   * The app's URL scheme, e.g. `travellife:`. Chromium applies `form-action`
   * to the redirect that follows a form submission, so the scheme the confirm
   * handler redirects to has to be allowed alongside `'self'`.
   */
  appScheme: string;
}

/**
 * "Sign in to the Travel Life app as <email>?" with Continue and Cancel.
 */
export const sendMobileConfirmPage = (res: Response, options: MobileConfirmPageOptions): void => {
  const styleNonce = crypto.randomBytes(16).toString('base64');
  applyPageHeaders(res, styleNonce, `'self' ${options.appScheme}`);
  res.status(200).send(
    renderDocument(
      'Sign in to Travel Life',
      styleNonce,
      `<h1>Sign in to the Travel Life app?</h1>
<p>The Travel Life app on this device will be signed in as <span class="account">${escapeHtml(options.email)}</span>.</p>
<p class="note">Only continue if you just started signing in from the Travel Life app.</p>
<form method="post" action="${escapeHtml(options.formAction)}">
<input type="hidden" name="nonce" value="${escapeHtml(options.nonce)}">
<button class="primary" type="submit" name="action" value="continue">Continue</button>
<button class="secondary" type="submit" name="action" value="cancel">Cancel</button>
</form>`
    )
  );
};

/**
 * Dead end for a confirmation that cannot proceed (stale, reused or malformed
 * nonce). Nothing is redirected to the app: there is no pending sign-in to
 * report on, and the user can simply close the browser.
 */
export const sendMobileSignInErrorPage = (res: Response, statusCode: number, message: string): void => {
  const styleNonce = crypto.randomBytes(16).toString('base64');
  applyPageHeaders(res, styleNonce, "'none'");
  res.status(statusCode).send(
    renderDocument(
      'Sign-in not completed',
      styleNonce,
      `<h1>Sign-in not completed</h1>
<p>${escapeHtml(message)}</p>
<p class="note">Close this window, return to the Travel Life app and try again.</p>`
    )
  );
};
