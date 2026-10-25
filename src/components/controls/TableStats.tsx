import type { PublicGameView } from '@engine';
import { WIN_COUNT_DELAY, money, wonThisHand } from '../../lib/format';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { IconCall, IconCoins, IconWallet } from '../common/Icons';
import './stats.css';

/** Three big numbers: your balance, the pot, and what it costs to stay in. */
export function TableStats({ game, userId }: { game: PublicGameView; userId: string }) {
  const me = game.seats.find((seat) => seat.id === userId);
  const betting = game.toActId !== null;
  const toCall = me ? Math.max(0, game.currentBet - me.bet) : 0;

  return (
    <section className="table-stats panel">
      <div className="table-stats__tile table-stats__tile--balance">
        <span className="table-stats__label"><IconWallet size={16} />Your balance</span>
        <span className="table-stats__value"><AnimatedNumber value={me?.stack ?? 0} delay={wonThisHand(game, userId) ? WIN_COUNT_DELAY : 0} /></span>
      </div>
      <div className="table-stats__row">
        <div className="table-stats__tile">
          <span className="table-stats__label"><IconCoins size={16} />Pot</span>
          <span className="table-stats__value">{money(betting ? game.pot : 0)}</span>
        </div>
        <div className="table-stats__tile">
          <span className="table-stats__label"><IconCall size={16} />To call</span>
          <span className="table-stats__value">{betting && !me?.folded ? money(toCall) : '–'}</span>
        </div>
      </div>
      <p className="table-stats__footer">
        Blinds {money(game.settings.smallBlind)} / {money(game.bigBlind)} &middot; Hand {game.handNumber}
      </p>
    </section>
  );
}
