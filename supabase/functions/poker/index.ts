// The ONLY place where game state is changed. Browsers call this function; it validates everything
// with the shared poker engine and writes with the service-role key (never exposed to browsers).
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as Poker from '../_shared/engine/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'; // set to your GitHub Pages origin
const ROOM_TTL_HOURS = Number(Deno.env.get('ROOM_TTL_HOURS') ?? '24'); // abandoned rooms are deleted after this
const MAX_PLAYERS = 6;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

class UserError extends Error {}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const jwt = request.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) return reply({ error: 'You are not signed in' }, 401);
    const body = await request.json();
    return reply(await route(body, data.user.id));
  } catch (error) {
    if (error instanceof UserError || error instanceof Poker.EngineError) return reply({ error: error.message }, 400);
    console.error(error);
    return reply({ error: 'Server error, please try again' }, 500);
  }
});

// ---------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function route(body: any, userId: string) {
  switch (body.action) {
    case 'create': return createRoom(body, userId);
    case 'join': return joinRoom(body, userId);
    case 'settings': return updateSettings(body, userId);
    case 'start': return startGame(body, userId);
    case 'act': return playerAction(body, userId);
    case 'tick': return tick(body, userId);
    case 'sit_in': return sitIn(body, userId);
    case 'leave': return leaveRoom(body, userId);
    case 'reset': return backToLobby(body, userId);
    default: throw new UserError('Unknown action');
  }
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function cleanName(input: unknown): string {
  const name = String(input ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N} _.-]{1,16}$/u.test(name)) {
    throw new UserError('Pick a display name of 1-16 letters, numbers, spaces, dots, dashes or underscores');
  }
  return name;
}

// deno-lint-ignore no-explicit-any
function cleanSettings(input: any): Poker.GameSettings {
  const read = (value: unknown, fallback: number, min: number, max: number, label: string) => {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new UserError(`${label} must be a whole number between ${min} and ${max}`);
    }
    return number;
  };
  const defaults = Poker.DEFAULT_SETTINGS;
  const smallBlind = read(input?.smallBlind, defaults.smallBlind, 1, 10_000, 'Small blind');
  const bigBlind = read(input?.bigBlind, smallBlind * 2, smallBlind, 20_000, 'Big blind');
  const startingStack = read(input?.startingStack, defaults.startingStack, bigBlind * 2, 1_000_000, 'Starting stack');
  const turnSeconds = read(input?.turnSeconds, defaults.turnSeconds, 10, 120, 'Turn time');
  return { startingStack, smallBlind, bigBlind, turnSeconds, nextHandDelaySeconds: defaults.nextHandDelaySeconds };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Poker.secureRandomInt(CODE_ALPHABET.length)];
  return code;
}

// ---------------------------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------------------------

interface RoomRow {
  id: string; code: string; host_user_id: string; status: 'lobby' | 'playing';
  settings: Poker.GameSettings; log: Poker.LogEntry[];
}
interface PlayerRow { room_id: string; user_id: string; name: string; seat: number }

async function loadRoom(roomId: string): Promise<RoomRow> {
  const { data } = await admin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!data) throw new UserError('This table no longer exists');
  return data as RoomRow;
}
async function loadPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data } = await admin.from('room_players').select('*').eq('room_id', roomId).order('seat');
  return (data ?? []) as PlayerRow[];
}
async function requireMember(roomId: unknown, userId: string) {
  if (typeof roomId !== 'string') throw new UserError('Missing table id');
  const players = await loadPlayers(roomId);
  const me = players.find((player) => player.user_id === userId);
  if (!me) throw new UserError('You are not seated at this table');
  return { me, players };
}
const roomLog = (roomId: string, text: string) => admin.rpc('append_room_log', { p_room: roomId, p_text: text });

/** Build and store the sanitised view that browsers read. */
async function publish(roomId: string) {
  const { data: rev } = await admin.rpc('bump_rev', { p_room: roomId });
  const [roomResult, players, gameResult] = await Promise.all([
    admin.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    loadPlayers(roomId),
    admin.from('games').select('state').eq('room_id', roomId).maybeSingle(),
  ]);
  const room = roomResult.data as RoomRow | null;
  if (!room) return;
  const game = (gameResult.data?.state ?? null) as Poker.GameState | null;
  const log = [...(room.log ?? []), ...(game?.log ?? [])].sort((a, b) => a.time - b.time).slice(-200);
  const view = {
    serverTime: Date.now(),
    room: { id: room.id, code: room.code, status: room.status, hostId: room.host_user_id, settings: room.settings, maxPlayers: MAX_PLAYERS },
    players: players.map((player) => ({ id: player.user_id, name: player.name, seat: player.seat })),
    log,
    game: game ? Poker.publicView(game) : null,
  };
  await admin.rpc('write_view', { p_room: roomId, p_rev: rev, p_view: view });
}

async function writeHands(roomId: string, state: Poker.GameState) {
  const rows = Object.entries(Poker.privateCards(state)).map(([userId, cards]) => ({
    room_id: roomId, user_id: userId, hand_number: state.handNumber, cards,
  }));
  await admin.from('private_hands').upsert(rows, { onConflict: 'room_id,user_id' });
}

/**
 * Read-modify-write with optimistic locking: if two requests race, one retries against the new
 * state, so simultaneous actions can never corrupt a hand.
 */
async function mutateGame(
  roomId: string,
  change: (state: Poker.GameState) => { state: Poker.GameState; changed: boolean },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row } = await admin.from('games').select('state, version').eq('room_id', roomId).maybeSingle();
    if (!row) throw new UserError('The game has not started');
    const before = row.state as Poker.GameState;
    const result = change(before);
    if (!result.changed) return { changed: false, state: before };
    const { data: updated } = await admin
      .from('games')
      .update({ state: result.state, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('version', row.version)
      .select('version');
    if (updated && updated.length > 0) {
      if (result.state.handNumber !== before.handNumber) await writeHands(roomId, result.state);
      await publish(roomId);
      return { changed: true, state: result.state };
    }
  }
  throw new UserError('The table is busy, please try again');
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function createRoom(body: any, userId: string) {
  const name = cleanName(body.name);
  const settings = cleanSettings(body.settings);
  await admin.rpc('cleanup_stale_rooms', { p_hours: ROOM_TTL_HOURS });
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: room, error } = await admin
      .from('rooms').insert({ code: makeRoomCode(), host_user_id: userId, settings }).select('id, code').single();
    if (error?.code === '23505') continue; // code collision, try another
    if (error || !room) throw error;
    const { error: playerError } = await admin.from('room_players').insert({ room_id: room.id, user_id: userId, name, seat: 0 });
    if (playerError) {
      await admin.from('rooms').delete().eq('id', room.id);
      throw playerError;
    }
    await roomLog(room.id, `${name} created the table.`);
    await publish(room.id);
    return { roomId: room.id, code: room.code, serverTime: Date.now() };
  }
  throw new UserError('Could not create a table, please try again');
}

// deno-lint-ignore no-explicit-any
async function joinRoom(body: any, userId: string) {
  const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { data } = await admin.from('rooms').select('*').eq('code', code).maybeSingle();
  const room = data as RoomRow | null;
  if (!room) throw new UserError('No table with that code');

  const players = await loadPlayers(room.id);
  if (players.some((player) => player.user_id === userId)) return { roomId: room.id, serverTime: Date.now() }; // reconnect
  if (room.status !== 'lobby') throw new UserError('This game has already started');
  if (players.length >= MAX_PLAYERS) throw new UserError('This table is full');

  const name = cleanName(body.name);
  if (players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
    throw new UserError('Someone at this table already uses that name');
  }
  const taken = new Set(players.map((player) => player.seat));
  const seat = [0, 1, 2, 3, 4, 5].find((candidate) => !taken.has(candidate))!;
  const { error } = await admin.from('room_players').insert({ room_id: room.id, user_id: userId, name, seat });
  if (error?.code === '23505') {
    throw new UserError(error.message.includes('unique_name') ? 'Someone at this table already uses that name' : 'Someone just took that seat, please try again');
  }
  if (error) throw error;
  await roomLog(room.id, `${name} joined the table.`);
  await publish(room.id);
  return { roomId: room.id, serverTime: Date.now() };
}

// deno-lint-ignore no-explicit-any
async function updateSettings(body: any, userId: string) {
  await requireMember(body.roomId, userId);
  const room = await loadRoom(body.roomId);
  if (room.host_user_id !== userId) throw new UserError('Only the host can change settings');
  if (room.status !== 'lobby') throw new UserError('Settings are locked once the game has started');
  await admin.from('rooms').update({ settings: cleanSettings(body.settings) }).eq('id', room.id);
  await publish(room.id);
  return { ok: true, serverTime: Date.now() };
}

// deno-lint-ignore no-explicit-any
async function startGame(body: any, userId: string) {
  const { players } = await requireMember(body.roomId, userId);
  const room = await loadRoom(body.roomId);
  if (room.host_user_id !== userId) throw new UserError('Only the host can start the game');
  if (room.status !== 'lobby') throw new UserError('The game has already started');
  if (players.length < 2) throw new UserError('At least two players are needed');

  const now = Date.now();
  const created = Poker.createGame(
    players.map((player) => ({ id: player.user_id, name: player.name, seatIndex: player.seat })),
    room.settings,
  );
  const state = Poker.startHand(created, Poker.secureRandomInt, now);
  const { error } = await admin.from('games').insert({ room_id: room.id, state });
  if (error) throw new UserError('The game has already started');
  await admin.from('rooms').update({ status: 'playing' }).eq('id', room.id);
  await writeHands(room.id, state);
  await roomLog(room.id, 'The game has started. Good luck!');
  await publish(room.id);
  return { ok: true, serverTime: now };
}

// deno-lint-ignore no-explicit-any
async function playerAction(body: any, userId: string) {
  await requireMember(body.roomId, userId);
  const action = body.action_data as Poker.PlayerAction;
  if (!action || typeof action.type !== 'string') throw new UserError('Invalid action');
  await mutateGame(body.roomId, (state) => {
    if (state.actionSeq !== body.seq) throw new UserError('The table just changed, please look again');
    const now = Date.now();
    if (state.deadline !== null && now > state.deadline + 1500) throw new UserError('Your time ran out');
    return { state: Poker.applyAction(state, userId, { type: action.type, amount: action.amount }, now), changed: true };
  });
  return { ok: true, serverTime: Date.now() };
}

/** Anyone seated can call this; the server decides whether a timeout / next hand is actually due. */
// deno-lint-ignore no-explicit-any
async function tick(body: any, userId: string) {
  await requireMember(body.roomId, userId);
  const { data } = await admin.from('games').select('room_id').eq('room_id', body.roomId).maybeSingle();
  if (!data) return { changed: false, serverTime: Date.now() };
  const result = await mutateGame(body.roomId, (state) => Poker.tick(state, Date.now()));
  return { changed: result.changed, serverTime: Date.now() };
}

// deno-lint-ignore no-explicit-any
async function sitIn(body: any, userId: string) {
  await requireMember(body.roomId, userId);
  await mutateGame(body.roomId, (state) => ({ state: Poker.sitIn(state, userId), changed: true }));
  return { ok: true, serverTime: Date.now() };
}

// deno-lint-ignore no-explicit-any
async function leaveRoom(body: any, userId: string) {
  const { me, players } = await requireMember(body.roomId, userId);
  const room = await loadRoom(body.roomId);
  const others = players.filter((player) => player.user_id !== userId);

  if (others.length === 0) {
    await admin.from('rooms').delete().eq('id', room.id);
    return { ok: true, serverTime: Date.now() };
  }
  if (room.host_user_id === userId) {
    await admin.from('rooms').update({ host_user_id: others[0].user_id }).eq('id', room.id);
  }
  await admin.from('room_players').delete().eq('room_id', room.id).eq('user_id', userId);
  await admin.from('private_hands').delete().eq('room_id', room.id).eq('user_id', userId);
  if (room.status === 'playing') {
    await mutateGame(room.id, (state) => ({ state: Poker.markLeft(state, userId, Date.now()), changed: true }));
  } else {
    await roomLog(room.id, `${me.name} left the table.`);
    await publish(room.id);
  }
  return { ok: true, serverTime: Date.now() };
}

// deno-lint-ignore no-explicit-any
async function backToLobby(body: any, userId: string) {
  await requireMember(body.roomId, userId);
  const room = await loadRoom(body.roomId);
  if (room.host_user_id !== userId) throw new UserError('Only the host can do that');
  await admin.from('games').delete().eq('room_id', room.id);
  await admin.from('private_hands').delete().eq('room_id', room.id);
  await admin.from('rooms').update({ status: 'lobby', log: [] }).eq('id', room.id);
  await roomLog(room.id, 'Back in the lobby. Fresh chips for the next game.');
  await publish(room.id);
  return { ok: true, serverTime: Date.now() };
}
