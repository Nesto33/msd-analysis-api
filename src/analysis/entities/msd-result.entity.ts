import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Analysis } from './analysis.entity';

@Entity('msd_results')
export class MsdResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sample!: string;

  @Column({ type: 'varchar' })
  assay!: string;

  // Statut final : "OK", "ND", "à reprendre", "Non analysé"
  @Column({ type: 'varchar' })
  status!: string;

  // Stocke la valeur finale calculée. On accepte 'string' pour gérer "ND", "à reprendre" ou un chiffre textuel
  @Column({ type: 'varchar' })
  finalValue!: string;

  // On lie ce résultat à son analyse parente
  @ManyToOne(() => Analysis, (analysis) => analysis.results, {
    onDelete: 'CASCADE',
  })
  analysis!: Analysis;
}
