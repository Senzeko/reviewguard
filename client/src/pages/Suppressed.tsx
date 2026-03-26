interface Props {
  score?: number;
}

export function Suppressed({ score }: Props) {
  return (
    <div
      data-testid="suppressed-page"
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: 32,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginBottom: 12 }}>Review not flagged for dispute</h2>
      <p style={{ color: '#595959', fontSize: 14, lineHeight: 1.6 }}>
        The forensic score for this case ({score ?? 0}/100) falls below the
        threshold for dispute review. This may indicate:
      </p>
      <ul
        style={{
          textAlign: 'left',
          margin: '16px auto',
          maxWidth: 360,
          color: '#595959',
          fontSize: 14,
          lineHeight: 1.8,
        }}
      >
        <li>The reviewer is likely a genuine customer</li>
        <li>Insufficient data to draw a conclusion</li>
        <li>The review is outside the 14-day transaction window</li>
      </ul>
      <p style={{ color: '#888', fontSize: 13, marginTop: 16 }}>
        If you believe this review violates Google's policies for other reasons,
        you can report it directly through Google Business Profile.
      </p>
    </div>
  );
}
