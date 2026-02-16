import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      await register({ username, email, password });
      toast.success('Registration successful!');
      navigate('/dashboard');
    } catch {
      toast.error(error || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-cream via-parchment to-warm-gray dark:from-navy-900 dark:via-navy-900 dark:to-navy-800">
      {/* Decorative compass rose - top left */}
      <div className="absolute top-8 left-8 w-32 h-32 opacity-5 dark:opacity-10 animate-float">
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
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-primary-600 dark:text-sky tracking-tight mb-3 drop-shadow-sm">
              Travel Life
            </h1>
            <p className="text-slate dark:text-warm-gray font-body text-sm italic tracking-wide">
              Begin your adventure today
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white/90 dark:bg-navy-800/90 backdrop-blur-sm rounded-2xl shadow-[0_8px_32px_rgba(43,90,127,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border-2 border-primary-500/10 dark:border-sky/10 p-4 sm:p-6 md:p-8">
            <h2 className="text-2xl font-display font-semibold text-center mb-8 text-primary-700 dark:text-sky">
              Create Your Account
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="username" className="label">
                  Name
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="John Doe"
                  minLength={3}
                  required
                />
              </div>

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
                  minLength={8}
                  required
                />
                <p className="text-xs text-slate/60 dark:text-warm-gray/60 mt-1 font-body">
                  Minimum 8 characters
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="label">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                {isLoading ? 'Creating account...' : 'Start Your Journey'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-primary-100 dark:border-navy-700">
              <p className="text-center text-sm text-slate dark:text-warm-gray font-body">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="text-primary-600 dark:text-sky font-semibold hover:text-accent-500 dark:hover:text-accent-400 transition-colors underline decoration-2 underline-offset-2"
                >
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
