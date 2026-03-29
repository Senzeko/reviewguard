import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: 32,
        textAlign: 'center',
        color: '#888',
      }}
    >
      <h2 style={{ color: '#1F4E79' }}>Page not found</h2>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        That URL does not match any screen in PodSignal.
      </p>
      <p style={{ marginTop: 20 }}>
        <Link to="/shows" style={{ color: '#1F4E79', fontWeight: 600 }}>
          Back to shows
        </Link>
      </p>
    </div>
  );
}
