/**
 * Launch Evidence Graph schema guard — 503 contract for routes that require migration 0017.
 * Uses a hoisted pool mock so no Postgres is required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply } from 'fastify';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  pool: {
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: vi.fn(),
    })),
  },
}));

import {
  ensureLaunchEvidenceGraphSchema,
  invalidateLaunchEvidenceGraphSchemaCache,
  isLaunchEvidenceGraphSchemaAvailable,
} from './launchEvidenceGraphGuard.js';

function mockReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

describe('launchEvidenceGraphGuard', () => {
  beforeEach(() => {
    invalidateLaunchEvidenceGraphSchemaCache();
    mockQuery.mockReset();
  });

  it('isLaunchEvidenceGraphSchemaAvailable is false when podsignal_asset_variants is absent', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    await expect(isLaunchEvidenceGraphSchemaAvailable()).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('isLaunchEvidenceGraphSchemaAvailable is true when table exists', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await expect(isLaunchEvidenceGraphSchemaAvailable()).resolves.toBe(true);
  });

  it('ensureLaunchEvidenceGraphSchema sends 503 + PODSIGNAL_LAUNCH_EVIDENCE_SCHEMA_MISSING when absent', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const reply = mockReply();
    const ok = await ensureLaunchEvidenceGraphSchema(reply);
    expect(ok).toBe(false);
    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Launch Evidence Graph schema not applied',
        code: 'PODSIGNAL_LAUNCH_EVIDENCE_SCHEMA_MISSING',
        migrationHint: expect.stringContaining('db:apply-0017'),
      }),
    );
  });

  it('ensureLaunchEvidenceGraphSchema returns true without replying when present', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const reply = mockReply();
    const ok = await ensureLaunchEvidenceGraphSchema(reply);
    expect(ok).toBe(true);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
