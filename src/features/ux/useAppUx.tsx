import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
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

export interface InputDialogOptions {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmOnEnter?: boolean;
  validation?: (value: string) => string | null;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ActiveInputDialog extends InputDialogOptions {
  resolve: (value: string | null) => void;
}

type ActiveDialogRequest =
  | { kind: "confirm"; payload: ActiveConfirm }
  | { kind: "input"; payload: ActiveInputDialog };

interface AppUxContextValue {
  notify: {
    info: (options: ToastOptions) => void;
    success: (options: ToastOptions) => void;
    warning: (options: ToastOptions) => void;
    error: (options: ToastOptions) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  requestInput: (options: InputDialogOptions) => Promise<string | null>;
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
  const [activeDialog, setActiveDialog] = useState<ActiveDialogRequest | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const toastIdRef = useRef(0);
  const dialogQueueRef = useRef<ActiveDialogRequest[]>([]);

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

  const showNextDialog = useCallback(() => {
    const queued = dialogQueueRef.current.shift() ?? null;
    setActiveDialog(queued);
  }, []);

  const enqueueDialog = useCallback((request: ActiveDialogRequest) => {
    setActiveDialog((current) => {
      if (current) {
        dialogQueueRef.current.push(request);
        return current;
      }

      return request;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      enqueueDialog({ kind: "confirm", payload: { ...options, resolve } });
    });
  }, [enqueueDialog]);

  const requestInput = useCallback((options: InputDialogOptions) => {
    return new Promise<string | null>((resolve) => {
      enqueueDialog({ kind: "input", payload: { ...options, resolve } });
    });
  }, [enqueueDialog]);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    showNextDialog();
  }, [showNextDialog]);

  const resolveActiveConfirm = useCallback(
    (value: boolean) => {
      if (activeDialog?.kind !== "confirm") return;
      activeDialog.payload.resolve(value);
      closeDialog();
    },
    [activeDialog, closeDialog]
  );

  const resolveActiveInput = useCallback(
    (value: string | null) => {
      if (activeDialog?.kind !== "input") return;
      activeDialog.payload.resolve(value);
      closeDialog();
    },
    [activeDialog, closeDialog]
  );

  useEffect(() => {
    if (!activeDialog) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }, [activeDialog]);

  const value = useMemo<AppUxContextValue>(
    () => ({
      notify: createNotificationApi(addToast),
      confirm,
      requestInput,
    }),
    [addToast, confirm, requestInput]
  );

  return (
    <AppUxContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialogHost
        activeConfirm={activeDialog?.kind === "confirm" ? activeDialog.payload : null}
        onCancel={() => resolveActiveConfirm(false)}
        onConfirm={() => resolveActiveConfirm(true)}
      />
      <InputDialogHost
        activeInput={activeDialog?.kind === "input" ? activeDialog.payload : null}
        onCancel={() => resolveActiveInput(null)}
        onConfirm={resolveActiveInput}
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

function InputDialogHost({
  activeInput,
  onCancel,
  onConfirm,
}: {
  activeInput: ActiveInputDialog | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeInput) {
      setValue("");
      setError(null);
      return;
    }

    setValue(activeInput.initialValue ?? "");
    setError(null);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [activeInput]);

  useEffect(() => {
    if (!activeInput) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeInput, onCancel]);

  if (!activeInput) return null;

  const validate = (candidate: string) => activeInput.validation?.(candidate) ?? null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextError = validate(value);

    if (nextError) {
      setError(nextError);
      return;
    }

    onConfirm(value);
  };

  return (
    <div className="confirm-overlay" role="presentation">
      <form
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-title"
        onSubmit={handleSubmit}
      >
        <h2 id="input-title">{activeInput.title}</h2>
        {activeInput.message ? <p>{activeInput.message}</p> : null}

        <label className="dialog-input-label">
          {activeInput.label ?? "Value"}
          <input
            ref={inputRef}
            className="dialog-input"
            placeholder={activeInput.placeholder}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && activeInput.confirmOnEnter === false) {
                event.preventDefault();
              }
            }}
          />
        </label>

        {error ? <p className="dialog-input-error">{error}</p> : null}

        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            {activeInput.cancelLabel ?? "Cancel"}
          </button>
          <button type="submit" className="primary">
            {activeInput.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
