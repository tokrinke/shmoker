# Private Poker Club

A private Texas Hold'em room for you and up to five friends. Virtual chips only, no accounts.
React + TypeScript + Tailwind on GitHub Pages, Supabase for the backend (Realtime + one Edge Function).

## How it works (the short version)

- Each browser gets an anonymous guest identity (Supabase anonymous sign-in), kept in localStorage, so a refresh keeps your seat.
- **All game actions go through one Edge Function** (`supabase/functions/poker`). It checks turns, chips and betting rules with the shared poker engine, deals from a secure shuffle, and saves the result. The deck and everybody's cards live in a table browsers cannot read.
- Browsers can only read two tables, protected by Row Level Security: `table_views` (public table state, no hidden cards) and `private_hands` (your own two cards).
- The server owns the turn timer. Every seated browser pings `tick` after a deadline; the server applies the timeout once. The host does **not** need to keep their tab open. If *everybody* closes the page, the game simply pauses until someone returns.

## Where to change things

| I want to change... | Open this |
|---|---|
| Any colour (background, table felt, accent, status dots, card colours) | `src/styles/theme.css` (`--color-*`) |
| Glow of the active player / winner | `--shadow-active-player`, `--shadow-winner` in `theme.css` |
| Table green -> blue | `--color-table-felt`, `--color-table-felt-dark` in `theme.css` |
| Font | `--font-sans` in `theme.css` |
| Seat panel size | `--seat-width` in `theme.css`; details in `components/table/seat.css` |
| Card sizes | `--card-width`, `--card-width-hero`, `--card-width-community` in `theme.css` |
| Where the 6 seats sit around the table | `src/styles/seat-positions.css` |
| Which seats are used for 2-6 players | `src/components/table/seatLayout.ts` |
| Table oval, rail, felt, pot, community cards | `components/table/table.css` |
| Betting panel (restyle it) | `components/controls/controls.css` |
| Move the betting panel (e.g. to the left) | `components/room.css` (`.room-screen__body` grid) |
| Countdown ring | `components/table/timer.css` |
| Cards and deal animation | `components/table/cards.css` |
| Action log | `components/log/log.css` |
| Landing page / buttons | `components/landing/landing.css`, `src/styles/buttons.css` |
| Lobby | `components/lobby/lobby.css` |
| Phone / tablet layout | `src/styles/responsive.css` |
| Default chips / blinds / turn time | `DEFAULT_SETTINGS` in `supabase/functions/_shared/engine/types.ts` (hosts can also change them in the lobby) |
| Poker rules | `supabase/functions/_shared/engine/game.ts` (hand ranking: `evaluator.ts`) |

Class names are BEM style: `poker-table`, `poker-table__pot`, `player-seat`, `player-seat--active`, `community-cards`, `betting-controls`, `turn-timer`, `action-log`.
Tailwind supplies the base reset and config; the components use plain, readable CSS files next to them.

## Project structure

```
src/
  components/    landing/ lobby/ table/ controls/ log/ common/ + RoomPage.tsx
  hooks/         useRoom (realtime), useTableClock (server clock + timers), useCountdown, useToasts
  lib/           supabase.ts, api.ts (calls the Edge Function), router.ts, sounds.ts
  styles/        theme.css (design tokens), globals.css, buttons.css, seat-positions.css, responsive.css
supabase/
  migrations/    database schema + Row Level Security
  functions/
    _shared/engine/   the poker engine (pure TypeScript, shared by the server and the UI)
    poker/            the Edge Function (every state change goes through it)
tests/           engine tests (node:test)
```

## Setup

### 1. Supabase project (free)
1. Create an account at supabase.com and a **New project**.
2. **Authentication -> Sign In / Providers**: turn on **Allow anonymous sign-ins**.
3. Install the Supabase CLI (see the Supabase docs), then in this folder:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push                      # tables, security rules, realtime publication
   supabase functions deploy poker       # the game server
   supabase secrets set ALLOWED_ORIGIN=https://YOUR-USER.github.io
   ```
   `ALLOWED_ORIGIN` is only the site origin (no path, no trailing slash). Optional: `supabase secrets set ROOM_TTL_HOURS=24` (rooms with no activity for that long are deleted whenever someone creates a table).
4. **Project Settings -> API**: copy the **Project URL** and the **anon public** key. Never use or share the `service_role` key; the Edge Function already has it.

### 2. Run it locally
```
cp .env.example .env     # paste the URL and anon key
npm install
npm run dev
npm test                 # poker engine tests
```

### 3. Deploy to GitHub Pages
1. Create a GitHub repo and push this folder (`.env` is git-ignored).
2. Repo **Settings -> Pages -> Source: GitHub Actions**.
3. Repo **Settings -> Secrets and variables -> Actions -> Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public values, so variables are fine).
4. Push to `main`. The workflow runs the tests, builds and publishes to `https://YOUR-USER.github.io/YOUR-REPO/`.
5. Routing uses `#/...` URLs, so GitHub Pages needs no rewrite rules.

### 4. Play
Open the site, enter a name, **Create Table**, **Copy Invite Link**, send it to friends. They open it, type a name and sit down. The host presses **Start Game** (2+ players).

## Rules and choices
- 6 seats max, 2 to start. Defaults: 500 chips, blinds 5/10, 25 s per turn; the host can change them in the lobby.
- No rebuys: a player at 0 chips is out. When one player holds everything, the host can send everybody back to the lobby for fresh chips.
- Players can only join in the lobby, not mid-game. Reconnecting after a refresh always works.
- A player who runs out of time automatically checks (if free) or folds. After two missed turns in a row they are marked away and auto-folded quickly until they press "sit back in".
- A short all-in does not let players who already acted re-raise (standard reopening rule).

## Free-tier limits worth knowing (mid-2026 figures, confirm on supabase.com/pricing)
- Free projects **pause after 7 days of inactivity**; restore from the dashboard.
- About 200 concurrent realtime connections, 2M realtime messages/month, 500k Edge Function calls/month, 500 MB database. A 6-player evening uses a tiny fraction.
- Anonymous sign-ins are rate limited per IP (default 30/hour): fine for friends, but many people on one network repeatedly clearing their browser data could hit it.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Setup needed" screen | `VITE_SUPABASE_*` missing at build time. Add them (`.env` locally, Actions variables on GitHub) and rebuild. |
| "Could not start a guest session" | Enable **Anonymous sign-ins** in Supabase Authentication. |
| "Could not reach the game server" | Function not deployed, or `ALLOWED_ORIGIN` does not exactly match your site origin. |
| Table does not update live | Re-run `supabase db push` (the migration adds the tables to the realtime publication). The page also polls every 10 s as a fallback. |
| "You are not seated at this table" | You opened a room link without joining. Use the invite link (`#/join/CODE`). |
| Game stalls on someone's turn | Timeouts are applied when a seated browser wakes the server; if nobody has the page open the game waits. |

## Known limits
- The server only reacts when a browser calls it, so a table where every player closed the page is frozen until somebody comes back.
- Room codes are 6 characters from a 32-letter alphabet: fine for a private group, not for a public service.
