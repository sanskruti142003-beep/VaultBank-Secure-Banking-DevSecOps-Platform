import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-muted">
              {breadcrumbs.map((breadcrumb, index) => (
                <li className="flex items-center gap-1" key={breadcrumb.label}>
                  {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  {breadcrumb.href ? (
                    <Link className="hover:text-primary" to={breadcrumb.href}>
                      {breadcrumb.label}
                    </Link>
                  ) : (
                    <span className="text-secondary">{breadcrumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-2xl font-bold tracking-normal text-secondary sm:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}
