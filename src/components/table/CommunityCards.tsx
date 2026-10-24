import type { Card } from '@engine';
import { PlayingCard } from './PlayingCard';

/** Five slots; cards appear as the flop, turn and river are dealt. */
export function CommunityCards({ cards }: { cards: Card[] }) {
  return (
    <div className="community-cards">
      {Array.from({ length: 5 }, (_, index) => {
        const card = cards[index];
        return card ? (
          // key includes the card so a newly dealt card plays the deal animation
          <PlayingCard key={card} card={card} size="community" dealDelay={index < 3 ? index * 110 : 0} />
        ) : (
          <div key={`empty-${index}`} className="community-cards__slot" />
        );
      })}
    </div>
  );
}
