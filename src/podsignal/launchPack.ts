/**
 * Launch pack — minimal structured state for episode launch workflow.
 */
import { z } from 'zod';

export const launchPackStatusSchema = z.enum(['draft', 'approved', 'exported', 'measured']);

export const launchPackSnapshotSchema = z
  .object({
    status: launchPackStatusSchema.default('draft'),
    selectedTitleVariant: z.string().max(500).nullable().optional(),
    selectedTitleIndex: z.number().int().min(0).max(20).nullable().optional(),
    selectedAppleDescription: z.string().max(8000).nullable().optional(),
    selectedSpotifyDescription: z.string().max(8000).nullable().optional(),
    selectedClipIds: z.array(z.string().uuid()).max(50).optional(),
    guestShareText: z.string().max(16000).nullable().optional(),
    channelNotes: z.record(z.string(), z.string().max(4000)).optional(),
    approvedAt: z.string().datetime().nullable().optional(),
    approvedByUserId: z.string().uuid().nullable().optional(),
    exportedAt: z.string().datetime().nullable().optional(),
    measuredAt: z.string().datetime().nullable().optional(),
    updatedAt: z.string().datetime().optional(),
  });

export type LaunchPackSnapshot = z.infer<typeof launchPackSnapshotSchema>;

/** Merge partial launch pack into existing JSON (shallow + nested keys). */
export function mergeLaunchPack(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}
