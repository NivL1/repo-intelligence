import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EdgeKind = 'calls' | 'implements' | 'extends' | 'injects';

/** A directed relationship between two symbols in the same repository. */
@Entity({ name: 'edges' })
export class Edge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'repository_id' })
  repositoryId!: string;

  @Column({ type: 'uuid', name: 'from_symbol_id' })
  fromSymbolId!: string;

  @Column({ type: 'uuid', name: 'to_symbol_id' })
  toSymbolId!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: EdgeKind;
}
