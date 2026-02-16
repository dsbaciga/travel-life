import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useScrollStore } from "../store/scrollStore";
import GlobalSearch from "./GlobalSearch";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { clearPosition } = useScrollStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setShowMobileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showMobileMenu]);

  if (!user) return null;

  const dropdownExpanded: "true" | "false" = showDropdown ? "true" : "false";
  const mobileMenuExpanded: "true" | "false" = showMobileMenu
    ? "true"
    : "false";

  const navLinks = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/trips", label: "Trips", onClick: () => clearPosition('trips-page') },
    { path: "/albums", label: "Albums" },
    { path: "/companions", label: "Companions" },
    { path: "/places-visited", label: "Places" },
    { path: "/checklists", label: "Checklists" },
    { path: "/trip-series", label: "Series" },
  ];

  const NavLink = ({
    path,
    label,
    mobile = false,
    onClick,
  }: {
    path: string;
    label: string;
    mobile?: boolean;
    onClick?: () => void;
  }) => (
    <Link
      to={path}
      className={`${
        mobile ? "block w-full px-4 py-2.5 text-base" : "px-4 py-2.5"
      } rounded-lg font-body font-medium relative group transition-colors ${
        isActive(path)
          ? "text-primary-600 dark:text-gold bg-primary-50 dark:bg-navy-800"
          : "text-slate dark:text-warm-gray hover:text-primary-600 dark:hover:text-gold hover:bg-primary-50/50 dark:hover:bg-navy-800/50"
      }`}
      onClick={() => {
        onClick?.();
        if (mobile) setShowMobileMenu(false);
      }}
    >
      <span className="relative z-10">{label}</span>
      {!mobile && (
        <div
          className={`absolute inset-x-2 bottom-1 h-0.5 bg-gradient-to-r from-primary-500 to-accent-400 dark:from-gold dark:to-accent-400 transition-transform origin-left ${
            isActive(path) ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
          }`}
        />
      )}
    </Link>
  );

  return (
    <nav className="bg-white/95 dark:bg-navy-900/95 backdrop-blur-md shadow-sm border-b border-primary-500/10 dark:border-gold/20 fixed top-0 left-0 right-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Logo / Brand */}
          <Link
            to="/dashboard"
            className="flex items-center space-x-2 sm:space-x-3 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-all">
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="text-xl sm:text-2xl font-display font-bold text-primary-600 dark:text-gold tracking-tight">
              Travel Life
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center space-x-1 ml-8">
            {navLinks.map((link) => (
              <NavLink key={link.path} path={link.path} label={link.label} onClick={link.onClick} />
            ))}
          </div>

          {/* Global Search */}
          <div className="hidden md:block flex-1 max-w-md mx-4">
            <GlobalSearch compact />
          </div>

          {/* Right Side: User Menu + Mobile Toggle */}
          <div className="flex items-center space-x-2">
            {/* User Menu (Desktop) */}
            <div className="hidden sm:block relative z-[100]" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-body font-medium text-primary-600 dark:text-gold hover:bg-primary-50 dark:hover:bg-navy-800 rounded-lg transition-all"
                {...(dropdownExpanded === "true"
                  ? { "aria-expanded": "true" }
                  : { "aria-expanded": "false" })}
                aria-haspopup="true"
              >
                <span>{user.username}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${
                    showDropdown ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-navy-800 rounded-xl shadow-xl py-2 z-[100] border-2 border-primary-500/10 dark:border-gold/20 backdrop-blur-sm">
                  <Link
                    to="/settings"
                    className="block px-4 py-2.5 text-sm font-body text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-700 hover:text-primary-600 dark:hover:text-gold transition-colors"
                    onClick={() => setShowDropdown(false)}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      handleLogout();
                    }}
                    className="block w-full text-left px-4 py-2.5 text-sm font-body text-slate dark:text-warm-gray hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-3 min-w-[44px] min-h-[44px] rounded-lg text-primary-600 dark:text-gold hover:bg-primary-50 dark:hover:bg-navy-800 transition-colors flex items-center justify-center"
              aria-label={showMobileMenu ? "Close menu" : "Open menu"}
              {...(mobileMenuExpanded === "true"
                ? { "aria-expanded": "true" }
                : { "aria-expanded": "false" })}
            >
              {showMobileMenu ? (
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setShowMobileMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Menu Drawer */}
      <div
        ref={mobileMenuRef}
        className={`fixed top-0 right-0 bottom-0 w-64 sm:w-72 bg-white dark:bg-navy-900 shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out lg:hidden ${
          showMobileMenu ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div
          className="relative flex flex-col h-full bg-white dark:bg-navy-900"
        >
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between p-4 border-b border-primary-500/10 dark:border-gold/20 bg-white dark:bg-navy-900">
            <span className="text-lg font-display font-bold text-primary-600 dark:text-gold">
              Menu
            </span>
            <button
              type="button"
              onClick={() => setShowMobileMenu(false)}
              className="p-3 min-w-[44px] min-h-[44px] rounded-lg text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-800 transition-colors flex items-center justify-center"
              aria-label="Close menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Mobile Navigation Links */}
          <nav className="flex-1 py-4 px-2 space-y-1 bg-white dark:bg-navy-900">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                path={link.path}
                label={link.label}
                onClick={link.onClick}
                mobile
              />
            ))}
          </nav>

          {/* Mobile User Section */}
          <div className="flex-shrink-0 border-t border-primary-500/10 dark:border-gold/20 p-4 bg-white dark:bg-navy-900">
            <div className="flex items-center space-x-3 mb-3 px-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-charcoal dark:text-warm-gray">
                  {user.username}
                </p>
                <p className="text-sm text-slate dark:text-warm-gray/70">
                  {user.email}
                </p>
              </div>
            </div>
            <Link
              to="/settings"
              className="block w-full px-4 py-3 text-center rounded-lg font-medium text-primary-600 dark:text-gold bg-primary-50 dark:bg-navy-800 hover:bg-primary-100 dark:hover:bg-navy-700 transition-colors mb-2"
              onClick={() => setShowMobileMenu(false)}
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowMobileMenu(false);
                handleLogout();
              }}
              className="block w-full px-4 py-3 text-center rounded-lg font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
