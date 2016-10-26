import { DataType, IAnyObject, IColumnProperties } from '../types';
import Database from './database';
import fs from 'fs';
const inflect = require('i')();

export interface IIndice {
  table: string;
  column: string;
  type: DataType;
}

export interface IColumnData {
  name: string;
  type: DataType;
  properties: IColumnProperties;
}

export interface IModel {
  table: string;
  columns: IColumnData[];
}

export interface IModels {
  [modelKey: string]: IModel;
}

class SchemaGenerator {

  private db: Database;
  private migrationId: string | null;
  private models: IModels;
  private indices: IIndice[];
  private _defaultPath: string;

  constructor(db: Database) {

    this.db = db;

    this.migrationId = null;
    this.models = {};
    this.indices = [];

    this._defaultPath = 'db/schema.json';

  }

  public load(filename: string) {
    filename = filename || this._defaultPath;
    filename = process.cwd() + '/' + filename;
    // Need to pass an encoding to readFileSync or it could return a Buffer.
    return this.read(fs.readFileSync(filename, 'utf8'));
  }

  public fetch(callback: Function) {

    this.db.query('SELECT "schema_migrations"."schema" FROM "schema_migrations" ORDER BY "id" DESC LIMIT 1',
      [], ((err: Error, result: any) => {

        if (err) {
          return callback(err);
        }

        result.rows && result.rows.length && this.read(result.rows[0].schema);

        callback(null);

      }));

  }

  public save(filename?: string) {
    filename = filename || this._defaultPath;
    filename = process.cwd() + '/' + filename;
    fs.writeFileSync(filename, this.generate());
    return true;
  }

  public mergeProperties(columnData: any, properties?: any) {

    properties = properties || {};

    const defaults = this.db.adapter.typePropertyDefaults;

    const oldProperties: IAnyObject = this.db.adapter.getTypeProperties(columnData.type, columnData.properties) || {};
    const newProperties: IAnyObject = {};

    this.db.adapter.typeProperties.forEach((v: any) => {
      if (properties.hasOwnProperty(v) && properties[v] !== defaults[v]) {
        newProperties[v] = properties[v];
      } else if (oldProperties.hasOwnProperty(v) && oldProperties[v] !== defaults[v]) {
        newProperties[v] = oldProperties[v];
      }
    });

    columnData.properties = newProperties;

    return columnData;

  }

  public set(schema: {
    migration_id: string;
    models: IModels;
    indices: IIndice[];
  }) {

    this.setMigrationId(schema.migration_id);
    this.models = schema.models || {};
    this.indices = schema.indices || [];

    return true;

  }

  public setMigrationId(id: string | null) {
    this.migrationId = id;
  }

  public findClass(table: string): string {

    const models = this.models;
    return Object.keys(models).filter((v: string) => {
      return models[v].table === table;
    }).pop() || '';

  }

  public createTable(table: string, arrColumnData: any[], modelName: string) {

    const tableClass = modelName || inflect.classify(table);

    if (this.models[tableClass]) {
      throw new Error('Model with name "' + tableClass + '" already exists in your schema');
    }

    if (this.findClass(table)) {
      throw new Error('Table with name "' + table + '" already exists in your schema.');
    }

    arrColumnData = arrColumnData.slice();

    const columns = arrColumnData.map((v) => {
      return v.name;
    });

    if (columns.indexOf('id') === -1) {
      arrColumnData.unshift({ name: 'id', type: 'serial' });
    }

    if (columns.indexOf('created_at') === -1) {
      arrColumnData.push({ name: 'created_at', type: 'datetime' });
    }

    if (columns.indexOf('updated_at') === -1) {
      arrColumnData.push({ name: 'updated_at', type: 'datetime' });
    }

    // const defaults = this.db.adapter.typePropertyDefaults;

    arrColumnData.forEach(((columnData: any) => {
      this.mergeProperties(columnData);
    }));

    this.models[tableClass] = {
      table: table,
      columns: arrColumnData
    };

    return arrColumnData;

  }

  public dropTable(table: string) {

    const tableClass = this.findClass(table);

    if (!tableClass) {
      throw new Error('Table "' + table + '" does not exist in your schema');
    }

    delete this.models[tableClass];

    return true;

  }

  public renameTable(table: string, newTableName: string, renameModel: string, newModelName: string) {

    let tableClass = this.findClass(table);

    if (!tableClass) {
      throw new Error('Table "' + table + '" does not exist in your schema');
    }

    this.models[tableClass].table = newTableName;

    if (renameModel) {
      const newClass = newModelName || inflect.classify(newTableName);
      this.models[newClass] = this.models[tableClass];
      delete this.models[tableClass];
      tableClass = newClass;
    }

    return this.models[tableClass];

  }

  public alterColumn(table: string, column: string, type: DataType, properties: IColumnProperties) {

    if (properties.primary_key) {
      delete properties.unique;
    }

    const models = this.models;
    const modelKey = Object.keys(models).filter((t) => {
      return models[t].table === table;
    }).pop();

    if (!modelKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    const schemaFieldData = models[modelKey].columns.filter((v: any) => {
      return v.name === column;
    }).pop();

    if (!schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
    }

    schemaFieldData.type = type;

    this.mergeProperties(schemaFieldData, properties);

    return true;

  }

  public addColumn(table: string, column: string, type: DataType, properties: IColumnProperties) {

    if (properties.primary_key) {
      delete properties.unique;
    }

    const models = this.models;
    const modelKey = Object.keys(models).filter((t) => {
      return models[t].table === table;
    }).pop();

    if (!modelKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    const modelSchema = models[modelKey];

    const schemaFieldData = modelSchema.columns.filter((v) => {
      return v.name === column;
    }).pop();

    if (schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" already exists');
    }

    const columnData = {
      name: column,
      type,
      properties
    };

    modelSchema.columns.push(columnData);

    return true;

  }

  public dropColumn(table: string, column: string) {

    const models = this.models;
    const modelKey = Object.keys(models).filter((t) => {
      return models[t].table === table;
    }).pop();

    if (!modelKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    const modelSchema = models[modelKey];

    const columnIndex = modelSchema.columns.map((v: any) => { return v.name; }).indexOf(column);

    if (columnIndex === -1) {
      throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
    }

    modelSchema.columns.splice(columnIndex, 1);

    return true;

  }

  public renameColumn(table: string, column: string, newColumn: string) {

    const models = this.models;
    const modelKey = Object.keys(models).filter((t) => {
      return models[t].table === table;
    }).pop();

    if (!modelKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    const modelSchema = models[modelKey];

    const schemaFieldData = modelSchema.columns.filter((v: any) => {
      return v.name === column;
    }).pop();

    if (!schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" already exists');
    }

    schemaFieldData.name = newColumn;

    return true;

  }

  public createIndex(table: string, column: string, type: DataType) {

    if (this.indices.filter((v) => {
      return v.table === table && v.column === column;
    }).length) {
      throw new Error(`Index already exists on column "${column}" of table "${table}"`);
    }

    this.indices.push({ table: table, column: column, type: type });

    return true;

  }

  public dropIndex(table: string, column: string) {

    this.indices = this.indices.filter((v) => {
      return !(v.table === table && v.column === column);
    });

    return true;

  }

  public addForeignKey(table: string, referenceTable: string) {

    const tableClass = inflect.classify(table);
    const referenceTableClass = inflect.classify(referenceTable);

    if (!this.models[tableClass]) {
      throw new Error(`Model ${tableClass} does not exist.`);
    }

    if (!this.models[referenceTableClass]) {
      throw new Error(`Model ${referenceTableClass} does not exist.`);
    }

    return true;

  }

  public dropForeignKey(table: string, referenceTable: string) {

    const tableClass = inflect.classify(table);
    const referenceTableClass = inflect.classify(referenceTable);

    if (!this.models[tableClass]) {
      throw new Error(`Model ${tableClass} does not exist.`);
    }

    if (!this.models[referenceTableClass]) {
      throw new Error(`Model ${referenceTableClass} does not exist.`);
    }

    return true;

  }

  public read(json: string) {
    return this.set(JSON.parse(json));
  }

  public generate() {

    const models = this.models;
    const indices = this.indices;
    const hasModels = !!Object.keys(models).length;
    const hasIndices = indices.length;

    let fileData = [
      '{',
      '',
      '  "migration_id": ' + this.migrationId + ((hasModels || hasIndices) ? ',' : '')
    ];

    if (hasIndices) {

      fileData = fileData.concat([
        '',
        '  "indices": [',
        indices.map((indexData) => {
          return [
            '    {',
            [
              '"table": "' + indexData.table + '"',
              '"column": "' + indexData.column + '"',
              (indexData.type ? '"type": "' + indexData.type + '"' : '')
            ].filter((v) => { return !!v; }).join(', '),
            '}'
          ].join('');
        }).join(',\n'),
        '  ]' + (hasModels ? ',' : '')
      ]);

    }

    if (hasModels) {

      fileData = fileData.concat([
        '',
        '  "models": {',
        '',
        Object.keys(models).sort().map((t) => {
          const curTable = models[t];
          return [
            '    "' + t + '": {',
            '',
            '      "table": "' + curTable.table + '",',
            '',
            '      "columns": [',
            curTable.columns.map((columnData: IColumnData) => {
              return [
                '        ',
                '{',
                [
                  '"name": "' + columnData.name + '"',
                  '"type": "' + columnData.type + '"',
                  columnData.properties ? '"properties": ' + JSON.stringify(columnData.properties) : ''
                ].filter((v) => { return !!v; }).join(', '),
                '}'
              ].join('');
            }).join(',\n'),
            '      ]',
            '',
            '    }'
          ].join('\n');
        }).join(',\n\n'),
        '',
        '  }'
      ]);

    }

    return fileData.concat([
      '',
      '}',
      ''
    ]).join('\n');

  }

}

export default SchemaGenerator;
