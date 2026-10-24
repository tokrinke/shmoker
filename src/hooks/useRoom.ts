import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ConnectionState, PrivateHand, RoomView } from '../types/room';

interface ViewRow {
  version: number;
  view: RoomView;
}

/**
 * Loads the room, then keeps it live: Realtime pushes updates, and a slow poll + refetch on
 * reconnect/visibility make sure nothing is missed. Also tracks who is currently connected (presence).
 */
export function useRoom(roomId: string, userId: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [hand, setHand] = useState<PrivateHand | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [notSeated, setNotSeated] = useState(false);
  const latestVersion = useRef(0);

  const acceptView = useCallback((row: ViewRow) => {
    if (row.version >= latestVersion.current) {
      latestVersion.current = row.version;
      setView(row.view);
    }
  }, []);

  const refetch = useCallback(async () => {
    const [viewResult, handResult] = await Promise.all([
      supabase.from('table_views').select('version, view').eq('room_id', roomId).maybeSingle(),
      supabase.from('private_hands').select('hand_number, cards').eq('room_id', roomId).eq('user_id', userId).maybeSingle(),
    ]);
    if (viewResult.error) {
      setConnection('offline');
      return;
    }
    if (!viewResult.data) {
      setNotSeated(true);
      return;
    }
    setNotSeated(false);
    acceptView(viewResult.data as ViewRow);
    if (handResult.data) setHand({ handNumber: handResult.data.hand_number, cards: handResult.data.cards });
  }, [roomId, userId, acceptView]);

  useEffect(() => {
    latestVersion.current = 0;
    setView(null);
    setHand(null);
    refetch();

    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_views', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as Partial<ViewRow>;
          if (row?.view && row.version !== undefined) acceptView(row as ViewRow);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'private_hands', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { user_id?: string; hand_number?: number; cards?: string[] };
          if (row?.user_id === userId && row.cards) setHand({ handNumber: row.hand_number ?? 0, cards: row.cards });
        },
      )
      .on('presence', { event: 'sync' }, () => setConnectedIds(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('online');
          channel.track({ joinedAt: Date.now() });
          refetch(); // catch anything missed while (re)connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline');
        }
      });

    const poll = window.setInterval(() => {
      if (!document.hidden) refetch();
    }, 10_000);
    const onVisible = () => !document.hidden && refetch();
    const onOnline = () => refetch();
    const onOffline = () => setConnection('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      supabase.removeChannel(channel);
    };
  }, [roomId, userId, acceptView, refetch]);

  return { view, hand, connection, connectedIds, notSeated, refetch };
}
