import { Controller, Post, UseInterceptors, UploadedFile, Body, Get, Param, Res} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnalysisService } from './analysis.service';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body('params') paramsString: string // Les paramètres (LLOQ/Thresholds) envoyés sous forme de chaîne JSON
  ) {
    // Parser les paramètres reçus du Front-end
    const params = paramsString ? JSON.parse(paramsString) : { lloqs: {}, thresholds: {} };
    
    return this.analysisService.processAnalysis(file, params.lloqs, params.thresholds);
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
      return res.status(404).json({ message: "Analyse introuvable" });
    }

    // 2. Préparer les données pour l'onglet "Statuts"
    const statusRows = analysis.results.map(r => ({
      'Échantillon': r.sample,
      'Assay': r.assay,
      'Statut': r.status,
      'Valeur Calculée': r.finalValue
    }));

    // 3. Préparer les données pour l'onglet "Moyennes" (Logique simplifiée de groupe)
    // On regroupe par Échantillon + Assay pour calculer la moyenne si nécessaire
    const meanRows: any[] = [];
    // Remplis ici avec ta logique de calcul de moyenne si ton tableau d'origine le demande, 
    // ou exporte directement une version pivotée. Exemple simple :
    statusRows.forEach(row => {
      meanRows.push({
        'Échantillon': row['Échantillon'],
        'Assay': row['Assay'],
        'Moyenne': row['Valeur Calculée']
      });
    });

    // 4. Créer le classeur Excel avec la bibliothèque 'xlsx'
    const wb = XLSX.utils.book_new();
    
    const wsStatus = XLSX.utils.json_to_sheet(statusRows);
    const wsMean = XLSX.utils.json_to_sheet(meanRows);
    
    XLSX.utils.book_append_sheet(wb, wsStatus, "Statuts");
    XLSX.utils.book_append_sheet(wb, wsMean, "Moyennes");

    // 5. Convertir en Buffer et envoyer le fichier au navigateur
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', `attachment; filename=Rapport_MSD_${analysis.fileName}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  }
  }