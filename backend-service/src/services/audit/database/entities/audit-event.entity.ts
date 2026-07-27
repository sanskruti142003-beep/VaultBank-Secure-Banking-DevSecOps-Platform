import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditEventType {
  AUTH = 'auth',
  ACCOUNT = 'account',
  TRANSACTION = 'transaction',
  PAYMENT = 'payment',
  SYSTEM = 'system',
}

@Entity({ name: 'audit_events' })
@Index('idx_audit_events_actor_id', ['actorId'])
@Index('idx_audit_events_event_type', ['eventType'])
@Index('idx_audit_events_occurred_at', ['occurredAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: AuditEventType,
    enumName: 'audit_event_type_enum',
  })
  eventType!: AuditEventType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 64, nullable: true })
  actorRole!: string | null;

  @Column({ name: 'resource_type', type: 'varchar', length: 100 })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt!: Date;
}
