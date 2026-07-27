import { useMemo } from "react";
import { MoreVertical, ShieldCheck, Clock, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { maskAccountNumber } from "@/constants/accounts.constants";
import type { Beneficiary } from "@/types/accounts.types";

interface BeneficiaryCardProps {
  beneficiary: Beneficiary;
  accountId: string;
  onRemove: (beneficiaryId: string) => Promise<void>;
}

const avatarColors = [
  "bg-primary text-white",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function colorFromName(name: string): string {
  const hash = name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

export function BeneficiaryCard({
  beneficiary,
  accountId,
  onRemove,
}: BeneficiaryCardProps) {
  const avatarClass = useMemo(
    () => colorFromName(beneficiary.name),
    [beneficiary.name],
  );

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}
        >
          {initials(beneficiary.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-secondary">
            {beneficiary.name}
          </h3>
          <p className="mt-1 text-sm text-muted">Bank: {beneficiary.bankCode}</p>
          <p className="mt-1 text-sm font-medium text-muted">
            {maskAccountNumber(beneficiary.beneficiaryAccountNumber)}
          </p>
          <span
            className={
              beneficiary.isVerified
                ? "mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                : "mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
            }
          >
            {beneficiary.isVerified ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            {beneficiary.isVerified ? "Verified" : "Unverified"}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:self-end">
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-secondary shadow-sm transition hover:bg-slate-50"
            to={`/transactions/new?from=${accountId}&to=${beneficiary.beneficiaryAccountNumber}`}
          >
            <Send className="h-4 w-4" />
            Transfer
          </Link>
          <ConfirmDialog
            confirmLabel="Remove"
            description={`Remove ${beneficiary.name} from your saved beneficiaries.`}
            onConfirm={() => onRemove(beneficiary.id)}
            title="Remove beneficiary?"
            trigger={
              <Button aria-label="Beneficiary actions" size="icon" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            }
            variant="danger"
          />
          <span className="sr-only">
            <Trash2 className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
