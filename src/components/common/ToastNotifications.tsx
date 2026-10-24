import type { Toast } from '../../hooks/useToasts';
import './toasts.css';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function ToastNotifications({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toasts__item toasts__item--${toast.tone}`} onClick={() => onDismiss(toast.id)}>
          {toast.text}
        </button>
      ))}
    </div>
  );
}
