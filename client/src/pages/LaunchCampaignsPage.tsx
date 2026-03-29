import { Link } from 'react-router-dom';
import './podsignal-pages.css';

const ROWS = [
  {
    ep: 'EP 042: Future of AI Podcasting',
    show: 'Tech Frontiers',
    status: 'Blocked',
    readiness: 45,
    scheduled: 'May 15, 9:00 AM',
    blocked: 2,
    assets: '4/7',
  },
  {
    ep: 'EP 128: Launch Week Wrap',
    show: 'Podcast Business',
    status: 'Ready',
    readiness: 94,
    scheduled: 'May 18, 6:00 AM',
    blocked: 0,
    assets: '8/8',
  },
  {
    ep: 'EP 014: Creative Process',
    show: 'Creative Voices',
    status: 'In Progress',
    readiness: 72,
    scheduled: 'May 22, 10:00 AM',
    blocked: 0,
    assets: '5/8',
  },
];

function statusClass(s: string) {
  if (s === 'Blocked') return 'ps-badge--red';
  if (s === 'Ready') return 'ps-badge--green';
  if (s === 'In Progress') return 'ps-badge--blue';
  return 'ps-badge--gray';
}

export function LaunchCampaignsPage() {
  return (
    <div className="ps-page">
      <div className="ps-page-head">
        <div>
          <h1 className="ps-page-title">Launch Campaigns</h1>
          <p className="ps-page-sub">Monitor and execute episode launches across all shows.</p>
          <p className="ps-page-sub" style={{ marginTop: 8, fontSize: 12, color: '#92400e', fontWeight: 500 }}>
            Illustrative sample data on this page — KPIs and rows are not your workspace. Use{' '}
            <Link to="/episodes" style={{ color: '#4f46e5', fontWeight: 600 }}>
              Episodes → Launch
            </Link>{' '}
            for real campaigns.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="ps-pill-muted">42 total campaigns</span>
          <span className="ps-pill-muted" style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}>
            7 need attention
          </span>
        </div>
      </div>

      <div className="ps-kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Launching this week</div>
          <div className="ps-kpi-value" style={{ color: '#6366f1' }}>
            12
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Blocked</div>
          <div className="ps-kpi-value" style={{ color: '#dc2626' }}>
            5
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Avg readiness</div>
          <div className="ps-kpi-value" style={{ color: '#16a34a' }}>
            78%
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Published</div>
          <div className="ps-kpi-value" style={{ color: '#2563eb' }}>
            156
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Failed tasks</div>
          <div className="ps-kpi-value" style={{ color: '#ea580c' }}>
            3
          </div>
        </div>
      </div>

      <div className="ps-alert-banner">
        <span>
          <strong>7 campaigns need attention</strong> — 2 failed publishes · 3 pending approvals · 1 missing assets · 1
          overdue
        </span>
        <Link to="/shows" style={{ fontWeight: 600, color: '#92400e' }}>
          View all
        </Link>
      </div>

      <div className="ps-table-wrap">
        <table className="ps-table">
          <thead>
            <tr>
              <th>Campaign / Episode</th>
              <th>Show</th>
              <th>Status</th>
              <th>Readiness</th>
              <th>Scheduled</th>
              <th>Blocked</th>
              <th>Assets</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.ep}>
                <td>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="ps-thumb" />
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{r.ep}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Campaign</div>
                    </div>
                  </div>
                </td>
                <td>{r.show}</td>
                <td>
                  <span className={`ps-badge ${statusClass(r.status)}`}>{r.status}</span>
                </td>
                <td style={{ fontWeight: 700, color: r.readiness < 60 ? '#dc2626' : r.readiness > 85 ? '#16a34a' : '#d97706' }}>
                  {r.readiness}%
                </td>
                <td style={{ fontSize: 13, color: '#6b7280' }}>{r.scheduled}</td>
                <td style={{ fontWeight: 700, color: r.blocked ? '#dc2626' : '#16a34a' }}>{r.blocked}</td>
                <td style={{ fontWeight: 600, color: r.assets.startsWith('8') ? '#16a34a' : '#dc2626' }}>{r.assets}</td>
                <td>
                  <Link to="/shows" className="ps-btn-primary" style={{ fontSize: 12, padding: '8px 12px', textDecoration: 'none' }}>
                    Open board
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
