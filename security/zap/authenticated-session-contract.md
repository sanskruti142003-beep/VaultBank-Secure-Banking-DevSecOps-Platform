# Authenticated ZAP Session Contract

Target host for staging:

```text
https://staging.vaultbank.internal
```

Login request:

```http
POST /v1/auth/login
Content-Type: application/json
```

Request JSON:

```json
{
  "username": "<ZAP_CUSTOMER_USERNAME>",
  "password": "<ZAP_CUSTOMER_PASSWORD>",
  "role": "customer"
}
```

Expected successful response:

- HTTP status: `201`
- Access token JSON path: `data.access_token`
- Refresh token JSON path: `data.refresh_token`
- Role: `customer`
- Account state: active and email verified

Authenticated verification request:

```http
GET /v1/auth/me
Authorization: Bearer <data.access_token>
```

Logged-in indicator:

- HTTP `200`
- JSON has `"success": true`
- JSON has `data.email`

Logged-out or expired-token indicator:

- HTTP `401`
- JSON has `"success": false`
- JSON has `error.code` equal to `UNAUTHORIZED`

Logout request:

```http
POST /v1/auth/logout
Authorization: Bearer <data.access_token>
```

Session expiration:

- Access token expires after 15 minutes.
- Refresh token expires after 7 days.
- ZAP should re-authenticate through `/v1/auth/login` instead of using admin,
  personal, or production identities.

Route-discovery failure rules:

- `400` on malformed login JSON means the route reached auth-service.
- `401` on one controlled invalid-credential request confirms the negative
  authentication contract.
- `405` means the request reached the wrong route, usually frontend catch-all.
- `429` means Redis rate limiting is active and must not be treated as success.
- `500` is an application defect and blocks ZAP progression.

Credential handling:

- Store `ZAP_CUSTOMER_USERNAME`, `ZAP_CUSTOMER_EMAIL`, and
  `ZAP_CUSTOMER_PASSWORD` in Vault or Jenkins Credentials.
- Mirror them into the protected `zap-staging-customer` Kubernetes Secret before
  Argo CD sync.
- Do not commit the values to Git.
