import { useState } from 'react';
import styles from './EvidenceSection.module.css';

interface Props {
  number: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle: string;
  acknowledged: boolean;
  onAcknowledge: () => void;
  ackText: string;
  children: React.ReactNode;
}

export function EvidenceSection({
  number: num,
  title,
  subtitle,
  acknowledged,
  onAcknowledge,
  ackText,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`${styles.section} ${acknowledged ? styles.acked : ''}`}>
      <button
        className={styles.headerBtn}
        onClick={() => setOpen((o) => !o)}
        type="button"
        data-testid={`section-header-${num}`}
      >
        <span
          className={`${styles.numberCircle} ${acknowledged ? styles.circleGreen : ''}`}
          data-testid={`section-num-${num}`}
          data-acknowledged={acknowledged ? 'true' : 'false'}
        >
          {acknowledged ? '\u2713' : num}
        </span>
        <div className={styles.titles}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <span className={styles.chevron}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className={styles.body}>
          {children}
          <label
            className={`${styles.ackRow} ${acknowledged ? styles.ackChecked : ''}`}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={() => !acknowledged && onAcknowledge()}
              disabled={acknowledged}
              data-testid={`ack-checkbox-${num}`}
            />
            <span>{ackText}</span>
          </label>
        </div>
      )}
    </div>
  );
}
