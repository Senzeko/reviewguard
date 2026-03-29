import { useEffect, useRef } from 'react';
import { useSseConnection, type SseLiveStatus } from './useSseConnection';

const PROCESSING_POLL_MS = 8000;

export type LiveStatus = SseLiveStatus;

/**
 * SSE for episode + campaign events (via shared useSseConnection); polling fallback while PROCESSING.
 */
export function useEpisodeLiveUpdates(options: {
  episodeId: string | undefined;
  /** When false, only polling runs if processing (e.g. permission denied for SSE) */
  enableSse: boolean;
  status: string | undefined;
  onEpisodeEvent: () => void;
  /** Launch board: only campaign SSE */
  listenForEpisodeEvents?: boolean;
  /** Optional: launch board listens for campaign:updated */
  onCampaignEvent?: () => void;
}): { liveStatus: LiveStatus; sseReconnects: number } {
  const {
    episodeId,
    enableSse,
    status,
    onEpisodeEvent,
    onCampaignEvent,
    listenForEpisodeEvents = true,
  } = options;

  const onEpisodeEventRef = useRef(onEpisodeEvent);
  const onCampaignEventRef = useRef(onCampaignEvent);
  onEpisodeEventRef.current = onEpisodeEvent;
  onCampaignEventRef.current = onCampaignEvent;

  const handlersRef = useRef<Record<string, () => void>>({});
  handlersRef.current = {};
  if (listenForEpisodeEvents) {
    handlersRef.current['episode:ready'] = () => onEpisodeEventRef.current();
    handlersRef.current['episode:failed'] = () => onEpisodeEventRef.current();
  }
  if (onCampaignEvent) {
    handlersRef.current['campaign:updated'] = () => onCampaignEventRef.current?.();
  }

  const { liveStatus, reconnectCount } = useSseConnection({
    enabled: !!episodeId && enableSse,
    handlersRef,
    reconnectDeps: [episodeId, enableSse, listenForEpisodeEvents, !!onCampaignEvent],
  });

  useEffect(() => {
    if (!episodeId) return;
    if (status !== 'PROCESSING') return;

    const id = window.setInterval(() => {
      onEpisodeEventRef.current();
    }, PROCESSING_POLL_MS);
    return () => window.clearInterval(id);
  }, [episodeId, status]);

  return { liveStatus, sseReconnects: reconnectCount };
}
