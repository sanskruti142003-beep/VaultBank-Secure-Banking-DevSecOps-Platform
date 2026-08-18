import { useCallback, useEffect, useState } from "react";

interface UseOtpResult {
  countdown: number;
  canResend: boolean;
  resendCount: number;
  maxResendsReached: boolean;
  resetTimer: () => void;
  markResent: () => void;
  resetResends: () => void;
}

export function useOtp(initialSeconds: number, maxResends: number): UseOtpResult {
  const [countdown, setCountdown] = useState(initialSeconds);
  const [resendCount, setResendCount] = useState(0);

  useEffect(() => {
    if (countdown <= 0) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [countdown]);

  const resetTimer = useCallback(() => {
    setCountdown(initialSeconds);
  }, [initialSeconds]);

  const markResent = useCallback(() => {
    setResendCount((value) => value + 1);
    setCountdown(initialSeconds);
  }, [initialSeconds]);

  const resetResends = useCallback(() => {
    setResendCount(0);
    setCountdown(initialSeconds);
  }, [initialSeconds]);

  return {
    countdown,
    canResend: countdown === 0 && resendCount < maxResends,
    resendCount,
    maxResendsReached: resendCount >= maxResends,
    resetTimer,
    markResent,
    resetResends,
  };
}
