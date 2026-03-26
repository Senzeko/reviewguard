import type { ConsoleInvestigationResponse } from '../../types/investigation';
import styles from './Sections.module.css';

interface Props {
  investigation: ConsoleInvestigationResponse;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TimestampAudit({ investigation: inv }: Props) {
  const txn = inv.matchedTransaction;
  const fb = inv.factorBreakdown;

  if (!txn || !fb) {
    return (
      <div className={styles.timeline}>
        <div className={styles.timeEvent}>
          <span className={styles.dot} style={{ background: 'var(--color-red)' }} />
          <div>No matching transaction found in 14-day window</div>
        </div>
      </div>
    );
  }

  const deltaHours = fb.temporal.delta_hours;
  const gapLabel =
    deltaHours >= 48
      ? `${(deltaHours / 24).toFixed(1)} days`
      : `${deltaHours.toFixed(1)} hours`;

  const reviewDotColor =
    fb.temporal.level === 'HIGH'
      ? 'var(--color-green)'
      : fb.temporal.level === 'MEDIUM'
        ? 'var(--color-amber)'
        : 'var(--color-red)';

  return (
    <div>
      <div className={styles.timeline}>
        <div className={styles.timeEvent}>
          <span className={styles.dot} style={{ background: 'var(--color-green)' }} />
          <div>
            <div className={styles.timeDate}>
              {new Date(txn.closedAt).toLocaleString('en-US', { timeZone: 'UTC' })}
            </div>
            <div className={styles.timeLabel}>
              POS transaction closed &mdash; {txn.posTransactionId}
            </div>
            <div className={styles.timeSub}>
              {txn.posProvider} &middot; {formatCents(txn.transactionAmountCents)}
            </div>
          </div>
        </div>
        <div className={styles.timeLine}>
          <span className={styles.timeGap}>&harr; {gapLabel}</span>
        </div>
        <div className={styles.timeEvent}>
          <span className={styles.dot} style={{ background: reviewDotColor }} />
          <div>
            <div className={styles.timeDate}>
              {new Date(inv.reviewPublishedAt).toLocaleString('en-US', { timeZone: 'UTC' })}
            </div>
            <div className={styles.timeLabel}>Google review published</div>
            <div className={styles.timeSub}>
              {inv.reviewerDisplayName} &middot; {inv.reviewRating} stars
            </div>
          </div>
        </div>
      </div>
      <div className={styles.timeFooter}>
        <p>Transactions found in window: {txn ? 1 : 0}</p>
      </div>
    </div>
  );
}
