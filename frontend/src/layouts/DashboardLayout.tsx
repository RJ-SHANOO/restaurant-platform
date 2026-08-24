import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, Flame, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { NotificationBell } from '@/components/ui/NotificationBell';
import type { NavigationSection } from '@/routes/navigation';

interface DashboardLayoutProps {
  sections: NavigationSection[];
  /** Shown under the wordmark: which restaurant or branch you are looking at. */
  contextLabel: string;
}

/**
 * Shared chrome for Super Admin, Restaurant and Branch dashboards.
 *
 * POS and Kitchen deliberately do NOT use this layout - a cashier working a
 * queue and a chef reading a rail need full-bleed screens, not a sidebar.
 */
export function DashboardLayout({ sections, contextLabel }: DashboardLayoutProps) {
  const { user, signOut, can } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-void">
      {/* --------------------------------------------------------- sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-width)] flex-col border-r border-line bg-panel',
          'transition-transform duration-300 ease-out lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[var(--header-height)] items-center gap-2.5 border-b border-line px-5">
          <Flame className="h-5 w-5 text-ember" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold leading-tight text-ink">Service Line</p>
            <p className="truncate text-[11px] text-ink-faint">{contextLabel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {sections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.permission || can(item.permission),
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title}>
                <p className="eyebrow px-3 pb-2">{section.title}</p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setIsSidebarOpen(false)}
                      className={({ isActive }) =>
                        clsx('nav-item', isActive && 'nav-item-active')
                      }
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="numeric ml-auto rounded-pill bg-ember px-1.5 py-0.5 text-[10px] font-bold text-[#1A1206]">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-control px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
              {user?.fullName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user?.fullName}</p>
              <p className="truncate text-[11px] capitalize text-ink-faint">
                {user?.primaryRole?.replace(/_/g, ' ')}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-chili"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* ------------------------------------------------- header + content */}
      <div className="lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-3 border-b border-line bg-void/85 px-4 backdrop-blur-lg lg:px-7">
          <button
            className="rounded-control p-2 text-ink-soft hover:bg-raised lg:hidden"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? <Menu className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="rounded-control p-2 text-ink-soft hover:bg-raised hover:text-ink"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            {!user?.scope.isPlatformAdmin && (
              <>
                <NotificationBell />
                <button className="btn btn-secondary hidden sm:inline-flex" type="button">
                  {user?.scope.branchName ?? 'All branches'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-7 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
