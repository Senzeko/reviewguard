/**
 * Surfaces PodSignal’s scientific-honesty standard on analytics and reporting screens.
 */
export function MeasurementHonestyBanner() {
  return (
    <div
      className="ps-card"
      style={{
        padding: '12px 14px',
        marginBottom: 16,
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 8,
        fontSize: 13,
        color: '#0c4a6e',
        lineHeight: 1.5,
      }}
      role="note"
      data-testid="measurement-honesty-banner"
    >
      <strong>How we talk about numbers:</strong> PodSignal distinguishes{' '}
      <em>observed</em> events (clicks on your tracked links, exports you make) from{' '}
      <em>directional</em> signals and <em>estimates</em>. We do not claim exact causality unless the
      data path supports it.
    </div>
  );
}
