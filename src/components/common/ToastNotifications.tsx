import type { Toast } from '../../hooks/useToasts';
import { IconBell, IconCheck, IconCoins, IconFold } from './Icons';
import './toasts.css';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ICONS = { info: IconBell, success: IconCheck, error: IconFold, win: IconCoins };

/** Notifications at the top of the screen, styled like the side panels. Click one to dismiss it. */
export function ToastNotifications({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <button key={toast.id} className={`toasts__item toasts__item--${toast.tone}`} onClick={() => onDismiss(toast.id)}>
            <span className="toasts__icon"><Icon size={22} /></span>
            <span className="toasts__text">{toast.text}</span>
            <span className="toasts__life" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
