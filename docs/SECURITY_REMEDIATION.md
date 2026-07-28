# Security Remediation Notes

## Development TLS certificate

The Nginx development certificate and private key are generated locally by
`backend-service/nginx/scripts/generate-certs.sh` and must not be tracked in
Git.

Current repository cleanup:

- `backend-service/nginx/certs/*.crt` is ignored.
- `backend-service/nginx/certs/*.key` is ignored.
- Existing local certificate files can stay on a developer machine for local
  HTTPS testing.

History cleanup still requires a coordinated repository maintenance step:

1. Rotate or regenerate any certificate/key pair that was committed.
2. Rewrite Git history with an approved secret-removal tool, such as
   `git filter-repo` or BFG Repo-Cleaner.
3. Force-push the rewritten branch during a maintenance window.
4. Ask every developer to re-clone or carefully rebase from the rewritten
   history.

Do not perform this rewrite during normal feature work because it changes
commit history for everyone using the repository.
