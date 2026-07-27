import { useEffect } from "react";
import { Link } from "react-router-dom";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageTransition } from "@/components/common/PageTransition";
import { AUTH_COPY, PAGE_TITLES, ROUTES } from "@/constants/auth.constants";

export function RegisterPage() {
  useEffect(() => {
    document.title = PAGE_TITLES.register;
  }, []);

  return (
    <PageTransition className="space-y-6">
      <div className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          {AUTH_COPY.register.title}
        </h1>
        <p className="text-sm text-muted">{AUTH_COPY.register.subtitle}</p>
      </div>

      <RegisterForm />

      <p className="text-center text-sm text-muted">
        {AUTH_COPY.register.hasAccount}{" "}
        <Link
          className="font-medium text-primary transition hover:text-primary-dark"
          to={ROUTES.login}
        >
          {AUTH_COPY.register.signIn}
        </Link>
      </p>
    </PageTransition>
  );
}
