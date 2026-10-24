import { useEffect, useRef, useState } from 'react';
import './log.css';

interface Props {
  entries: { time: number; text: string }[];
}

interface Thumb {
  top: number;
  height: number;
  visible: boolean;
}

/**
 * Event feed. The normal scrollbar is hidden; a thin faint indicator fades in at the side only while
 * you scroll. The list sticks to the newest entry unless you scroll up to read older ones.
 */
export function ActionLog({ entries }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottom = useRef(true);
  const hideTimer = useRef<number>();
  const [thumb, setThumb] = useState<Thumb>({ top: 0, height: 0, visible: false });

  const showThumb = () => {
    const list = listRef.current;
    if (!list || list.scrollHeight <= list.clientHeight + 1) return;
    const height = Math.max(28, (list.clientHeight * list.clientHeight) / list.scrollHeight);
    const travel = list.clientHeight - height;
    const top = (list.scrollTop / (list.scrollHeight - list.clientHeight)) * travel;
    setThumb({ top, height, visible: true });
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setThumb((current) => ({ ...current, visible: false })), 900);
  };

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [entries.length]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <section className="action-log panel">
      <h2 className="action-log__title">Action log</h2>
      <div className="action-log__scroll">
        <ul
          ref={listRef}
          className="action-log__list"
          onScroll={(event) => {
            const list = event.currentTarget;
            stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
            showThumb();
          }}
        >
          {entries.map((entry, index) => (
            <li key={`${entry.time}-${index}`} className="action-log__entry">{entry.text}</li>
          ))}
        </ul>
        <div
          className={`action-log__thumb ${thumb.visible ? 'action-log__thumb--visible' : ''}`}
          style={{ top: thumb.top, height: thumb.height }}
          aria-hidden
        />
      </div>
    </section>
  );
}
