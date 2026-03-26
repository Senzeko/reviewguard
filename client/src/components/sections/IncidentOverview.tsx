import type { ConsoleInvestigationResponse } from '../../types/investigation';
import styles from './Sections.module.css';

interface Props {
  investigation: ConsoleInvestigationResponse;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function IncidentOverview({ investigation: inv }: Props) {
  const txn = inv.matchedTransaction;

  return (
    <div className={styles.twoCol}>
      <div className={styles.col}>
        <h4 className={styles.colTitle}>Google Review</h4>
        <dl className={styles.fields}>
          <dt>Reviewer name</dt>
          <dd>{inv.reviewerDisplayName}</dd>
          <dt>Review date</dt>
          <dd>{new Date(inv.reviewPublishedAt).toLocaleString('en-US', { timeZone: 'UTC' })}</dd>
          <dt>Star rating</dt>
          <dd>{inv.reviewRating} / 5</dd>
          <dt>Alleged violation</dt>
          <dd>Content not representing a genuine experience</dd>
        </dl>
        <blockquote className={styles.reviewText}>"{inv.reviewText}"</blockquote>
      </div>
      <div className={styles.col}>
        {txn ? (
          <>
            <h4 className={styles.colTitle}>Matched POS Transaction</h4>
            <dl className={styles.fields}>
              <dt>Transaction ID</dt>
              <dd>{txn.posTransactionId}</dd>
              <dt>POS provider</dt>
              <dd>{txn.posProvider}</dd>
              <dt>Customer name</dt>
              <dd>
                {inv.factorBreakdown?.identity.customer_name ??
                  'Expired \u2014 hash only'}
              </dd>
              <dt>Transaction date</dt>
              <dd>{new Date(txn.closedAt).toLocaleString('en-US', { timeZone: 'UTC' })}</dd>
              <dt>Total</dt>
              <dd>{formatCents(txn.transactionAmountCents)}</dd>
            </dl>
            <table className={styles.itemTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {txn.lineItems.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? styles.altRow : ''}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCents(item.price_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h4 className={styles.colTitleMuted}>No Record Found</h4>
            <p className={styles.muted}>
              No matching transaction found within the 14-day window.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
