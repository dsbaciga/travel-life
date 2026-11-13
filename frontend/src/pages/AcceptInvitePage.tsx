import { useState, useEffect, useId, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { isAxiosError } from 'axios';
import userInvitationService from '../services/userInvitation.service';
import { useAuthStore } from '../store/authStore';
import type { UserInvitationPublicInfo } from '../types/userInvitation';
import toast from 'react-hot-toast';

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const token = searchParams.get('token');
  // Validate token format client-side before making API calls
  const isValidTokenFormat = token && /^[a-f0-9]{64}$/.test(token);

  const [invitation, setInvitation] = useState<UserInvitationPublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form IDs for accessibility
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  const loadInvitation = useCallback(async () => {
    if (!token) return;

    try {
      const data = await userInvitationService.getInvitationByToken(token);
      setInvitation(data);
      setEmail(data.email); // Pre-fill email from invitation
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        setError(error.response?.data?.message || 'Invitation not found or has expired.');
      } else {
        setError('Invitation not found or has expired.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link. No token provided.');
      setLoading(false);
      return;
    }

    if (!isValidTokenFormat) {
      setError('Invalid invitation link format.');
      setLoading(false);
      return;
    }

    loadInvitation();
  }, [token, isValidTokenFormat, loadInvitation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error('Invalid invitation link');
      return;
    }

    if (!username.trim()) {
      toast.error('Please enter a username');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await userInvitationService.acceptInvitation({
        token,
        username: username.trim(),
        email,
        password,
      });

      // Log the user in with the credentials they just created
      await login({ email, password });

      toast.success('Account created successfully! Welcome to Travel Life!');
      navigate('/dashboard');
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to create account');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!token) {
      toast.error('Invalid invitation link');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to decline this invitation? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
      await userInvitationService.declineInvitation(token);
      toast.success('Invitation declined');
      navigate('/');
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to decline invitation');
      } else {
        toast.error('Failed to decline invitation');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-navy-600 dark:text-dusk-200">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-xl p-8">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white mb-2">
              Invalid Invitation
            </h1>
            <p className="text-navy-600 dark:text-dusk-300 mb-6">
              {error || 'This invitation is no longer valid.'}
            </p>
            <Link
              to="/login"
              className="btn btn-primary inline-block"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!invitation.isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-xl p-8">
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white mb-2">
              {invitation.status === 'EXPIRED' ? 'Invitation Expired' : 'Invitation Already Used'}
            </h1>
            <p className="text-navy-600 dark:text-dusk-300 mb-6">
              {invitation.status === 'EXPIRED'
                ? 'This invitation has expired. Please ask the person who invited you to send a new invitation.'
                : invitation.status === 'ACCEPTED'
                ? 'This invitation has already been accepted. You can log in to your account.'
                : 'This invitation has been declined.'}
            </p>
            <Link
              to="/login"
              className="btn btn-primary inline-block"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900 px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white mb-2">
              You're Invited!
            </h1>
            {invitation.invitedBy && (
              <p className="text-navy-600 dark:text-dusk-300">
                <span className="font-semibold">{invitation.invitedBy.username}</span> invited you to join Travel Life
              </p>
            )}
          </div>

          {/* Description */}
          <div className="bg-cream dark:bg-navy-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-navy-700 dark:text-dusk-200">
              Travel Life helps you document your adventures. Track trips, locations, photos, transportation, lodging, and create beautiful travel journals.
            </p>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor={usernameId} className="label">
                Username
              </label>
              <input
                type="text"
                id={usernameId}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input w-full"
                placeholder="Choose a username"
                minLength={3}
                maxLength={255}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor={emailId} className="label">
                Email
              </label>
              <input
                type="email"
                id={emailId}
                value={email}
                className="input w-full bg-gray-100 dark:bg-navy-600"
                disabled
              />
              <p className="text-xs text-navy-500 dark:text-dusk-400 mt-1">
                Your account will be created with this email address
              </p>
            </div>

            <div>
              <label htmlFor={passwordId} className="label">
                Password
              </label>
              <input
                type="password"
                id={passwordId}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="Create a password"
                minLength={8}
                required
              />
              <p className="text-xs text-navy-500 dark:text-dusk-400 mt-1">
                Must be at least 8 characters
              </p>
            </div>

            <div>
              <label htmlFor={confirmPasswordId} className="label">
                Confirm Password
              </label>
              <input
                type="password"
                id={confirmPasswordId}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full"
                placeholder="Confirm your password"
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full"
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Decline Link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleDecline}
              className="text-sm text-navy-500 dark:text-dusk-400 hover:text-navy-700 dark:hover:text-dusk-200"
            >
              No thanks, decline invitation
            </button>
          </div>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-warm-gray dark:border-navy-600 text-center">
            <p className="text-sm text-navy-600 dark:text-dusk-300">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
