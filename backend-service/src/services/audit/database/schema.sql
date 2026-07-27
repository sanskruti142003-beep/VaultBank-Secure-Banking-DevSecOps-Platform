CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE audit_event_type_enum AS ENUM (
  'auth', 'account', 'transaction', 'payment', 'system'
);
CREATE TYPE system_log_level_enum AS ENUM ('info', 'warn', 'error', 'fatal');

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type audit_event_type_enum NOT NULL,
  actor_id UUID,
  actor_role VARCHAR(64),
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  action VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) NOT NULL,
  level system_log_level_enum NOT NULL,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_occurred_at ON audit_events(occurred_at);
CREATE INDEX idx_system_logs_service_name ON system_logs(service_name);
CREATE INDEX idx_system_logs_occurred_at ON system_logs(occurred_at);

CREATE FUNCTION prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit records are append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER system_logs_append_only
BEFORE UPDATE OR DELETE ON system_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

REVOKE ALL ON audit_events, system_logs FROM audit_service;
GRANT SELECT, INSERT ON audit_events, system_logs TO audit_service;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON audit_events, system_logs FROM audit_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audit_service;
