import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

// Utilisé uniquement par la CLI TypeORM (génération/exécution des migrations).
// L'application elle-même se configure dans app.module.ts.
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'msd_user',
  password: process.env.DB_PASSWORD ?? 'msd_password',
  database: process.env.DB_DATABASE ?? 'msd_db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
