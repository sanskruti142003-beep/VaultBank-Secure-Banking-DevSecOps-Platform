import { type ComponentType } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"
      initial={{ opacity: 0, y: 12 }}
      role="status"
      transition={{ duration: 0.2 }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="h-8 w-8" />
      </motion.div>
      <h2 className="mt-5 text-xl font-semibold text-secondary">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{description}</p>
      {action ? (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </motion.div>
  );
}
