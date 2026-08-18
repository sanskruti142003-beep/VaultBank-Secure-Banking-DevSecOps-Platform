import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, Users, X } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AddBeneficiaryForm } from "@/components/accounts/AddBeneficiaryForm";
import { BeneficiaryCard } from "@/components/accounts/BeneficiaryCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonCard } from "@/components/common/SkeletonCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_UUID_PATTERN } from "@/constants/accounts.constants";
import { useBeneficiaries, useRemoveBeneficiary } from "@/hooks/useBeneficiaries";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import type { Beneficiary } from "@/types/accounts.types";

interface BeneficiariesManagerProps {
  accountId: string;
  embedded?: boolean;
}

function groupBeneficiaries(beneficiaries: Beneficiary[]) {
  return beneficiaries.reduce<Record<string, Beneficiary[]>>((groups, beneficiary) => {
    const letter = beneficiary.name.charAt(0).toUpperCase() || "#";
    groups[letter] = groups[letter] ? [...groups[letter], beneficiary] : [beneficiary];
    return groups;
  }, {});
}

function AddBeneficiarySheet({
  accountId,
  open,
  onClose,
}: {
  accountId: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-slate-950/40"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.aside
            animate={{ x: 0 }}
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
            exit={{ x: "100%" }}
            initial={{ x: "100%" }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-secondary">
                  Add beneficiary
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Save a recipient for faster transfers.
                </p>
              </div>
              <Button
                aria-label="Close add beneficiary"
                onClick={onClose}
                size="icon"
                variant="ghost"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AddBeneficiaryForm accountId={accountId} onSuccess={onClose} />
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function BeneficiariesManager({
  accountId,
  embedded = false,
}: BeneficiariesManagerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { beneficiaries, isLoading } = useBeneficiaries(accountId);
  const { removeBeneficiary } = useRemoveBeneficiary(accountId);
  const showSkeleton = useDelayedLoading(isLoading);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) {
      return beneficiaries;
    }
    return beneficiaries.filter(
      (beneficiary) =>
        beneficiary.name.toLowerCase().includes(query) ||
        beneficiary.beneficiaryAccountNumber.includes(query),
    );
  }, [beneficiaries, debouncedSearch]);

  const grouped = useMemo(() => groupBeneficiaries(filtered), [filtered]);
  const letters = Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-secondary">
              Beneficiaries
            </h2>
            <p className="mt-1 text-sm text-muted">
              Manage saved recipients for this account.
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            Add beneficiary
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-10"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or account number"
          value={search}
        />
      </div>

      {showSkeleton ? (
        <div className="space-y-3">
          <SkeletonCard variant="row" />
          <SkeletonCard variant="row" />
          <SkeletonCard variant="row" />
        </div>
      ) : beneficiaries.length === 0 ? (
        <EmptyState
          action={{
            label: "Add your first beneficiary",
            onClick: () => setSheetOpen(true),
          }}
          description="Save recipients to make faster transfers."
          icon={Users}
          title="No beneficiaries yet"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          description="Try a different name or account number."
          icon={Search}
          title="No matching beneficiaries"
        />
      ) : (
        <div className="space-y-5">
          {letters.map((letter) => (
            <section className="space-y-3" key={letter}>
              <h3 className="sticky top-16 z-10 bg-background/95 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted backdrop-blur">
                {letter}
              </h3>
              {grouped[letter].map((beneficiary) => (
                <BeneficiaryCard
                  accountId={accountId}
                  beneficiary={beneficiary}
                  key={beneficiary.id}
                  onRemove={removeBeneficiary}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <AddBeneficiarySheet
        accountId={accountId}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
      />
    </div>
  );
}

export function BeneficiariesPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id || !ACCOUNT_UUID_PATTERN.test(id)) {
    return <Navigate replace to="/accounts" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button onClick={() => document.dispatchEvent(new CustomEvent("open-beneficiary-sheet"))}>
            <Plus className="h-4 w-4" />
            Add beneficiary
          </Button>
        }
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Accounts", href: "/accounts" },
          { label: "Beneficiaries" },
        ]}
        subtitle="Manage saved recipients for faster transfers"
        title="Beneficiaries"
      />
      <Button onClick={() => navigate(`/accounts/${id}`)} variant="outline">
        Back to account
      </Button>
      <PageBeneficiariesManager accountId={id} />
    </div>
  );
}

function PageBeneficiariesManager({ accountId }: { accountId: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const open = () => setSheetOpen(true);
    document.addEventListener("open-beneficiary-sheet", open);
    return () => document.removeEventListener("open-beneficiary-sheet", open);
  }, []);

  return (
    <>
      <BeneficiariesManager accountId={accountId} />
      <AddBeneficiarySheet
        accountId={accountId}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
      />
    </>
  );
}
