import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error' | 'win';
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-3), { id, text, tone }]);
      window.setTimeout(() => dismiss(id), 4500); // keep in sync with toast-life in toasts.css
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}
