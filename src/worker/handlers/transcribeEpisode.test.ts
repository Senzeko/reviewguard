import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const refundEpisodeProcessingCredit = vi.fn(async () => {});
  const broadcastToUser = vi.fn();
  const runTranscription = vi.fn();
  const resolveEpisodeAudio = vi.fn();

  const selectRows: { current: unknown[] } = { current: [] };

  const dbLimit = vi.fn(() => Promise.resolve(selectRows.current));
  const dbWhere = vi.fn(() => ({ limit: dbLimit }));
  const dbInnerJoin = vi.fn(() => ({ where: dbWhere }));
  const dbFrom = vi.fn(() => ({ innerJoin: dbInnerJoin }));
  const dbSelect = vi.fn(() => ({ from: dbFrom }));

  const dbDeleteWhere = vi.fn(() => Promise.resolve());
  const dbDelete = vi.fn(() => ({ where: dbDeleteWhere }));

  const dbInsertValues = vi.fn(() => Promise.resolve());
  const dbInsert = vi.fn(() => ({ values: dbInsertValues }));

  const dbUpdateWhere = vi.fn(() => Promise.resolve());
  const dbUpdateSet = vi.fn(() => ({ where: dbUpdateWhere }));
  const dbUpdate = vi.fn(() => ({ set: dbUpdateSet }));

  return {
    refundEpisodeProcessingCredit,
    broadcastToUser,
    runTranscription,
    resolveEpisodeAudio,
    selectRows,
    dbSelect,
    dbDelete,
    dbInsert,
    dbUpdate,
  };
});

vi.mock('../../billing/processingQuota.js', () => ({
  refundEpisodeProcessingCredit: hoisted.refundEpisodeProcessingCredit,
}));

vi.mock('../../db/index.js', () => ({
  db: {
    select: hoisted.dbSelect,
    delete: hoisted.dbDelete,
    insert: hoisted.dbInsert,
    update: hoisted.dbUpdate,
  },
}));

vi.mock('../../server/routes/sse.js', () => ({
  broadcastToUser: hoisted.broadcastToUser,
}));

vi.mock('../../transcription/index.js', () => ({
  runTranscription: hoisted.runTranscription,
}));

vi.mock('../../media/resolveEpisodeAudio.js', () => ({
  resolveEpisodeAudio: hoisted.resolveEpisodeAudio,
}));

import { JobType } from '../../queue/jobs.js';
import { handleTranscribeEpisode } from './transcribeEpisode.js';

const MERCHANT = 'merchant-smoke-1';
const EP_ID = '00000000-0000-4000-8000-000000000001';

function processingRow() {
  return {
    episode: {
      id: EP_ID,
      status: 'PROCESSING' as const,
      durationSeconds: null as number | null,
      audioUrl: 'https://example.com/audio.mp3',
      audioLocalRelPath: null,
      audioMimeType: null,
    },
    ownerId: 'user-1',
  };
}

describe('handleTranscribeEpisode — processing credit refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectRows.current = [];
    hoisted.runTranscription.mockResolvedValue({
      fullText: 'hello',
      summary: 'sum',
      segments: [],
      durationSeconds: 1,
    });
    hoisted.resolveEpisodeAudio.mockResolvedValue({ buffer: Buffer.from([0]), mime: 'audio/mpeg' });
  });

  it('refunds when episode row is missing', async () => {
    hoisted.selectRows.current = [];
    await handleTranscribeEpisode({
      type: JobType.TRANSCRIBE_EPISODE,
      episodeId: EP_ID,
      merchantId: MERCHANT,
    });
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledTimes(1);
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledWith(MERCHANT);
    expect(hoisted.runTranscription).not.toHaveBeenCalled();
  });

  it('refunds when episode is not PROCESSING', async () => {
    hoisted.selectRows.current = [
      {
        episode: { ...processingRow().episode, status: 'READY' as const },
        ownerId: 'user-1',
      },
    ];
    await handleTranscribeEpisode({
      type: JobType.TRANSCRIBE_EPISODE,
      episodeId: EP_ID,
      merchantId: MERCHANT,
    });
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledTimes(1);
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledWith(MERCHANT);
    expect(hoisted.runTranscription).not.toHaveBeenCalled();
  });

  it('does not refund on successful transcription', async () => {
    hoisted.selectRows.current = [processingRow()];
    await handleTranscribeEpisode({
      type: JobType.TRANSCRIBE_EPISODE,
      episodeId: EP_ID,
      merchantId: MERCHANT,
    });
    expect(hoisted.refundEpisodeProcessingCredit).not.toHaveBeenCalled();
    expect(hoisted.runTranscription).toHaveBeenCalled();
    expect(hoisted.dbUpdate).toHaveBeenCalled();
  });

  it('refunds when transcription throws', async () => {
    hoisted.selectRows.current = [processingRow()];
    hoisted.runTranscription.mockRejectedValue(new Error('ASR down'));
    await handleTranscribeEpisode({
      type: JobType.TRANSCRIBE_EPISODE,
      episodeId: EP_ID,
      merchantId: MERCHANT,
    });
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledTimes(1);
    expect(hoisted.refundEpisodeProcessingCredit).toHaveBeenCalledWith(MERCHANT);
    expect(hoisted.broadcastToUser).toHaveBeenCalled();
  });

  it('does not call refund when merchantId is missing (legacy job)', async () => {
    hoisted.selectRows.current = [];
    await handleTranscribeEpisode({
      type: JobType.TRANSCRIBE_EPISODE,
      episodeId: EP_ID,
    });
    expect(hoisted.refundEpisodeProcessingCredit).not.toHaveBeenCalled();
  });
});
