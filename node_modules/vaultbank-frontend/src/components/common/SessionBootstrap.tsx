import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authApi } from "@/api/auth.api";
import { isApiError } from "@/constants/auth.constants";
import { useAuthStore } from "@/store/auth.store";
import type { TokenResponse } from "@/types/auth.types";

let pendingBootstrapRefresh:
  | { token: string; promise: Promise<TokenResponse> }
  | null = null;
let recentBootstrapRefresh:
  | { token: string; response: TokenResponse; expiresAt: number }
  | null = null;

function refreshBootstrapToken(refreshToken: string): Promise<TokenResponse> {
  if (
    recentBootstrapRefresh?.token === refreshToken &&
    recentBootstrapRefresh.expiresAt > Date.now()
  ) {
    return Promise.resolve(recentBootstrapRefresh.response);
  }

  if (pendingBootstrapRefresh?.token === refreshToken) {
    return pendingBootstrapRefresh.promise;
  }

  const promise = authApi.refreshToken(refreshToken).then((response) => {
    recentBootstrapRefresh = {
      token: refreshToken,
      response,
      expiresAt: Date.now() + 5_000,
    };
    return response;
  }).finally(() => {
    if (pendingBootstrapRefresh?.promise === promise) {
      pendingBootstrapRefresh = null;
    }
  });
  pendingBootstrapRefresh = { token: refreshToken, promise };
  return promise;
}

export function SessionBootstrap() {
  const {
    accessToken,
    refreshToken,
    user,
    hasHydrated,
    setTokens,
    setUser,
    clearAuth,
  } = useAuthStore();
  const shouldBootstrap =
    hasHydrated && Boolean(refreshToken) && (!user || !accessToken);

  const bootstrapQuery = useQuery({
    queryKey: ["auth", "bootstrap", refreshToken],
    enabled: shouldBootstrap,
    retry: false,
    queryFn: async () => {
      if (!refreshToken) {
        return null;
      }
      if (!accessToken) {
        const tokens = await refreshBootstrapToken(refreshToken);
        setTokens(tokens.accessToken, tokens.refreshToken);
      }
      return authApi.getMe();
    },
  });

  useEffect(() => {
    if (bootstrapQuery.data) {
      setUser(bootstrapQuery.data);
    }
  }, [bootstrapQuery.data, setUser]);

  useEffect(() => {
    if (bootstrapQuery.isError) {
      const error = bootstrapQuery.error;
      if (
        isApiError(error) &&
        (error.status === 401 ||
          error.code === "INVALID_REFRESH_TOKEN" ||
          error.code === "REFRESH_TOKEN_EXPIRED")
      ) {
        clearAuth();
      }
    }
  }, [bootstrapQuery.error, bootstrapQuery.isError, clearAuth]);

  return null;
}
