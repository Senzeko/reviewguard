import styles from './Banners.module.css';

interface Props {
  score: number;
}

export function AdvisoryBanner({ score }: Props) {
  return (
    <div className={`${styles.banner} ${styles.advisory}`} data-testid="advisory-banner">
      <strong>Advisory — partial customer match.</strong> This review scored{' '}
      {score}/100 on the customer match scale (50-74 range). Some evidence suggests
      this person may be a real customer, but the match is inconclusive. Review all
      sections carefully. If the discrepancies are genuine, you may proceed with a
      dispute — but be aware the evidence is not as strong as a clear NO_RECORD case.
    </div>
  );
}
