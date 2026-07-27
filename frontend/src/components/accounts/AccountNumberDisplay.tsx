import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/CopyButton";
import {
  groupAccountNumber,
  maskAccountNumber,
} from "@/constants/accounts.constants";
import { cn } from "@/lib/utils";

interface AccountNumberDisplayProps {
  accountNumber: string;
  className?: string;
}

export function AccountNumberDisplay({
  accountNumber,
  className,
}: AccountNumberDisplayProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) {
      return undefined;
    }
    const timer = window.setTimeout(() => setRevealed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  function revealBriefly() {
    setRevealed(true);
    window.setTimeout(() => setRevealed(false), 2000);
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-sm font-medium text-muted",
        className,
      )}
    >
      <span className="truncate">
        {revealed ? groupAccountNumber(accountNumber) : maskAccountNumber(accountNumber)}
      </span>
      <Button
        aria-label={revealed ? "Hide account number" : "Reveal account number"}
        aria-pressed={revealed}
        className="h-8 w-8 rounded-full"
        onClick={() => setRevealed((current) => !current)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <CopyButton onCopied={revealBriefly} size="sm" text={accountNumber} />
    </span>
  );
}
