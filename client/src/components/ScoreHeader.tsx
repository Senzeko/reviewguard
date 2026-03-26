import type { ConsoleInvestigationResponse } from '../types/investigation';
import styles from './ScoreHeader.module.css';

interface Props {
  investigation: ConsoleInvestigationResponse;
}

export function ScoreHeader({ investigation: inv }: Props) {
  const fb = inv.factorBreakdown;
  // Color logic: HIGH match = reviewer IS a real customer = bad for merchant (can't dispute)
  //              LOW match = reviewer may be fake = good for merchant (can dispute)
  const scoreColor =
    inv.confidenceScore >= 75
      ? 'var(--color-green)'   // legitimate — confirmed real customer
      : inv.confidenceScore >= 50
        ? 'var(--color-amber)' // advisory — uncertain
        : 'var(--color-red)';  // disputable — likely fake

  const statusClass =
    inv.consoleTier === 'DISPUTABLE'
      ? styles.badgeRed
      : inv.consoleTier === 'LEGITIMATE'
        ? styles.badgeGreen
        : styles.badgeGray;

  return (
    <div className={styles.header} data-testid="score-header">
      <div className={styles.topRow}>
        <div className={styles.merchant}>
          <span className={styles.avatar}>
            {inv.merchantBusinessName.charAt(0)}
          </span>
          <span className={styles.bizName}>{inv.merchantBusinessName}</span>
        </div>
        <div className={styles.caseInfo}>
          Case {inv.caseId ?? 'Pending'} &middot;{' '}
          {new Date(inv.reviewPublishedAt).toLocaleDateString()}
          <span className={`${styles.tierBadge} ${statusClass}`}>
            {inv.consoleTier}
          </span>
        </div>
      </div>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Customer match score</span>
          <span className={styles.cardValue} style={{ color: scoreColor }}>
            {inv.confidenceScore} / 100
          </span>
          <span className={styles.cardSub} style={{ color: scoreColor, fontWeight: 600 }}>
            {inv.consoleTier === 'DISPUTABLE'
              ? 'Weak match — likely disputable'
              : inv.consoleTier === 'ADVISORY'
                ? 'Partial match — review carefully'
                : 'Strong match — verified customer'}
          </span>
          <div className={styles.bar}>
            <div
              className={styles.barFill}
              style={{
                width: `${inv.confidenceScore}%`,
                backgroundColor: scoreColor,
              }}
            />
          </div>
        </div>
        {fb && (
          <>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Identity</span>
              <span className={styles.cardValue}>{fb.identity.level}</span>
              <span className={styles.cardSub}>
                JW {fb.identity.jaro_winkler_score.toFixed(2)} &middot;{' '}
                {Math.round(fb.identity.score * 40)}pts
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Temporal</span>
              <span className={styles.cardValue}>{fb.temporal.level}</span>
              <span className={styles.cardSub}>
                {fb.temporal.delta_hours.toFixed(0)}h &middot;{' '}
                {Math.round(fb.temporal.score * 30)}pts
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Line-item</span>
              <span className={styles.cardValue}>{fb.line_item.level}</span>
              <span className={styles.cardSub}>
                {inv.llmInferenceFlag ? 'AI' : ''} &middot;{' '}
                {Math.round(fb.line_item.score * 30)}pts
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
