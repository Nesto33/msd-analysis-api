import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';

@Module({
  imports: [
    // Permet de lire les variables d'environnement si besoin plus tard
    ConfigModule.forRoot(),
    
    // Configuration de la connexion PostgreSQL
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'msd_user',
      password: 'msd_password',
      database: 'msd_db',
      autoLoadEntities: true, // Charge automatiquement les entités qu'on va créer
      synchronize: true,      // À désactiver en production, mais parfait en dev : crée/modifie les tables automatiquement selon tes entités
    }),
    
    AnalysisModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}