import styles from './Banners.module.css';

export function AiWarningBanner() {
  return (
    <div className={`${styles.banner} ${styles.amber}`} data-testid="ai-warning-banner">
      <strong>AI inference active.</strong> One or more findings in this report
      were generated using LLM-based entity extraction. These are labeled
      "AI-Assisted Inference" throughout. You must independently verify them
      against your own records before submitting any dispute to Google.
    </div>
  );
}
