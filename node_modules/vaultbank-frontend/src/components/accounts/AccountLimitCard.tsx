import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_LIMIT_DEFAULTS, formatCurrency } from "@/constants/accounts.constants";
import {
  updateLimitsSchema,
  type UpdateLimitsFormValues,
} from "@/lib/validations/accounts.schemas";
import { useUpdateLimits } from "@/hooks/useAccounts";
import type { Account } from "@/types/accounts.types";

interface AccountLimitCardProps {
  account: Account;
}

export function AccountLimitCard({ account }: AccountLimitCardProps) {
  const { updateLimits, isPending } = useUpdateLimits(account.id);
  const form = useForm<UpdateLimitsFormValues>({
    resolver: zodResolver(updateLimitsSchema),
    defaultValues: {
      dailyTransferLimit: Number(
        account.limits?.dailyTransferLimit ?? ACCOUNT_LIMIT_DEFAULTS.dailyTransferLimit,
      ),
      singleTxnLimit: Number(
        account.limits?.singleTxnLimit ?? ACCOUNT_LIMIT_DEFAULTS.singleTxnLimit,
      ),
    },
  });

  async function onSubmit(values: UpdateLimitsFormValues) {
    await updateLimits(values);
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-secondary">
            Transfer limits
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tune daily and single transaction limits for this account.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Daily limit
          </p>
          <p className="mt-2 text-xl font-bold text-secondary">
            {formatCurrency(
              account.limits?.dailyTransferLimit ??
                String(ACCOUNT_LIMIT_DEFAULTS.dailyTransferLimit),
              account.currency,
            )}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Single transfer
          </p>
          <p className="mt-2 text-xl font-bold text-secondary">
            {formatCurrency(
              account.limits?.singleTxnLimit ??
                String(ACCOUNT_LIMIT_DEFAULTS.singleTxnLimit),
              account.currency,
            )}
          </p>
        </div>
      </div>

      <form className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
        <label className="text-sm font-medium text-secondary">
          Daily transfer limit
          <Input
            className="mt-2"
            hasError={Boolean(form.formState.errors.dailyTransferLimit)}
            min={100}
            type="number"
            {...form.register("dailyTransferLimit")}
          />
          {form.formState.errors.dailyTransferLimit ? (
            <span className="mt-1 block text-xs text-danger">
              {form.formState.errors.dailyTransferLimit.message}
            </span>
          ) : null}
        </label>
        <label className="text-sm font-medium text-secondary">
          Single transaction limit
          <Input
            className="mt-2"
            hasError={Boolean(form.formState.errors.singleTxnLimit)}
            min={10}
            type="number"
            {...form.register("singleTxnLimit")}
          />
          {form.formState.errors.singleTxnLimit ? (
            <span className="mt-1 block text-xs text-danger">
              {form.formState.errors.singleTxnLimit.message}
            </span>
          ) : null}
        </label>
        <Button className="self-end" disabled={isPending} type="submit">
          {isPending ? "Saving..." : "Save limits"}
        </Button>
      </form>
    </section>
  );
}
