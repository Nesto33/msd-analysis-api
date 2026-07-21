import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1783973178373 implements MigrationInterface {
  name = 'InitSchema1783973178373';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Requis pour uuid_generate_v4() ci-dessous : absent par défaut sur une base fraîche.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "msd_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sample" character varying NOT NULL, "assay" character varying NOT NULL, "status" character varying NOT NULL, "finalValue" character varying NOT NULL, "analysisId" uuid, CONSTRAINT "PK_9a4cf17e582fec844e5655d51b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fileName" character varying(255) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_91421900ca225ed9865d016a940" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "msd_results" ADD CONSTRAINT "FK_0f0864d2dab09d1e692c8be15ba" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "msd_results" DROP CONSTRAINT "FK_0f0864d2dab09d1e692c8be15ba"`,
    );
    await queryRunner.query(`DROP TABLE "analyses"`);
    await queryRunner.query(`DROP TABLE "msd_results"`);
  }
}
