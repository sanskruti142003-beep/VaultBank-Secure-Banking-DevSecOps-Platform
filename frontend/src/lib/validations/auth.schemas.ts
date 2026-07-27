import { z } from "zod";
import { normalizePhone } from "@/lib/utils";
import { PASSWORD_MIN_LENGTH } from "@/constants/auth.constants";

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Full name must be at least 2 characters.")
  .max(100, "Full name must be 100 characters or fewer.")
  .regex(/^[A-Za-z\s'-]+$/, "Use letters, spaces, apostrophes, or hyphens.");

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(40, "Username must be 40 characters or fewer.")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Use letters, numbers, dots, underscores, or hyphens.",
  )
  .transform((value) => value.toLowerCase());

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number.")
  .refine(
    (value) => /^\+[1-9]\d{9,14}$/.test(normalizePhone(value)),
    "Enter a valid phone number with country code.",
  );

export const passwordRules = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "upper",
    label: "One uppercase letter (A-Z)",
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    id: "lower",
    label: "One lowercase letter (a-z)",
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number (0-9)",
    test: (value: string) => /\d/.test(value),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&*)",
    test: (value: string) => /[!@#$%^&*]/.test(value),
  },
] as const;

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  )
  .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter.")
  .refine((value) => /[a-z]/.test(value), "Add a lowercase letter.")
  .refine((value) => /\d/.test(value), "Add a number.")
  .refine((value) => /[!@#$%^&*]/.test(value), "Add a special character.");

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    username: usernameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
    acceptTerms: z
      .boolean()
      .refine(
        (value) => value,
        "You must accept the terms and privacy policy.",
      ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean().default(false),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
export type LoginFormValues = z.infer<typeof loginSchema>;
export type VerifyEmailFormValues = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
