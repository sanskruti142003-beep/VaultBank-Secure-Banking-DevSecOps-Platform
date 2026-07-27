# Banking database foundation

This project provisions five isolated PostgreSQL bounded contexts. The current
NestJS monorepo implements Auth, Account, Transaction, and Payment. The
`audit_db` remains reserved for the later dedicated audit consumer.

| Service     | Database         | Runtime user          | Migration user         |
| ----------- | ---------------- | --------------------- | ---------------------- |
| Auth        | `user_db`        | `auth_service`        | `auth_migrator`        |
| Account     | `account_db`     | `account_service`     | `account_migrator`     |
| Transaction | `transaction_db` | `transaction_service` | `transaction_migrator` |
| Payment     | `payment_db`     | `payment_service`     | `payment_migrator`     |
| Audit       | `audit_db`       | `audit_service`       | `audit_migrator`       |

Migration users own their respective databases and are only for deployment.
Applications must use the runtime URLs. The audit runtime role only receives
`SELECT` and `INSERT`; triggers additionally reject updates and deletes.

## Start PostgreSQL

Copy `.env.infrastructure.example` to `.env`, replace all placeholders, then
start PostgreSQL:

```bash
docker compose up -d postgres
```

The init script runs only when the PostgreSQL data volume is first created. It
creates all databases, migration users, runtime users, schema privileges, and
default object privileges.

`docker/postgres/init.sh` passes the operator-provided environment values into
the SQL template. No database password is stored in `init.sql`.

## Apply migrations

Run migrations only after PostgreSQL reports healthy:

```bash
npm run migration:run:user
npm run migration:run:account
npm run migration:run:transaction
npm run migration:run:payment
```

Or run all four application migrations in dependency order:

```bash
npm run migration:run:all
```

Each CLI data source prefers its service-specific migration URL. Production
migration jobs must use the dedicated migrator identity, never the runtime
service role.

## Layout

Each app under `apps/` contains TypeORM entities, an initial reversible
migration, a runtime database module with `synchronize: false`, and a CLI data
source.

All monetary columns use `DECIMAL(18,4)`. Entity properties expose those values
as strings so JavaScript does not silently lose decimal precision.

## Service module usage

Import only the database module belonging to that microservice:

```ts
@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

Do not import all five database modules into one service. Cross-service data is
exchanged through RabbitMQ events and service APIs, never database joins.
