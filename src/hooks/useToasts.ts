import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-3), { id, text, tone }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}
