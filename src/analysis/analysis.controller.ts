import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Get,
  Param,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnalysisService } from './analysis.service';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
          callback(
            new BadRequestException('Seuls les fichiers .xlsx sont acceptés.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body('params') paramsString: string, // Les paramètres (LLOQ/Thresholds) envoyés sous forme de chaîne JSON
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni.');
    }

    const params = this.parseParams(paramsString);

    return this.analysisService.processAnalysis(
      file,
      params.lloqs,
      params.thresholds,
    );
  }

  private parseParams(paramsString: string): {
    lloqs: Record<string, number>;
    thresholds: Record<string, number>;
  } {
    if (!paramsString) {
      return { lloqs: {}, thresholds: {} };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(paramsString);
    } catch {
      throw new BadRequestException(
        'Le format des paramètres (LLOQ/thresholds) est invalide.',
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadRequestException(
        'Le format des paramètres (LLOQ/thresholds) est invalide.',
      );
    }

    const { lloqs, thresholds } = parsed as {
      lloqs?: unknown;
      thresholds?: unknown;
    };
    return {
      lloqs: this.sanitizeNumericRecord(lloqs),
      thresholds: this.sanitizeNumericRecord(thresholds),
    };
  }

  private sanitizeNumericRecord(value: unknown): Record<string, number> {
    if (typeof value !== 'object' || value === null) {
      return {};
    }

    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num)) {
        result[key] = num;
      }
    }
    return result;
  }

  @Get()
  async findAll() {
    return this.analysisService.findAll();
  }

  @Get(':id/export')
  async exportToExcel(@Param('id') id: string, @Res() res: Response) {
    // 1. Récupérer l'analyse depuis PostgreSQL
    const analysis = await this.analysisService.findOne(id); // Assure-toi d'avoir cette méthode dans ton service
    if (!analysis) {
      return res.status(404).json({ message: 'Analyse introuvable' });
    }

    // 2. Préparer les données pour l'onglet "Statuts"
    const statusRows = analysis.results.map((r) => ({
      Échantillon: r.sample,
      Assay: r.assay,
      Statut: r.status,
      'Valeur Calculée': r.finalValue,
    }));

    // 3. Préparer les données pour l'onglet "Moyennes" (Logique simplifiée de groupe)
    // On regroupe par Échantillon + Assay pour calculer la moyenne si nécessaire
    const meanRows = statusRows.map((row) => ({
      Échantillon: row['Échantillon'],
      Assay: row['Assay'],
      Moyenne: row['Valeur Calculée'],
    }));

    // 4. Créer le classeur Excel avec la bibliothèque 'xlsx'
    const wb = XLSX.utils.book_new();

    const wsStatus = XLSX.utils.json_to_sheet(statusRows);
    const wsMean = XLSX.utils.json_to_sheet(meanRows);

    XLSX.utils.book_append_sheet(wb, wsStatus, 'Statuts');
    XLSX.utils.book_append_sheet(wb, wsMean, 'Moyennes');

    // 5. Convertir en Buffer et envoyer le fichier au navigateur
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Rapport_MSD_${analysis.fileName}`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return res.send(buf);
  }
}
