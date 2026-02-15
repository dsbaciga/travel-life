import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
        <svg viewBox="0 0 100 100" fill="currentColor" className="text-primary-500 dark:text-sky">
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
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-primary-600 dark:text-sky tracking-tight mb-3 drop-shadow-sm">
              Travel Life
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
          </div>
        </div>
      </div>
    </div>
  );
}
