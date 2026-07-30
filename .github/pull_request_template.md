## Summary

- What changed:
- Why it changed:

## DevSecOps Checklist

- [ ] `config/service-map.txt` is still the source of truth for deployable services.
- [ ] No secrets, private keys, `.env` files, or generated reports were committed.
- [ ] Backend changes passed `npm run lint:check`, `npm run build:all`, `npm test`, and `npm run test:cov:all`.
- [ ] Frontend changes passed `npm run typecheck` and `npm run build`.
- [ ] Dockerfile changes were reviewed for non-root runtime and no secret build args.
- [ ] Security exceptions include owner, reason, compensating control, ticket, and expiry.
- [ ] Jenkins phases 1-10 are expected to pass before merge.

## Risk / Rollback

- Risk:
- Rollback plan:
