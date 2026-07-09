import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

describe('AnalysisController', () => {
  let controller: AnalysisController;
  const processAnalysis = jest.fn();

  beforeEach(async () => {
    processAnalysis.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [{ provide: AnalysisService, useValue: { processAnalysis } }],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rejects the upload when no file is provided', async () => {
    await expect(
      controller.uploadAndAnalyze(
        undefined as unknown as Express.Multer.File,
        '{}',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(processAnalysis).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON params', async () => {
    const file = { originalname: 'test.xlsx' } as Express.Multer.File;
    await expect(
      controller.uploadAndAnalyze(file, '{not json'),
    ).rejects.toThrow(BadRequestException);
    expect(processAnalysis).not.toHaveBeenCalled();
  });

  it('sanitizes non-numeric lloqs/thresholds and forwards to the service', async () => {
    const file = { originalname: 'test.xlsx' } as Express.Multer.File;
    processAnalysis.mockResolvedValue({ id: '1' });

    const params = JSON.stringify({
      lloqs: { IL6: 'abc', TNFa: 12 },
      thresholds: { IL6: 25 },
    });
    await controller.uploadAndAnalyze(file, params);

    expect(processAnalysis).toHaveBeenCalledWith(
      file,
      { TNFa: 12 },
      { IL6: 25 },
    );
  });
});
