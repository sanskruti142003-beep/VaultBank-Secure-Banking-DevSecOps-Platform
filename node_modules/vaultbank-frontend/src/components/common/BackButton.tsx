import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

export function BackButton({ to, label = "Back", className }: BackButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      className={cn("-ml-3 text-muted hover:text-secondary", className)}
      variant="ghost"
      type="button"
      onClick={() => {
        if (to) {
          navigate(to);
        } else {
          navigate(-1);
        }
      }}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
