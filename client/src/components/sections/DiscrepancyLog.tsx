import type { ConsoleInvestigationResponse } from '../../types/investigation';
import styles from './Sections.module.css';

interface Props {
  investigation: ConsoleInvestigationResponse;
}

export function DiscrepancyLog({ investigation: inv }: Props) {
  const fb = inv.factorBreakdown;
  const txn = inv.matchedTransaction;

  if (!txn) {
    return (
      <div className={styles.noRecordCard}>
        No matching transaction found within the 14-day window surrounding the
        review timestamp.
      </div>
    );
  }

  if (!fb) return <p className={styles.muted}>No scoring data available.</p>;

  const li = fb.line_item;
  const discrepancies = li.llm_extracted_items.filter(
    (item) => !li.matched_items.some((m) => m.toLowerCase() === item.toLowerCase()),
  );

  return (
    <div>
      {discrepancies.length === 0 ? (
        <div className={styles.greenCard}>
          No item discrepancies detected. All mentioned items appear in the POS
          record.
        </div>
      ) : (
        discrepancies.map((item) => (
          <div key={item} className={styles.discrepancyCard}>
            <div className={styles.discrepancyTitle}>
              Item discrepancy
              {inv.llmInferenceFlag && (
                <span className={styles.aiBadge}>AI-INFERRED</span>
              )}
            </div>
            <p>
              Review mentions "{item}". Transaction {txn.posTransactionId}{' '}
              contains only {li.pos_items.join(', ')}. A search of the 72-hour
              window found zero {item} sales at this location.
            </p>
          </div>
        ))
      )}
      {fb.temporal.level !== 'HIGH' && (
        <div className={styles.temporalNote}>
          <div className={styles.temporalTitle}>Temporal note</div>
          <p>{fb.temporal.detail}</p>
        </div>
      )}
    </div>
  );
}
