import { useNavigate } from 'react-router-dom';

interface Props {
  score?: number;
}

export function Legitimate({ score }: Props) {
  const navigate = useNavigate();

  return (
    <div
      data-testid="legitimate-page"
      style={{
        maxWidth: 520,
        margin: '60px auto',
        padding: 32,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: '#f0fdf4', color: '#1D9E75',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, margin: '0 auto 16px',
      }}>
        {'\u2713'}
      </div>
      <h2 style={{ marginBottom: 8, color: '#1F4E79' }}>Verified Customer</h2>
      <p style={{ color: '#595959', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
        This reviewer scored <strong>{score ?? 0}/100</strong> on the customer match scale,
        which means they are almost certainly a <strong>real customer</strong> of your business.
      </p>

      <div style={{
        background: '#f8f8f7', borderRadius: 8, padding: 16,
        textAlign: 'left', marginBottom: 20,
      }}>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>What the evidence shows:</p>
        <ul style={{ color: '#595959', fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Their name matches a customer in your POS records</li>
          <li>The review timing aligns with their visit</li>
          <li>Menu items they mentioned match their receipt</li>
        </ul>
      </div>

      <div style={{
        background: '#fefce8', border: '1px solid #fbbf24',
        borderRadius: 8, padding: 14, marginBottom: 20,
        fontSize: 13, color: '#92400e', textAlign: 'left',
      }}>
        <strong>This review cannot be disputed</strong> because the reviewer is a genuine customer.
        Disputing verified customer reviews would likely fail and could damage your reputation
        with Google. Instead, consider responding to the review directly.
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '10px 24px', background: '#1F4E79', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
