import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './PodSignalLayout.css';

function getInitials(email?: string | null): string {
  if (!email) return 'U';
  return email.slice(0, 2).toUpperCase();
}

export function PodSignalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="ps-shell">
      <aside className="ps-sidebar">
        <div className="ps-brand">
          <div className="ps-logo">PS</div>
          <span className="ps-brand-text">PodSignal</span>
        </div>
        <nav className="ps-nav" aria-label="Primary">
          <NavLink to="/shows" className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}>
            Shows
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}>
            Analytics
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => `ps-nav-link${isActive ? ' ps-nav-link-active' : ''}`}>
            Billing
          </NavLink>
        </nav>
        <div className="ps-sidebar-footer">
          <button type="button" className="ps-nav-link" onClick={() => void logout().then(() => navigate('/login'))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="ps-main">
        <header className="ps-topbar">
          <input className="ps-search" placeholder="Search campaigns or episodes..." aria-label="Search" />
          <div className="ps-top-actions">
            <button type="button" className="ps-pill">
              All Statuses
            </button>
            <button type="button" className="ps-pill">
              All Shows
            </button>
            <button type="button" className="ps-avatar" title={user?.email ?? undefined}>
              {getInitials(user?.email)}
            </button>
          </div>
        </header>
        <section className="ps-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
