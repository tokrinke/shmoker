import { useCallback, useEffect, useRef } from 'react';
import type { PublicGameView } from '@engine';
import { api } from '../lib/api';

/**
 * Keeps a browser clock aligned with the server and nudges the server when a deadline passes.
 *
 * The server alone decides when a turn times out or the next hand starts: `tick` is only a "wake up
 * and check" call. Every seated browser calls it (with a little random delay), the server applies the
 * timeout once, and the other calls do nothing. So the host does not have to keep their tab open.
 */
export function useTableClock(roomId: string, game: PublicGameView | null) {
  const offset = useRef(0); // serverTime - clientTime
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const sentAt = Date.now();
      const response = await api.tick(roomId);
      const receivedAt = Date.now();
      offset.current = response.serverTime - (sentAt + receivedAt) / 2;
    } catch {
      /* offline: try again later */
    } finally {
      busy.current = false;
    }
  }, [roomId]);

  // Resync the clock now and then.
  useEffect(() => {
    sync();
    const id = window.setInterval(() => !document.hidden && sync(), 20_000);
    return () => window.clearInterval(id);
  }, [sync]);

  // Wake the server shortly after the current deadline.
  const dueAt = game ? (game.deadline ?? game.nextHandAt) : null;
  useEffect(() => {
    if (!dueAt) return;
    let cancelled = false;
    let timer: number;
    const loop = async () => {
      await sync();
      if (!cancelled) timer = window.setTimeout(loop, 2500); // still pending? ask again
    };
    const wait = Math.max(0, dueAt - (Date.now() + offset.current)) + 300 + Math.random() * 1200;
    timer = window.setTimeout(loop, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dueAt, game?.actionSeq, sync]);

  return useCallback(() => Date.now() + offset.current, []);
}
