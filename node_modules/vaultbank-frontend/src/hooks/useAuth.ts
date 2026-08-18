import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { authApi } from "@/api/auth.api";
import { useAuthStore } from "@/store/auth.store";
import type {
  AuthResponse,
  LoginDto,
  LoginResponse,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyAdminLoginDto,
  VerifyEmailDto,
} from "@/types/auth.types";

const authQueryKeys = {
  me: ["auth", "me"] as const,
};

function isAuthResponse(data: LoginResponse): data is AuthResponse {
  return "accessToken" in data;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const selectedAccountId = useAuthStore((state) => state.selectedAccountId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);
  const setSelectedAccountId = useAuthStore(
    (state) => state.setSelectedAccountId,
  );
  const setLoading = useAuthStore((state) => state.setLoading);
  const setHasHydrated = useAuthStore((state) => state.setHasHydrated);

  const meQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: authApi.getMe,
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
  }, [meQuery.data, setUser]);

  const registerMutation = useMutation({
    mutationFn: (data: RegisterDto) => authApi.register(data),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginDto) => authApi.login(data),
    onSuccess: (data) => {
      if (isAuthResponse(data)) {
        setAuth(data.user, data.accessToken, data.refreshToken);
        queryClient.setQueryData(authQueryKeys.me, data.user);
      }
    },
  });

  const verifyAdminLoginMutation = useMutation({
    mutationFn: (data: VerifyAdminLoginDto) => authApi.verifyAdminLogin(data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      queryClient.setQueryData(authQueryKeys.me, data.user);
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (data: VerifyEmailDto) => authApi.verifyEmail(data),
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (data: ResetPasswordDto) => authApi.resetPassword(data),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileDto) => authApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.setQueryData(authQueryKeys.me, updatedUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearAuth();
      queryClient.removeQueries({ queryKey: authQueryKeys.me });
    },
  });

  const resendOtpMutation = useMutation({
    mutationFn: (email: string) => authApi.resendOtp(email),
  });

  const checkEmailMutation = useMutation({
    mutationFn: (email: string) => authApi.checkEmail(email),
  });

  const checkUsernameMutation = useMutation({
    mutationFn: (username: string) => authApi.checkUsername(username),
  });

  const checkPhoneMutation = useMutation({
    mutationFn: (phone: string) => authApi.checkPhone(phone),
  });

  return {
    user,
    accessToken,
    refreshToken,
    selectedAccountId,
    isAuthenticated,
    isLoading,
    hasHydrated,
    setAuth,
    clearAuth,
    setUser,
    setTokens,
    setSelectedAccountId,
    setLoading,
    setHasHydrated,
    meQuery,
    registerMutation,
    loginMutation,
    verifyAdminLoginMutation,
    verifyEmailMutation,
    forgotPasswordMutation,
    resetPasswordMutation,
    updateProfileMutation,
    logoutMutation,
    resendOtpMutation,
    checkEmailMutation,
    checkUsernameMutation,
    checkPhoneMutation,
  };
}
