import { useState, useEffect, useRef } from 'react';
import { confirmInvestigation, pollPdfStatus } from '../api/client';
import styles from './ConfirmExportBar.module.css';

interface Props {
  investigationId: string;
  allAcknowledged: boolean;
  acknowledgedCount: number;
  onConfirmed: () => void;
}

type State = 'locked' | 'unlocked' | 'loading' | 'confirmed' | 'pdf_ready' | 'error';

export function ConfirmExportBar({
  investigationId,
  allAcknowledged,
  acknowledgedCount,
  onConfirmed,
}: Props) {
  const [state, setState] = useState<State>('locked');
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state === 'locked' || state === 'unlocked') {
      setState(allAcknowledged ? 'unlocked' : 'locked');
    }
  }, [allAcknowledged]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConfirm = async () => {
    setState('loading');
    setErrorMsg('');
    try {
      await confirmInvestigation(investigationId, 'merchant-user', [1, 2, 3, 4, 5]);
      setState('confirmed');
      onConfirmed();

      // Start polling for PDF
      pollRef.current = setInterval(async () => {
        try {
          const result = await pollPdfStatus(investigationId);
          if (result.status === 'ready' && result.downloadUrl) {
            if (pollRef.current) clearInterval(pollRef.current);
            setState('pdf_ready');
            window.location.href = result.downloadUrl;
          }
        } catch {
          // Ignore poll errors, keep trying
        }
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm';
      setErrorMsg(msg);
      setState('error');
    }
  };

  if (state === 'confirmed') {
    return (
      <div className={`${styles.bar} ${styles.success}`} data-testid="confirmed-state">
        <div>
          <strong>Dispute confirmed</strong>
          <p>PDF being generated &mdash; checking status...</p>
        </div>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (state === 'pdf_ready') {
    return (
      <div className={`${styles.bar} ${styles.success}`} data-testid="confirmed-state">
        <div>
          <strong>PDF ready &mdash; download started</strong>
          <p>Upload this PDF to your Google Business Profile appeal form</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <strong>Confirm & Export Dispute</strong>
        <p className={allAcknowledged ? styles.readyText : styles.lockedText}>
          {allAcknowledged
            ? 'All sections acknowledged \u2014 ready to export'
            : 'Acknowledge all 5 sections to unlock'}
        </p>
        {state === 'error' && <p className={styles.errorText}>{errorMsg}</p>}
      </div>
      <div className={styles.right}>
        <span className={allAcknowledged ? styles.countGreen : styles.countMuted} data-testid="ack-count">
          {acknowledgedCount} / 5 acknowledged
        </span>
        <button
          className={styles.btn}
          disabled={!allAcknowledged || state === 'loading'}
          onClick={handleConfirm}
          data-testid="confirm-btn"
        >
          {state === 'loading' ? 'Submitting...' : 'Confirm & Export'}
        </button>
      </div>
    </div>
  );
}
