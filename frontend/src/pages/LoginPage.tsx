import { useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuthStore } from '../store/authStore';
import authService from '../services/auth.service';
import type { OidcConfig } from '../types/auth';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_denied: 'Single sign-on was cancelled.',
  oidc_invalid: 'Single sign-on session expired. Please try again.',
  oidc_failed: 'Single sign-on failed. Please try again.',
  oidc_disabled: 'Single sign-on is not enabled.',
  oidc_not_allowed: 'No account exists for this sign-in. Contact your administrator.',
  oidc_email_unverified:
    'Your identity provider did not report your email address as verified, so it cannot be linked to an existing account. Verify the email at your provider, or ask your administrator about OIDC_TRUST_EMAIL.',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oidcConfig, setOidcConfig] = useState<OidcConfig | null>(null);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    authService
      .getOidcConfig()
      .then(setOidcConfig)
      .catch(() => setOidcConfig(null)); // SSO button simply stays hidden
  }, []);

  // Surface errors from the OIDC callback redirect (?error=oidc_*)
  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (errorCode && errorCode.startsWith('oidc')) {
      toast.error(OIDC_ERROR_MESSAGES[errorCode] || 'Single sign-on failed.', { id: 'oidc-error' });
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const redirectParam = searchParams.get('redirect');
  const oidcLoginUrl = `${API_URL}/auth/oidc/login${
    redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ''
  }`;
  const ssoOnly = oidcConfig?.enabled === true && oidcConfig.passwordLoginDisabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login({ email, password });
      toast.success('Login successful!');
      // Navigate to redirect URL if provided, otherwise go to dashboard
      // Validate redirect to prevent open redirect attacks (only allow same-origin paths)
      const rawRedirect = searchParams.get('redirect') || '/dashboard';
      const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard';
      navigate(redirectUrl);
    } catch {
      toast.error(error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-cream via-parchment to-warm-gray dark:from-navy-900 dark:via-navy-900 dark:to-navy-800">
      {/* Decorative compass rose - top right */}
      <div className="absolute top-8 right-8 w-32 h-32 opacity-5 dark:opacity-10 animate-float">
        <svg viewBox="0 0 100 100" fill="currentColor" className="text-primary-500 dark:text-sky" aria-hidden="true">
          <circle cx="50" cy="50" r="2" />
          <path d="M50 10 L52 48 L50 50 L48 48 Z" />
          <path d="M90 50 L52 52 L50 50 L52 48 Z" />
          <path d="M50 90 L52 52 L50 50 L48 52 Z" />
          <path d="M10 50 L48 52 L50 50 L48 48 Z" />
          <path d="M75 25 L52 48 L50 50 L48 52 Z" opacity="0.5" />
          <path d="M75 75 L52 52 L50 50 L48 48 Z" opacity="0.5" />
          <path d="M25 75 L48 52 L50 50 L52 48 Z" opacity="0.5" />
          <path d="M25 25 L48 48 L50 50 L52 52 Z" opacity="0.5" />
        </svg>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Title with embossed effect */}
          <div className="text-center mb-8">
            <h1 className="flex justify-center mb-4">
              <BrandLogo className="h-16 sm:h-20" />
            </h1>
            <p className="text-slate dark:text-warm-gray font-body text-sm italic tracking-wide">
              Your journey begins here
            </p>
          </div>

          {/* Form card with refined styling */}
          <div className="bg-white/90 dark:bg-navy-800/90 backdrop-blur-sm rounded-2xl shadow-[0_8px_32px_rgba(43,90,127,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border-2 border-primary-500/10 dark:border-sky/10 p-4 sm:p-6 md:p-8">
            <h2 className="text-2xl font-display font-semibold text-center mb-8 text-primary-700 dark:text-sky">
              Welcome Back
            </h2>

            {/* SSO-only mode: the password form is hidden, but errors (e.g.
                from a failed SSO attempt) must still be visible */}
            {ssoOnly && error && (
              <div className="error-message bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
                {error}
              </div>
            )}

            {!ssoOnly && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="error-message bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Begin Your Journey'}
              </button>
            </form>
            )}

            {oidcConfig?.enabled && (
              <div className={ssoOnly ? '' : 'mt-6'}>
                {!ssoOnly && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-primary-100 dark:border-navy-700"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 bg-white/90 dark:bg-navy-800/90 text-sm text-slate dark:text-warm-gray font-body">
                        or
                      </span>
                    </div>
                  </div>
                )}

                <a href={oidcLoginUrl} className={ssoOnly ? 'btn-primary w-full block text-center' : 'btn-secondary w-full block text-center mt-6'}>
                  {oidcConfig.buttonText}
                </a>
              </div>
            )}

            {!ssoOnly && (
            <div className="mt-6 pt-6 border-t border-primary-100 dark:border-navy-700">
              <p className="text-center text-sm text-slate dark:text-warm-gray font-body">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-primary-600 dark:text-sky font-semibold hover:text-accent-500 dark:hover:text-accent-400 transition-colors underline decoration-2 underline-offset-2"
                >
                  Register
                </Link>
              </p>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
