import type { Card } from '@engine';
import './cards.css';

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

interface Props {
  /** Leave out to show the back of the card. */
  card?: Card;
  size?: 'small' | 'hero' | 'community';
  /** Milliseconds to wait before the deal animation starts. */
  dealDelay?: number;
}

export function PlayingCard({ card, size = 'small', dealDelay = 0 }: Props) {
  const classes = `playing-card playing-card--${size}`;
  const dealStyle = { '--deal-delay': `${dealDelay}ms` } as React.CSSProperties;

  if (!card) return <div className={`${classes} playing-card--back`} style={dealStyle} aria-label="Hidden card" />;

  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const isRed = suit === 'h' || suit === 'd';
  return (
    <div className={`${classes} ${isRed ? 'playing-card--red' : 'playing-card--black'}`} style={dealStyle}>
      <span className="playing-card__rank">{rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}
