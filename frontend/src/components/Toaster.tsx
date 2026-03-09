import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

const TYPE_STYLES = {
  success: {
    bg: 'bg-accent-emerald/10 border-accent-emerald/25',
    text: 'text-accent-emerald',
    icon: 'M20 6L9 17l-5-5',
  },
  error: {
    bg: 'bg-accent-rose/10 border-accent-rose/25',
    text: 'text-accent-rose',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
  warning: {
    bg: 'bg-accent-amber/10 border-accent-amber/25',
    text: 'text-accent-amber',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  },
  info: {
    bg: 'bg-accent-cyan/10 border-accent-cyan/25',
    text: 'text-accent-cyan',
    icon: 'M12 16v-4 M12 8h.01 M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  },
};

const MAX_VISIBLE = 5;

export function Toaster() {
  const { toasts, removeToast } = useStore();
  const visible = toasts.slice(-MAX_VISIBLE);

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 max-w-sm">
      {visible.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: { id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' };
  onDismiss: () => void;
}) {
  const style = TYPE_STYLES[toast.type];
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(onDismiss, 400);
      return () => clearTimeout(timer);
    }
  }, [exiting, onDismiss]);

  const handleClick = () => {
    setExiting(true);
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm cursor-pointer transition-all duration-400 ${style.bg} ${exiting ? 'toast-exit' : 'toast-enter'}`}
      onClick={handleClick}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 mt-0.5 ${style.text}`}
      >
        <path d={style.icon} />
      </svg>
      <p className="text-sm text-slate-200 leading-snug">{toast.message}</p>
    </div>
  );
}
