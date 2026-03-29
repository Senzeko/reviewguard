import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackOutputUsage } from '../lib/trackOutputUsage';
import './PodSignalLayout.css';

function getInitials(email?: string | null): string {
  if (!email) return 'U';
  return email.slice(0, 2).toUpperCase();
}

function IconDashboard() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm8 0h6V11h-6v9zm0-16v5h6V4h-6z" fill="currentColor" />
    </svg>
  );
}
function IconMic() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8a2 2 0 002-2h-4a2 2 0 002 2z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconList() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" fill="currentColor" />
    </svg>
  );
}
function IconRocket() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 19l-4.5 2 1-4.5L4 14l5-1zm8.5-12.5c1.5 1.5 1.5 4 0 5.5l-2 2-8-8 2-2c1.5-1.5 4-1.5 5.5 0z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconChart() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19h16v2H4v-2zm2-4h2v3H6v-3zm4-6h2v9h-2V9zm4 4h2v5h-2v-5zm4-8h2v13h-2V5z" fill="currentColor" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconGear() {
  return (
    <svg className="ps-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.52-.4-1.08-.73-1.69-.98l-.36-2.54a.5.5 0 00-.5-.43h-3.84a.5.5 0 00-.49.43l-.36 2.54c-.61.25-1.17.59-1.69.98l-2.39-.96a.5.5 0 00-.6.22L4.2 8.84a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.36.29.6.22l2.39-.96c.52.4 1.08.74 1.69.98l.36 2.54c.05.24.27.43.49.43h3.84c.24 0 .44-.19.49-.43l.36-2.54c.61-.25 1.17-.58 1.69-.98l2.39.96c.24.09.47.02.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22a2.5 2.5 0 002.45-2H9.55A2.5 2.5 0 0012 22zm7-6V11a7 7 0 10-14 0v5L4 18h16l-1-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function PodSignalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hideTopbar = pathname.startsWith('/analytics');
  const [searchQuery, setSearchQuery] = useState('');

  const searchPlaceholder =
    pathname.startsWith('/campaigns')
      ? 'Search campaigns or episodes…'
      : pathname.startsWith('/episodes')
        ? 'Search episodes…'
        : 'Search episodes, shows, campaigns…';

  return (
    <div className="ps-shell">
      <aside className="ps-sidebar">
        <div className="ps-brand">
          <div className="ps-logo-mark" aria-hidden>
            <span className="ps-logo-inner" />
          </div>
          <span className="ps-brand-text">PodSignal</span>
        </div>

        <div className="ps-workspace">
          <button
            type="button"
            className="ps-workspace-btn"
            aria-label="Go to dashboard (workspace home)"
            onClick={() => {
              void trackOutputUsage({
                eventType: 'pilot_ui_nav',
                payload: { target: '/dashboard', source: 'sidebar_workspace' },
              });
              navigate('/dashboard');
            }}
          >
            <span className="ps-workspace-label">My Workspace</span>
            <IconChevron />
          </button>
        </div>

        <nav className="ps-nav ps-nav--grow" aria-label="Primary">
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconDashboard />
            Dashboard
          </NavLink>
          <NavLink
            to="/shows"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconMic />
            Shows
          </NavLink>
          <NavLink
            to="/episodes"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconList />
            Episodes
          </NavLink>
          <NavLink
            to="/campaigns"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconRocket />
            Launch Campaigns
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconChart />
            Analytics
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconDoc />
            Sponsor Reports
          </NavLink>
        </nav>

        <nav className="ps-nav ps-nav--footer" aria-label="Account">
          <NavLink
            to="/settings"
            className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}
          >
            <IconGear />
            Settings
          </NavLink>
        </nav>

        <div className="ps-sidebar-footer">
          <button type="button" className="ps-nav-link" onClick={() => void logout().then(() => navigate('/login'))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="ps-main">
        {!hideTopbar && (
          <header className="ps-topbar">
            <input
              className="ps-search"
              placeholder={searchPlaceholder}
              aria-label="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void trackOutputUsage({
                  eventType: 'pilot_ui_nav',
                  payload: {
                    target: '/episodes',
                    source: 'topbar_search_submit',
                    queryLength: searchQuery.trim().length,
                  },
                });
                navigate('/episodes');
              }}
            />
            <div className="ps-top-actions">
              <button
                type="button"
                className="ps-icon-btn"
                aria-label="Open launch proof report"
                title="Launch proof report"
                onClick={() => {
                  void trackOutputUsage({
                    eventType: 'pilot_ui_nav',
                    payload: { target: '/reports', source: 'topbar_notifications' },
                  });
                  navigate('/reports');
                }}
              >
                <IconBell />
                <span className="ps-icon-badge">3</span>
              </button>
              <button
                type="button"
                className="ps-avatar"
                title={user?.email ?? undefined}
                aria-label="Account settings"
                onClick={() => {
                  void trackOutputUsage({
                    eventType: 'pilot_ui_nav',
                    payload: { target: '/settings', source: 'topbar_avatar' },
                  });
                  navigate('/settings');
                }}
              >
                {getInitials(user?.email)}
              </button>
            </div>
          </header>
        )}
        <section className={hideTopbar ? 'ps-content ps-content--flush' : 'ps-content'}>
          <Outlet />
        </section>
      </main>
    </div>
  );
}
