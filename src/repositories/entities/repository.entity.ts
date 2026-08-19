import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RepositoryStatus = 'pending' | 'cloning' | 'indexing' | 'ready' | 'failed';

@Entity({ name: 'repositories' })
export class Repository {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Display name, unique per install — e.g. "NivL1/nestjs-ai-starter". */
  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  /** Git URL or absolute local path the working copy came from. */
  @Column({ type: 'text' })
  source!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: RepositoryStatus;

  @Column({ type: 'varchar', length: 64, name: 'indexed_commit', nullable: true })
  indexedCommit!: string | null;

  @Column({ type: 'timestamptz', name: 'indexed_at', nullable: true })
  indexedAt!: Date | null;

  /** Populated when status is 'failed', so the API can explain what went wrong. */
  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
