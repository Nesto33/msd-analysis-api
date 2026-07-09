import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Analysis } from './entities/analysis.entity';
import { MsdResult } from './entities/msd-result.entity';

interface ExcelRow {
  Sample: string;
  Assay: string;
  'Calc. Conc. CV'?: number;
  'Calc. Conc. Mean'?: number;
  'Detection Range'?: string;
  'Calc. Concentration'?: number;
}

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Analysis)
    private analysisRepository: Repository<Analysis>,
  ) {}

  async findAll() {
    return this.analysisRepository.find({
      relations: {
        results: true, // Syntaxe moderne et typée de TypeORM
      },
      order: { createdAt: 'DESC' },
    });
  }

  async processAnalysis(
    file: Express.Multer.File,
    lloqs: Record<string, number>,
    thresholds: Record<string, number>,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier fourni.');

    // 1. Lire le fichier Excel depuis le buffer mémoire
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException(
        "Le fichier fourni n'est pas un classeur Excel valide.",
      );
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException(
        'Le fichier Excel ne contient aucune feuille.',
      );
    }

    const rawData: ExcelRow[] = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName],
    );

    if (rawData.length === 0) {
      throw new BadRequestException('Le fichier Excel est vide.');
    }

    const firstRow = rawData[0];
    if (!('Sample' in firstRow) || !('Assay' in firstRow)) {
      throw new BadRequestException(
        'Colonnes manquantes : le fichier doit contenir au minimum les colonnes "Sample" et "Assay".',
      );
    }

    // 2. Isoler les standards (commençant par "S00") et les échantillons
    const standards = rawData.filter(
      (r) => r.Sample && r.Sample.startsWith('S00'),
    );
    const samples = rawData.filter(
      (r) => r.Sample && !r.Sample.startsWith('S00'),
    );

    if (samples.length === 0) {
      throw new BadRequestException(
        'Aucun échantillon à analyser (uniquement des standards "S00…" trouvés).',
      );
    }

    // 3. Calculer les valeurs de référence par Assay (Logique "standards")
    const referenceValues = this.calculateReferenceValues(
      standards,
      lloqs,
      thresholds,
    );

    // Groupement des échantillons par [Sample + Assay]
    const groupedSamples = this.groupBySampleAndAssay(samples);
    const finalResults: Partial<MsdResult>[] = [];

    // 4. Traitement principal de la logique MSD
    // 4. Traitement principal de la logique MSD
    for (const key in groupedSamples) {
      const group = groupedSamples[key];
      // Correction ici : On extrait "Sample" et "Assay" avec leurs majuscules d'origine
      const { Sample, Assay } = group[0];
      const ref = referenceValues[Assay];

      if (ref === undefined || ref === null) {
        // Assay non valide
        finalResults.push({
          sample: Sample,
          assay: Assay,
          status: 'Non analysé',
          finalValue: 'Non analysé',
        });
        continue;
      }

      // Calculer la moyenne du Calc. Conc. CV pour le groupe
      const validCvs = group
        .map((g) => g['Calc. Conc. CV'])
        .filter((v) => v !== undefined && v !== null);
      const calcConcCvMean = validCvs.length
        ? validCvs.reduce((a, b) => a + b, 0) / validCvs.length
        : NaN;

      // Vérifier si toutes les valeurs de "Calc. Conc. CV" sont NaN
      if (validCvs.length === 0) {
        const { status, val } = this.handleNaConditions(
          Sample,
          Assay,
          group,
          samples,
        );
        finalResults.push({
          sample: Sample,
          assay: Assay,
          status,
          finalValue: String(val),
        });
      } else if (calcConcCvMean < ref) {
        // Condition idéale : CV sous le seuil de référence
        const means = group
          .map((g) => g['Calc. Conc. Mean'])
          .filter((v) => v !== undefined);
        const finalMean = means.reduce((a, b) => a + b, 0) / means.length;
        finalResults.push({
          sample: Sample,
          assay: Assay,
          status: 'OK',
          finalValue: finalMean.toFixed(4),
        });
      } else {
        // Le CV dépasse le seuil : On applique les cas complexes (N)
        const { status, val } = this.handleHighCvConditions(
          Sample,
          Assay,
          group,
          standards,
          samples,
        );
        finalResults.push({
          sample: Sample,
          assay: Assay,
          status,
          finalValue: String(val),
        });
      }
    }

    // 5. Sauvegarde persistante en Base de Données
    const analysis = new Analysis();
    analysis.fileName = file.originalname;
    analysis.results = finalResults.map((r) => {
      const res = new MsdResult();
      res.sample = r.sample!;
      res.assay = r.assay!;
      res.status = r.status!;
      res.finalValue = r.finalValue!;
      return res;
    });

    return this.analysisRepository.save(analysis);
  }

  // --- Fonctions utilitaires internes traduisant ton code Python ---

  private calculateReferenceValues(
    standards: ExcelRow[],
    lloqs: Record<string, number>,
    thresholds: Record<string, number>,
  ) {
    const refs: Record<string, number | null> = {};
    const assays = Array.from(new Set(standards.map((s) => s.Assay)));

    for (const assay of assays) {
      const assayStandards = standards.filter((s) => s.Assay === assay);
      const threshold = thresholds[assay] ?? 25;

      const allBelowThreshold = assayStandards.every(
        (s) => (s['Calc. Conc. CV'] ?? 0) < threshold,
      );

      if (allBelowThreshold) {
        refs[assay] = threshold;
      } else {
        const nonS007Below = assayStandards
          .filter((s) => s.Sample !== 'S007')
          .every((s) => (s['Calc. Conc. CV'] ?? 0) < threshold);
        const s007 = assayStandards.find((s) => s.Sample === 'S007');

        if (nonS007Below && s007 && s007['Calc. Conc. Mean'] !== undefined) {
          const s007Mean = s007['Calc. Conc. Mean'];
          const lloq = lloqs[assay] ?? Infinity;
          refs[assay] = s007Mean < lloq ? s007Mean : threshold;
        } else {
          refs[assay] = null; // Assay Invalide
        }
      }
    }
    return refs;
  }

  private handleNaConditions(
    sample: string,
    assay: string,
    group: ExcelRow[],
    allSamples: ExcelRow[],
  ) {
    const highCvCount = this.countHighCvOtherAssays(sample, allSamples);

    if (highCvCount >= 2) {
      return { status: 'ND', val: 'ND' };
    } else {
      const allBelowFit = group.every(
        (g) => g['Detection Range'] === 'Below Fit Curve Range',
      );
      if (allBelowFit) {
        return { status: 'ND', val: 'ND' };
      } else {
        const validConc = group.find(
          (g) =>
            g['Detection Range'] !== 'Below Fit Curve Range' &&
            g['Calc. Concentration'] !== undefined,
        );
        return validConc
          ? {
              status: 'Valid Concentration',
              val: validConc['Calc. Concentration']!,
            }
          : { status: 'ND', val: 'ND' };
      }
    }
  }

  private handleHighCvConditions(
    sample: string,
    assay: string,
    group: ExcelRow[],
    standards: ExcelRow[],
    allSamples: ExcelRow[],
  ) {
    const N = this.countHighCvOtherAssays(sample, allSamples);
    const means = group
      .map((g) => g['Calc. Conc. Mean'])
      .filter((v) => v !== undefined);
    const meanConcentration = means.reduce((a, b) => a + b, 0) / means.length;
    const hasDetectionRange = group.some((g) =>
      g['Detection Range']?.includes('In Detection Range'),
    );

    if (N >= 2) {
      const s007 = standards.find(
        (s) => s.Assay === assay && s.Sample === 'S007',
      );
      const s007Mean = s007 ? (s007['Calc. Conc. Mean'] ?? 0) : 0;

      if (meanConcentration < s007Mean && !hasDetectionRange) {
        return { status: 'ND', val: 'ND' };
      } else {
        return { status: 'à reprendre', val: 'à reprendre' };
      }
    } else {
      // Pour N == 1 ou N == 0
      const detectionRangeCount = group.filter((g) =>
        g['Detection Range']?.includes('In Detection Range'),
      ).length;
      if (detectionRangeCount === 1) {
        const inRangeRow = group.find(
          (g) => g['Detection Range'] === 'In Detection Range',
        );
        return {
          status: 'In Range',
          val: inRangeRow?.['Calc. Concentration'] ?? meanConcentration,
        };
      }
      return { status: 'Mean', val: meanConcentration.toFixed(4) };
    }
  }

  private countHighCvOtherAssays(
    sample: string,
    allSamples: ExcelRow[],
  ): number {
    const sampleRows = allSamples.filter((s) => s.Sample === sample);
    const assayCvs: Record<string, number[]> = {};

    sampleRows.forEach((r) => {
      if (r['Calc. Conc. CV'] !== undefined && r['Calc. Conc. CV'] !== null) {
        if (!assayCvs[r.Assay]) assayCvs[r.Assay] = [];
        assayCvs[r.Assay].push(r['Calc. Conc. CV']);
      }
    });

    let highCvCount = 0;
    for (const assay in assayCvs) {
      const avg =
        assayCvs[assay].reduce((a, b) => a + b, 0) / assayCvs[assay].length;
      if (avg > 40) highCvCount++;
    }
    return highCvCount;
  }

  private groupBySampleAndAssay(
    samples: ExcelRow[],
  ): Record<string, ExcelRow[]> {
    return samples.reduce(
      (groups, item) => {
        const key = `${item.Sample}-${item.Assay}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return groups;
      },
      {} as Record<string, ExcelRow[]>,
    );
  }

  async findOne(id: string): Promise<Analysis | null> {
    return this.analysisRepository.findOne({
      where: { id },
      relations: {
        results: true, // <-- Remplace ['results'] par cet objet
      },
    });
  }
}
