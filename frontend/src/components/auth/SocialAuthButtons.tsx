import { Apple } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SocialAuthButtons() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button
        className="w-full"
        variant="outline"
        title="Coming soon"
        aria-label="Continue with Google, coming soon"
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-bold text-primary"
          aria-hidden="true"
        >
          G
        </span>
        Google
      </Button>
      <Button
        className="w-full bg-black text-white hover:bg-black/90"
        variant="secondary"
        title="Coming soon"
        aria-label="Continue with Apple, coming soon"
      >
        <Apple className="h-5 w-5" aria-hidden="true" />
        Apple
      </Button>
    </div>
  );
}
