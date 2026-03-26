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
      <h2>Investigation not found</h2>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        The investigation ID in the URL does not match any record.
      </p>
    </div>
  );
}
