import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SystemLogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

@Entity({ name: 'system_logs' })
@Index('idx_system_logs_service_name', ['serviceName'])
@Index('idx_system_logs_occurred_at', ['occurredAt'])
export class SystemLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_name', type: 'varchar', length: 100 })
  serviceName!: string;

  @Column({
    type: 'enum',
    enum: SystemLogLevel,
    enumName: 'system_log_level_enum',
  })
  level!: SystemLogLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  context!: Record<string, unknown>;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt!: Date;
}
