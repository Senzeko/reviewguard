import type { ConsoleInvestigationResponse } from '../../types/investigation';
import styles from './Sections.module.css';

interface Props {
  investigation: ConsoleInvestigationResponse;
}

function levelColor(level: string): string {
  switch (level) {
    case 'HIGH': return 'var(--color-green)';
    case 'MEDIUM': return 'var(--color-amber)';
    case 'LOW': return 'var(--color-amber)';
    case 'NONE': return 'var(--color-red)';
    default: return 'var(--color-gray-500)';
  }
}

export function ForensicFindings({ investigation: inv }: Props) {
  const fb = inv.factorBreakdown;
  if (!fb) return <p className={styles.muted}>No scoring data available.</p>;

  const factors = [
    { name: 'Identity Match', weight: '40%', pts: Math.round(fb.identity.score * 40), result: fb.identity, isLI: false },
    { name: 'Temporal Proximity', weight: '30%', pts: Math.round(fb.temporal.score * 30), result: fb.temporal, isLI: false },
    { name: 'Line-Item Verification', weight: '30%', pts: Math.round(fb.line_item.score * 30), result: fb.line_item, isLI: true },
  ];

  const scoreColor = inv.confidenceScore >= 75 ? 'var(--color-green)' : inv.confidenceScore >= 50 ? 'var(--color-amber)' : 'var(--color-red)';

  return (
    <div>
      {factors.map((f) => (
        <div key={f.name} className={styles.factorBlock}>
          <div className={styles.factorHeader}>
            <span className={styles.dot} style={{ background: levelColor(f.result.level) }} />
            <span className={styles.factorName}>{f.name}</span>
            <span className={styles.factorWeight}>{f.weight}</span>
            <span className={styles.levelBadge} style={{ background: levelColor(f.result.level) }}>
              {f.result.level}
            </span>
            <span className={styles.pts}>{f.pts} pts</span>
          </div>
          <p className={styles.factorDetail}>{f.result.detail}</p>
          {f.isLI && inv.llmInferenceFlag && (
            <div className={styles.aiDetails}>
              <span className={styles.aiBadge}>AI-ASSISTED INFERENCE</span>
              <p>LLM extracted: {fb.line_item.llm_extracted_items.join(', ') || 'None'}</p>
              <p>POS items: {fb.line_item.pos_items.join(', ') || 'None'}</p>
              <p>Matched: {fb.line_item.matched_items.join(', ') || 'None'}</p>
            </div>
          )}
        </div>
      ))}
      <div className={styles.scoreBar}>
        <div className={styles.scoreBarBg}>
          <div className={styles.scoreBarFill} style={{ width: `${inv.confidenceScore}%`, background: scoreColor }} />
        </div>
        <span className={styles.scoreBarLabel}>
          Composite score: {inv.confidenceScore} / 100 ({factors[0].pts} + {factors[1].pts} + {factors[2].pts})
        </span>
      </div>
    </div>
  );
}
