import { useState, useEffect, useRef } from 'react';
import { Phone, Settings, Key, ChartBar as BarChart3, FileText, X, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const nav = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setCurrentUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const navigation = [
    { name: 'Dashboard', icon: BarChart3, href: '/' },
    { name: 'AI Config', icon: Settings, href: '/ai-config' },
    { name: 'API Keys', icon: Key, href: '/api-keys' },
    { name: 'Call Logs', icon: FileText, href: '/logs' },
  ];

  const isActive = (href) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  // Focus first navigation link when sidebar opens (mobile)
  useEffect(() => {
    if (sidebarOpen) {
      setTimeout(() => {
        try {
          navRef.current?.querySelector('a')?.focus();
        } catch (e) {
          /* ignore */
        }
      }, 100);
    }
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Skip link for keyboard users */}
      <a href="#main" className="sr-only focus:not-sr-only z-50 p-2 bg-white dark:bg-gray-800 rounded mt-2 ml-2">
        Skip to main content
      </a>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
          aria-hidden="true"
        />
      )}

      {/* Sidebar / navigation (desktop always visible; mobile slide-in) */}
      <nav
        id="sidebar-navigation"
        ref={navRef}
        role="navigation"
        aria-label="Primary Navigation"
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 rounded-r-2xl shadow-lg/5`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-md">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">AI Assistant</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
            aria-label="Close sidebar"
            aria-controls="sidebar-navigation"
            aria-expanded={sidebarOpen}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-2" aria-label="Main Navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <a
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </a>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-t from-white/50 dark:from-gray-800/50">
          <div className="flex items-center space-x-3 px-4 py-3" role="complementary" aria-label="User profile">
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-200">
              {currentUser?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {currentUser?.email ?? 'Guest'}
              </p>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header role="banner" className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between h-12 lg:h-16 px-4 lg:px-6">
            {/* Logo wordmark — visible on mobile since there's no hamburger */}
            <div className="flex items-center space-x-2 lg:hidden">
              <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-primary-600 rounded-md flex items-center justify-center">
                <Phone className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-gray-900 dark:text-white">AI Assistant</span>
            </div>

            <div className="flex items-center space-x-3 ml-auto">
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-600 dark:text-gray-300 hidden sm:inline">Connected</span>
              </div>
              <ThemeToggle />

              {/* Auth controls */}
              <div className="relative">
                {!currentUser ? (
                  <button
                    onClick={() => nav('/login')}
                    className="px-3 py-1 rounded-md bg-primary-600 text-white text-sm"
                  >
                    Sign in
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-800 dark:text-gray-200">
                      {currentUser?.email?.[0]?.toUpperCase()}
                    </div>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        nav('/login');
                      }}
                      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Sign out"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main" className="p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom tab bar — mobile only */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <a
              key={item.name}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] relative"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-600 rounded-full" />
              )}
              <Icon
                className={`w-6 h-6 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}
              />
              <span
                className={`text-[10px] font-medium ${active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {item.name}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
