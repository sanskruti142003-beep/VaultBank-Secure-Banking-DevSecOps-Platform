import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | unknown;
  variant?: "danger" | "warning";
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "warning",
  trigger,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isOpen = open ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (onOpenChange) {
      onOpenChange(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleConfirm();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  async function handleConfirm() {
    try {
      setIsConfirming(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <>
      {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : null}
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={() => setOpen(false)}
          >
            <motion.div
              animate={{ scale: 1, opacity: 1, y: 0 }}
              aria-modal="true"
              className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
              exit={{ scale: 0.98, opacity: 0, y: 8 }}
              initial={{ scale: 0.98, opacity: 0, y: 8 }}
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="flex items-start gap-4">
                <div
                  className={
                    variant === "danger"
                      ? "rounded-full bg-red-50 p-3 text-danger"
                      : "rounded-full bg-amber-50 p-3 text-warning"
                  }
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-semibold text-secondary">
                      {title}
                    </h2>
                    <Button
                      aria-label="Close dialog"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setOpen(false)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {description}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  ref={confirmRef}
                  disabled={isConfirming}
                  onClick={() => void handleConfirm()}
                  type="button"
                  variant={variant === "danger" ? "destructive" : "default"}
                >
                  {isConfirming ? "Working..." : confirmLabel}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
