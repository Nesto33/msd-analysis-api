import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';

@Module({
  imports: [
    // Rend les variables d'environnement (.env) disponibles dans toute l'application
    ConfigModule.forRoot({ isGlobal: true }),

    // Configuration de la connexion PostgreSQL, lue depuis les variables d'environnement
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const synchronize =
          config.get<string>('DB_SYNCHRONIZE', 'true') === 'true';
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USERNAME', 'msd_user'),
          password: config.get<string>('DB_PASSWORD', 'msd_password'),
          database: config.get<string>('DB_DATABASE', 'msd_db'),
          autoLoadEntities: true, // Charge automatiquement les entités déclarées dans les modules
          synchronize, // À désactiver en production (DB_SYNCHRONIZE=false) au profit des migrations
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          // Si synchronize est désactivé, les migrations s'appliquent automatiquement
          // au démarrage — pas de commande manuelle à lancer en déploiement.
          migrationsRun: !synchronize,
        };
      },
    }),

    AnalysisModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
