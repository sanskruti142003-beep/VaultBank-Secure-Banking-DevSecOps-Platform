import { OpenAccountForm } from "@/components/accounts/OpenAccountForm";
import { PageHeader } from "@/components/common/PageHeader";

export function OpenAccountPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Accounts", href: "/accounts" },
          { label: "Open account" },
        ]}
        subtitle="Choose the account type and currency that fit your needs"
        title="Open new account"
      />
      <OpenAccountForm />
    </div>
  );
}
