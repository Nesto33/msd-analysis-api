import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AnalysisService } from './analysis.service';
import { Analysis } from './entities/analysis.entity';

type Row = Record<string, string | number | undefined>;

function buildFile(rows: Row[]): Express.Multer.File {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return { buffer, originalname: 'test.xlsx' } as Express.Multer.File;
}

// Deux lignes de standards "propres" (CV bas) pour un assay donné, sert de socle
// à la plupart des scénarios : le ref calculé vaudra alors le threshold (25 par défaut).
function cleanStandardRows(assay: string): Row[] {
  return [
    {
      Sample: 'S001',
      Assay: assay,
      'Calc. Conc. CV': 5,
      'Calc. Conc. Mean': 10,
    },
    {
      Sample: 'S007',
      Assay: assay,
      'Calc. Conc. CV': 5,
      'Calc. Conc. Mean': 10,
    },
  ];
}

describe('AnalysisService', () => {
  let service: AnalysisService;
  const save = jest.fn((analysis: Analysis) => Promise.resolve(analysis));

  beforeEach(async () => {
    save.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: getRepositoryToken(Analysis),
          useValue: { save, find: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('marks a sample "OK" and averages Calc. Conc. Mean when CV stays under the reference threshold', async () => {
    const rows: Row[] = [
      ...cleanStandardRows('IL6'),
      {
        Sample: 'P001',
        Assay: 'IL6',
        'Calc. Conc. CV': 10,
        'Calc. Conc. Mean': 20,
      },
      {
        Sample: 'P001',
        Assay: 'IL6',
        'Calc. Conc. CV': 12,
        'Calc. Conc. Mean': 22,
      },
    ];

    const analysis = await service.processAnalysis(buildFile(rows), {}, {});
    const result = analysis.results.find(
      (r) => r.sample === 'P001' && r.assay === 'IL6',
    );

    expect(result?.status).toBe('OK');
    expect(result?.finalValue).toBe((21).toFixed(4));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('marks the assay "Non analysé" when standards never satisfy the CV/LLOQ conditions', async () => {
    const rows: Row[] = [
      {
        Sample: 'S001',
        Assay: 'TNFa',
        'Calc. Conc. CV': 30,
        'Calc. Conc. Mean': 10,
      },
      {
        Sample: 'S007',
        Assay: 'TNFa',
        'Calc. Conc. CV': 30,
        'Calc. Conc. Mean': 10,
      },
      {
        Sample: 'P002',
        Assay: 'TNFa',
        'Calc. Conc. CV': 5,
        'Calc. Conc. Mean': 5,
      },
    ];

    const analysis = await service.processAnalysis(buildFile(rows), {}, {});
    const result = analysis.results.find(
      (r) => r.sample === 'P002' && r.assay === 'TNFa',
    );

    expect(result?.status).toBe('Non analysé');
    expect(result?.finalValue).toBe('Non analysé');
  });

  it('marks "ND" when Calc. Conc. CV is entirely missing and at least two other assays run hot (CV > 40%)', async () => {
    const rows: Row[] = [
      ...cleanStandardRows('A'),
      ...cleanStandardRows('B'),
      ...cleanStandardRows('C'),
      // Assay A et B : CV moyen > 40 pour l'échantillon P1 -> comptent comme "high CV"
      {
        Sample: 'P1',
        Assay: 'A',
        'Calc. Conc. CV': 50,
        'Calc. Conc. Mean': 100,
      },
      {
        Sample: 'P1',
        Assay: 'A',
        'Calc. Conc. CV': 50,
        'Calc. Conc. Mean': 100,
      },
      {
        Sample: 'P1',
        Assay: 'B',
        'Calc. Conc. CV': 45,
        'Calc. Conc. Mean': 90,
      },
      {
        Sample: 'P1',
        Assay: 'B',
        'Calc. Conc. CV': 45,
        'Calc. Conc. Mean': 90,
      },
      // Assay C : CV manquant pour les deux réplicats de P1
      { Sample: 'P1', Assay: 'C', 'Detection Range': 'Below Fit Curve Range' },
      { Sample: 'P1', Assay: 'C', 'Detection Range': 'Below Fit Curve Range' },
    ];

    const analysis = await service.processAnalysis(buildFile(rows), {}, {});
    const result = analysis.results.find(
      (r) => r.sample === 'P1' && r.assay === 'C',
    );

    expect(result?.status).toBe('ND');
    expect(result?.finalValue).toBe('ND');
  });

  it('marks "à reprendre" when N >= 2 other high-CV assays and a replicate falls in the detection range', async () => {
    const rows: Row[] = [
      ...cleanStandardRows('A'),
      ...cleanStandardRows('B'),
      ...cleanStandardRows('D'),
      {
        Sample: 'P2',
        Assay: 'A',
        'Calc. Conc. CV': 50,
        'Calc. Conc. Mean': 100,
      },
      {
        Sample: 'P2',
        Assay: 'A',
        'Calc. Conc. CV': 50,
        'Calc. Conc. Mean': 100,
      },
      {
        Sample: 'P2',
        Assay: 'B',
        'Calc. Conc. CV': 45,
        'Calc. Conc. Mean': 90,
      },
      {
        Sample: 'P2',
        Assay: 'B',
        'Calc. Conc. CV': 45,
        'Calc. Conc. Mean': 90,
      },
      {
        Sample: 'P2',
        Assay: 'D',
        'Calc. Conc. CV': 60,
        'Calc. Conc. Mean': 100,
        'Detection Range': 'In Detection Range',
      },
      {
        Sample: 'P2',
        Assay: 'D',
        'Calc. Conc. CV': 60,
        'Calc. Conc. Mean': 110,
        'Detection Range': 'Below Fit Curve Range',
      },
    ];

    const analysis = await service.processAnalysis(buildFile(rows), {}, {});
    const result = analysis.results.find(
      (r) => r.sample === 'P2' && r.assay === 'D',
    );

    expect(result?.status).toBe('à reprendre');
  });

  it('rejects a workbook missing the required "Sample"/"Assay" columns', async () => {
    const rows: Row[] = [{ Foo: 'bar' }];

    await expect(
      service.processAnalysis(buildFile(rows), {}, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a workbook that only contains standards ("S00…") and no real samples', async () => {
    const rows: Row[] = [...cleanStandardRows('IL6')];

    await expect(
      service.processAnalysis(buildFile(rows), {}, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a buffer that is not a valid Excel file', async () => {
    const brokenFile = {
      buffer: Buffer.from('not an excel file'),
      originalname: 'broken.xlsx',
    } as Express.Multer.File;

    await expect(service.processAnalysis(brokenFile, {}, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when no file is provided', async () => {
    await expect(
      service.processAnalysis(
        undefined as unknown as Express.Multer.File,
        {},
        {},
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
