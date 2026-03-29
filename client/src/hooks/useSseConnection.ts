import { useEffect, useRef, useState, useCallback } from 'react';
import { sseReconnectDelayMs } from '../lib/sseBackoff';

export type SseLiveStatus = 'connecting' | 'live' | 'degraded';

const MAX_SSE_RECONNECT = 6;

/**
 * Single shared SSE client for `/api/sse/events`: credentials, reconnect with backoff, degraded state.
 * Handlers are read from a ref so parent can update callbacks without reconnect storms.
 */
export function useSseConnection(options: {
  enabled: boolean;
  handlersRef: React.MutableRefObject<Record<string, () => void>>;
  /** When any value changes, the EventSource is recreated (e.g. episodeId). */
  reconnectDeps: unknown[];
}): { liveStatus: SseLiveStatus; reconnectCount: number } {
  const { enabled, handlersRef, reconnectDeps } = options;
  const [liveStatus, setLiveStatus] = useState<SseLiveStatus>(() =>
    enabled ? 'connecting' : 'degraded',
  );
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectAttempt = useRef(0);
  const timersRef = useRef<number[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const depKey = JSON.stringify(reconnectDeps);

  useEffect(() => {
    if (!enabled) {
      setLiveStatus('degraded');
      return;
    }

    let closed = false;

    const connect = () => {
      if (closed) return;
      esRef.current?.close();
      try {
        const es = new EventSource('/api/sse/events', { withCredentials: true });
        esRef.current = es;

        es.onopen = () => {
          if (closed) return;
          reconnectAttempt.current = 0;
          setLiveStatus('live');
        };

        const keys = Object.keys(handlersRef.current);
        for (const name of keys) {
          es.addEventListener(name, () => {
            if (closed) return;
            handlersRef.current[name]?.();
          });
        }

        es.onerror = () => {
          if (closed) return;
          setLiveStatus('degraded');
          es.close();
          if (reconnectAttempt.current >= MAX_SSE_RECONNECT) {
            return;
          }
          reconnectAttempt.current += 1;
          setReconnectCount((n) => n + 1);
          const delay = sseReconnectDelayMs(reconnectAttempt.current);
          const tid = window.setTimeout(() => {
            connect();
          }, delay);
          timersRef.current.push(tid);
        };
      } catch {
        setLiveStatus('degraded');
      }
    };

    setLiveStatus('connecting');
    connect();

    return () => {
      closed = true;
      clearTimers();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, depKey, clearTimers]);

  return { liveStatus, reconnectCount };
}
