import {DataType, IColumnProperties} from '../types';
import Database from './database';
import SchemaGenerator from './schema_generator';

class Migration {

  private db: Database;
  private id: string | null;
  private schema: SchemaGenerator;

  constructor(db: Database) {

    if (!db) {
      throw new Error('Migration required valid database instance');
    }

    this.id = null;

    this.db = db;

    this.schema = new SchemaGenerator(db);

  }

  public up(): string[] {

    return [];

  }

  public down(): string[] {

    return [];

  }

  public executeUp(callback: (err: Error) => void) {

    const schema = this.schema;

    schema.fetch(((err: Error) => {

      if (err) {
        return callback(err);
      }

      schema.setMigrationId(this.id);

      const up = this.up().concat([
        'INSERT INTO "schema_migrations"("id", "schema") VALUES(' + this.id + ', \'' + schema.generate() + '\')'
      ]);

      this.db.transaction(up.join(';'), (err: Error) => {
        !err && schema.save();
        return callback(err);
      });

    }));

  }

  public executeDown(callback: (err: Error) => void, prevId?: string) {

    const schema = this.schema;

    schema.fetch(((err: Error) => {

      if (err) {
        return callback(err);
      }

      schema.setMigrationId(prevId || null);

      const down = this.down().concat([
        'DELETE FROM "schema_migrations" WHERE id = ' + this.id
      ]);

      this.db.transaction(down.join(';'), (err: Error) => {
        !err && schema.save();
        callback(err);
      });

    }));

  }

  public createTable(table: string, arrFieldData: Object[], modelName: string) {

    arrFieldData = this.schema.createTable(table, arrFieldData, modelName);

    return this.db.adapter.generateCreateTableQuery(table, arrFieldData);

  }

  public dropTable(table: string) {

    this.schema.dropTable(table);

    return this.db.adapter.generateDropTableQuery(table);

  }

  public renameTable(table: string, newTableName: string, renameModel: string, newModelName: string) {

    const modelSchema = this.schema.renameTable(table, newTableName, renameModel, newModelName);

    return this.db.adapter.generateAlterTableRename(table, newTableName, modelSchema.columns);

  }

  public alterColumn(table: string, column: string, type: DataType, properties: IColumnProperties) {

    properties = properties || {};

    this.schema.alterColumn(table, column, type, properties);

    return this.db.adapter.generateAlterTableQuery(table, column, type, properties);

  }

  public addColumn(table: string, column: string, type: DataType, properties: IColumnProperties) {

    properties = properties || {};

    this.schema.addColumn(table, column, type, properties);

    return this.db.adapter.generateAlterTableAddColumnQuery(table, column, type, properties);

  }

  public dropColumn(table: string, column: string) {

    this.schema.dropColumn(table, column);

    return this.db.adapter.generateAlterTableDropColumnQuery(table, column);

  }

  public renameColumn(table: string, column: string, newColumn: string) {

    this.schema.renameColumn(table, column, newColumn);

    return this.db.adapter.generateAlterTableRenameColumnQuery(table, column, newColumn);

  }

  public createIndex(table: string, column: string, type: DataType) {

    this.schema.createIndex(table, column, type);

    return this.db.adapter.generateCreateIndexQuery(table, column, type);

  }

  public dropIndex(table: string, column: string) {

    this.schema.dropIndex(table, column);

    return this.db.adapter.generateDropIndexQuery(table, column);

  }

  public addForeignKey(table: string, referenceTable: string) {

    if (this.db.adapter.supportsForeignKey) {
      this.schema.addForeignKey(table, referenceTable);
      return this.db.adapter.generateSimpleForeignKeyQuery(table, referenceTable);
    } else {
      throw new Error(`${this.db.adapter.constructor.name} does not support foreign keys`);
    }

  }

  public dropForeignKey(table: string, referenceTable: string) {

    if (this.db.adapter.supportsForeignKey) {
      this.schema.dropForeignKey(table, referenceTable);
      return this.db.adapter.generateDropSimpleForeignKeyQuery(table, referenceTable);
    } else {
      throw new Error(`${this.db.adapter.constructor.name} does not support foreign keys`);
    }
  }

}

export default Migration;
