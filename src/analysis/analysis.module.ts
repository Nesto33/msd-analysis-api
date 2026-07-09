import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { Analysis } from './entities/analysis.entity';
import { MsdResult } from './entities/msd-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Analysis, MsdResult])], // Injecte les tables ici
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AnalysisModule {}
