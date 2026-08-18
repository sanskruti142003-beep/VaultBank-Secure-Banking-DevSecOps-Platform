import { useEffect, useState } from "react";

export function useDelayedLoading(isLoading: boolean, delay = 100): boolean {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowLoading(true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [delay, isLoading]);

  return showLoading;
}
