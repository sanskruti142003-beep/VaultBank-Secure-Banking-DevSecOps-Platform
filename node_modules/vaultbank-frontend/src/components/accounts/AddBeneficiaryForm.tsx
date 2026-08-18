import { useEffect, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { UserPlus } from "lucide-react";
import { BeneficiaryCard } from "@/components/accounts/BeneficiaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAccountErrorMessage,
  VAULTBANK_IFSC_CODE,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { useAddBeneficiary } from "@/hooks/useBeneficiaries";
import {
  addBeneficiarySchema,
  type AddBeneficiaryFormValues,
} from "@/lib/validations/accounts.schemas";
import type { Beneficiary } from "@/types/accounts.types";

interface AddBeneficiaryFormProps {
  accountId: string;
  onSuccess: () => void;
}

export function AddBeneficiaryForm({
  accountId,
  onSuccess,
}: AddBeneficiaryFormProps) {
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const { accounts } = useAccounts();
  const ownAccountNumbers = accounts.map((account) => account.accountNumber);
  const schema = useMemo(
    () => addBeneficiarySchema(ownAccountNumbers),
    [ownAccountNumbers],
  );
  const { addBeneficiary, isPending, error } = useAddBeneficiary(accountId);
  const form = useForm<AddBeneficiaryFormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: "",
      bankCode: VAULTBANK_IFSC_CODE,
      beneficiaryAccountNumber: "",
    },
  });
  const { ref: nameRef, ...nameRegister } = form.register("name");
  const values = form.watch();
  const previewResult = schema.safeParse(values);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  async function onSubmit(data: AddBeneficiaryFormValues) {
    await addBeneficiary({ ...data, bankCode: VAULTBANK_IFSC_CODE });
    form.reset({
      name: "",
      bankCode: VAULTBANK_IFSC_CODE,
      beneficiaryAccountNumber: "",
    });
    onSuccess();
  }

  const preview: Beneficiary | null = previewResult.success
    ? {
        id: "preview",
        accountId,
        name: previewResult.data.name,
        bankCode: previewResult.data.bankCode,
        beneficiaryAccountNumber: previewResult.data.beneficiaryAccountNumber,
        isVerified: false,
        createdAt: new Date().toISOString(),
      }
    : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <label className="block text-sm font-medium text-secondary">
        Recipient's full name
        <Input
          className="mt-2"
          hasError={Boolean(form.formState.errors.name)}
          placeholder="John Smith"
          {...nameRegister}
          ref={(element) => {
            nameRef(element);
            firstInputRef.current = element;
          }}
        />
        <span className="mt-1 block text-xs text-muted">
          Enter name as it appears on their bank account.
        </span>
        {form.formState.errors.name ? (
          <span className="mt-1 block text-xs text-danger">
            {form.formState.errors.name.message}
          </span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-secondary">
        IFSC Code
        <Input
          className="mt-2 bg-slate-50 font-semibold uppercase"
          hasError={Boolean(form.formState.errors.bankCode)}
          readOnly
          {...form.register("bankCode")}
        />
        <span className="mt-1 block text-xs text-muted">
          VaultBank IFSC is applied automatically.
        </span>
        {form.formState.errors.bankCode ? (
          <span className="mt-1 block text-xs text-danger">
            {form.formState.errors.bankCode.message}
          </span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-secondary">
        Account number
        <Input
          className="mt-2"
          hasError={Boolean(form.formState.errors.beneficiaryAccountNumber)}
          inputMode="numeric"
          placeholder="Enter account number"
          {...form.register("beneficiaryAccountNumber")}
        />
        {form.formState.errors.beneficiaryAccountNumber ? (
          <span className="mt-1 block text-xs text-danger">
            {form.formState.errors.beneficiaryAccountNumber.message}
          </span>
        ) : null}
      </label>

      <AnimatePresence>
        {preview ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: 8 }}
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              <UserPlus className="h-4 w-4" />
              Preview
            </p>
            <BeneficiaryCard
              accountId={accountId}
              beneficiary={preview}
              onRemove={async () => undefined}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {getAccountErrorMessage(error.code)}
        </p>
      ) : null}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Adding..." : "Add beneficiary"}
      </Button>
    </form>
  );
}
