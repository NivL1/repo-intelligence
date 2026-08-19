import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SymbolKind = 'class' | 'interface' | 'function' | 'method';

/** A named, compiler-resolved thing: a class, method, function, or interface. */
@Entity({ name: 'symbols' })
export class CodeSymbol {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'repository_id' })
  repositoryId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** e.g. "SearchService.search" for a method, "SearchService" for its class. */
  @Column({ type: 'varchar', length: 512, name: 'qualified_name' })
  qualifiedName!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: SymbolKind;

  @Column({ type: 'text', name: 'file_path' })
  filePath!: string;

  @Column({ type: 'integer', name: 'start_line' })
  startLine!: number;

  @Column({ type: 'integer', name: 'end_line' })
  endLine!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
