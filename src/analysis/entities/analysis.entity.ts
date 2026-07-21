import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { MsdResult } from './msd-result.entity';

@Entity('analyses')
export class Analysis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @CreateDateColumn()
  createdAt!: Date;

  // Relation un-à-plusieurs : Une analyse contient plusieurs lignes de résultats
  @OneToMany(() => MsdResult, (result) => result.analysis, { cascade: true })
  results!: MsdResult[];
}
