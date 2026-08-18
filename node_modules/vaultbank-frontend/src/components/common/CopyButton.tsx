import { useEffect, useState } from "react";
import { CheckCheck, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  size?: "sm" | "md";
  className?: string;
  onCopied?: () => void;
}

export function CopyButton({
  text,
  size = "md",
  className,
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    onCopied?.();
  };

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      aria-label={copied ? "Copied!" : "Copy to clipboard"}
      aria-live="polite"
      className={cn(
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        "shrink-0 rounded-full",
        copied && "text-emerald-600 hover:bg-emerald-50",
        className,
      )}
      onClick={handleCopy}
      size="icon"
      type="button"
      variant="ghost"
    >
      {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
