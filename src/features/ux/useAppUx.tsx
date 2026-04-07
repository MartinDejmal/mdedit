import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  message?: string;
  timeoutMs?: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  confirmOnEnter?: boolean;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface AppUxContextValue {
  notify: {
    info: (options: ToastOptions) => void;
    success: (options: ToastOptions) => void;
    warning: (options: ToastOptions) => void;
    error: (options: ToastOptions) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AppUxContext = createContext<AppUxContextValue | null>(null);

const DEFAULT_TOAST_TIMEOUT_MS = 3800;
const ERROR_TOAST_TIMEOUT_MS = 6500;

function createNotificationApi(addToast: (kind: ToastKind, options: ToastOptions) => void) {
  return {
    info: (options: ToastOptions) => addToast("info", options),
    success: (options: ToastOptions) => addToast("success", options),
    warning: (options: ToastOptions) => addToast("warning", options),
    error: (options: ToastOptions) => addToast("error", options),
  };
}

export function AppUxProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ActiveConfirm | null>(null);
  const toastIdRef = useRef(0);
  const confirmQueueRef = useRef<ActiveConfirm[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((kind: ToastKind, options: ToastOptions) => {
    const id = ++toastIdRef.current;
    const timeoutMs =
      options.timeoutMs ??
      (kind === "error" ? ERROR_TOAST_TIMEOUT_MS : DEFAULT_TOAST_TIMEOUT_MS);

    setToasts((current) => [...current, { ...options, kind, id, timeoutMs }]);

    window.setTimeout(() => {
      dismissToast(id);
    }, timeoutMs);
  }, [dismissToast]);

  const showNextConfirm = useCallback(() => {
    const queued = confirmQueueRef.current.shift() ?? null;
    setActiveConfirm(queued);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const request: ActiveConfirm = { ...options, resolve };

      setActiveConfirm((current) => {
        if (current) {
          confirmQueueRef.current.push(request);
          return current;
        }

        return request;
      });
    });
  }, []);

  const resolveConfirm = useCallback(
    (value: boolean) => {
      setActiveConfirm((current) => {
        if (!current) return null;
        current.resolve(value);
        return null;
      });
      showNextConfirm();
    },
    [showNextConfirm]
  );

  const value = useMemo<AppUxContextValue>(
    () => ({
      notify: createNotificationApi(addToast),
      confirm,
    }),
    [addToast, confirm]
  );

  return (
    <AppUxContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialogHost
        activeConfirm={activeConfirm}
        onCancel={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
      />
    </AppUxContext.Provider>
  );
}

export function useAppUx(): AppUxContextValue {
  const context = useContext(AppUxContext);
  if (!context) {
    throw new Error("useAppUx must be used inside AppUxProvider");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id} role="status">
          <div className="toast-main">
            <strong>{toast.title}</strong>
            {toast.message ? <div>{toast.message}</div> : null}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialogHost({
  activeConfirm,
  onCancel,
  onConfirm,
}: {
  activeConfirm: ActiveConfirm | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!activeConfirm) return;
    cancelButtonRef.current?.focus();
  }, [activeConfirm]);

  useEffect(() => {
    if (!activeConfirm) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }

      if (event.key === "Enter" && activeConfirm.confirmOnEnter) {
        event.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeConfirm, onCancel, onConfirm]);

  if (!activeConfirm) return null;

  return (
    <div className="confirm-overlay" role="presentation">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{activeConfirm.title}</h2>
        <p>{activeConfirm.message}</p>

        <div className="confirm-actions">
          <button type="button" ref={cancelButtonRef} onClick={onCancel}>
            {activeConfirm.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={activeConfirm.variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {activeConfirm.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
