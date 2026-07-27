import { z } from "zod";
import { VAULTBANK_IFSC_CODE } from "@/constants/accounts.constants";
import { AccountType, Currency } from "@/types/accounts.types";

export const openAccountSchema = z.object({
  type: z.nativeEnum(AccountType, {
    required_error: "Choose an account type.",
  }),
  currency: z.nativeEnum(Currency, {
    required_error: "Choose a currency.",
  }),
});

export const updateLimitsSchema = z
  .object({
    dailyTransferLimit: z.coerce
      .number()
      .min(100, "Daily limit must be at least 100.")
      .max(1_000_000, "Daily limit cannot exceed 1,000,000."),
    singleTxnLimit: z.coerce
      .number()
      .min(10, "Single transaction limit must be at least 10.")
      .max(500_000, "Single transaction limit cannot exceed 500,000."),
  })
  .refine((data) => data.singleTxnLimit <= data.dailyTransferLimit, {
    path: ["singleTxnLimit"],
    message: "Single transaction limit cannot exceed daily limit",
  });

export function addBeneficiarySchema(ownAccountNumbers: string[] = []) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100, "Name cannot exceed 100 characters.")
      .regex(/^[A-Za-z\s-]+$/, "Use letters, spaces, and hyphens only."),
    bankCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => value === VAULTBANK_IFSC_CODE,
        `IFSC code must be ${VAULTBANK_IFSC_CODE}.`,
      ),
    beneficiaryAccountNumber: z
      .string()
      .trim()
      .min(8, "Account number must be at least 8 digits.")
      .max(20, "Account number cannot exceed 20 digits.")
      .regex(/^\d+$/, "Account number must contain digits only.")
      .refine((value) => !ownAccountNumbers.includes(value), {
        message: "You cannot add one of your own accounts as a beneficiary.",
      }),
  });
}

export type OpenAccountFormValues = z.infer<typeof openAccountSchema>;
export type UpdateLimitsFormValues = z.infer<typeof updateLimitsSchema>;
export type AddBeneficiaryFormValues = z.infer<
  ReturnType<typeof addBeneficiarySchema>
>;
