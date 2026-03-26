import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useInvestigation } from '../hooks/useInvestigation';
import { useAcknowledgement } from '../hooks/useAcknowledgement';
import { ScoreHeader } from '../components/ScoreHeader';
import { AiWarningBanner } from '../components/AiWarningBanner';
import { AdvisoryBanner } from '../components/AdvisoryBanner';
import { EvidenceSection } from '../components/EvidenceSection';
import { ConfirmExportBar } from '../components/ConfirmExportBar';
import { IncidentOverview } from '../components/sections/IncidentOverview';
import { ForensicFindings } from '../components/sections/ForensicFindings';
import { DiscrepancyLog } from '../components/sections/DiscrepancyLog';
import { TimestampAudit } from '../components/sections/TimestampAudit';
import { MerchantStatement } from '../components/sections/MerchantStatement';
import { Legitimate } from './Legitimate';
import { NotFound } from './NotFound';

export function ReviewerConsole() {
  const { investigationId } = useParams<{ investigationId: string }>();
  const { investigation: inv, loading, error, refetch } = useInvestigation(
    investigationId ?? '',
  );
  const { acknowledged, acknowledge, allAcknowledged, acknowledgedCount } =
    useAcknowledgement();

  // Auto-refresh for NOT_READY
  useEffect(() => {
    if (inv?.consoleTier !== 'NOT_READY') return;
    const timer = setInterval(() => void refetch(), 5000);
    return () => clearInterval(timer);
  }, [inv?.consoleTier, refetch]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Loading investigation...
      </div>
    );
  }

  if (error || !inv) {
    return <NotFound />;
  }

  if (inv.consoleTier === 'NOT_READY') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        <h2>Review in progress</h2>
        <p>The forensic engine is scoring this review. This page will refresh automatically.</p>
      </div>
    );
  }

  if (inv.consoleTier === 'LEGITIMATE') {
    return <Legitimate score={inv.confidenceScore} />;
  }

  const ackTexts: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: 'I have reviewed the incident overview and confirm the reviewer details are accurate as retrieved from Google.',
    2: 'I have reviewed all three forensic factors. I understand the line-item analysis is AI-derived and I have independently verified the discrepancies against my own POS records.',
    3: 'I have reviewed the discrepancy log and confirm these contradictions between the review and my records are accurate to the best of my knowledge.',
    4: 'I have reviewed the timestamp audit and confirm the timeline inconsistencies are consistent with my POS records.',
    5: 'I have read the merchant attestation and understand I am personally authorizing this dispute submission to Google. I attest that this review does not match a legitimate customer transaction.',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <ScoreHeader investigation={inv} />
      {inv.llmInferenceFlag && <AiWarningBanner />}
      {inv.consoleTier === 'ADVISORY' && <AdvisoryBanner score={inv.confidenceScore} />}

      {/* Progress bar */}
      <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2, marginBottom: 12 }}>
        <div
          style={{
            height: '100%',
            width: `${(acknowledgedCount / 5) * 100}%`,
            background: 'var(--color-green)',
            borderRadius: 2,
            transition: 'width 0.3s',
          }}
        />
      </div>

      <EvidenceSection number={1} title="Incident Overview" subtitle="Reviewer and transaction details" acknowledged={acknowledged[1]} onAcknowledge={() => acknowledge(1)} ackText={ackTexts[1]}>
        <IncidentOverview investigation={inv} />
      </EvidenceSection>

      <EvidenceSection number={2} title="Forensic Audit Findings" subtitle="Factor-by-factor scoring breakdown" acknowledged={acknowledged[2]} onAcknowledge={() => acknowledge(2)} ackText={ackTexts[2]}>
        <ForensicFindings investigation={inv} />
      </EvidenceSection>

      <EvidenceSection number={3} title="Discrepancy Log" subtitle="Contradiction entries" acknowledged={acknowledged[3]} onAcknowledge={() => acknowledge(3)} ackText={ackTexts[3]}>
        <DiscrepancyLog investigation={inv} />
      </EvidenceSection>

      <EvidenceSection number={4} title="Timestamp Audit" subtitle="Timeline visualization" acknowledged={acknowledged[4]} onAcknowledge={() => acknowledge(4)} ackText={ackTexts[4]}>
        <TimestampAudit investigation={inv} />
      </EvidenceSection>

      <EvidenceSection number={5} title="Merchant Statement" subtitle="Policy citation and attestation" acknowledged={acknowledged[5]} onAcknowledge={() => acknowledge(5)} ackText={ackTexts[5]}>
        <MerchantStatement investigation={inv} />
      </EvidenceSection>

      <ConfirmExportBar
        investigationId={inv.investigationId}
        allAcknowledged={allAcknowledged}
        acknowledgedCount={acknowledgedCount}
        onConfirmed={() => void refetch()}
      />
    </div>
  );
}
