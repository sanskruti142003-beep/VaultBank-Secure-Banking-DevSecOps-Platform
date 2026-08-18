import { AlertCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FormErrorProps {
  message?: string;
  id?: string;
  className?: string;
}

export function FormError({ message, id, className }: FormErrorProps) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.p
          id={id}
          className={cn(
            "mt-2 flex items-start gap-2 text-sm font-medium text-danger",
            className,
          )}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          aria-live="polite"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
