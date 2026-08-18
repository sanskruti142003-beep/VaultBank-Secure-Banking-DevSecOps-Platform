import { type ReactNode, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  onOpenChange: (open: boolean) => void;
}

export function ActionDialog({
  open,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  onOpenChange,
}: ActionDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChangeRef.current(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.section
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-modal="true"
            className={cn(
              "flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
              className,
            )}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-secondary">{title}</h2>
                {description ? (
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <Button
                ref={closeRef}
                aria-label="Close dialog"
                className="h-9 w-9 shrink-0 rounded-full"
                onClick={() => onOpenChange(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className={cn("overflow-y-auto p-5", bodyClassName)}>
              {children}
            </div>
            {footer ? (
              <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
                {footer}
              </footer>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
