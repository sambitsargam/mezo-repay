"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { explorerTx } from "@repay/sdk";

interface Toast {
  id: number;
  title: string;
  hash?: string;
}
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 7000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-sage/30 bg-surface p-3.5 shadow-lift">
            <CheckCircle2 className="animate-pop mt-0.5 h-5 w-5 shrink-0 text-sage-deep" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.hash && (
                <a href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="mt-0.5 inline-block font-mono text-xs text-copper-deep underline-offset-2 hover:underline">
                  View on Mezo explorer ↗
                </a>
              )}
            </div>
            <button className="rounded-md p-1 text-ink-muted hover:bg-ivory-deep" aria-label="Dismiss" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
