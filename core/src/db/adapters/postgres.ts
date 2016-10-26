const inflect = require('i')();
import SQLAdapter, {IWhereObject} from '../sql_adapter.js';
import Database from '../database';
import {IColumnProperties} from '../../types';
import utilities from '../../utilities';

import async = require('async');

import * as pg from 'pg';
(<any>pg).defaults.poolSize = 8;

export interface IConfig {
  connectionString?: string;
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
}

class PostgresAdapter extends SQLAdapter {

  public db: Database;
  private _config: IConfig;

  constructor(db: Database, cfg: IConfig) {

    super();

    cfg = cfg.connectionString ? this.parseConnectionString(cfg.connectionString) : cfg;

    this.db = db;
    this._config = cfg;
  }

  public close() {

    pg.end();

  }

  public query(query: string, params: any, callback: Function) {

    if (arguments.length < 3) {
      throw new Error('.query requires 3 arguments');
    }

    if (!(params instanceof Array)) {
      throw new Error('params must be a valid array');
    }

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    const start = new Date().valueOf();
    const log = this.db.log.bind(this.db);

    pg.connect(this._config, (err, client, complete) => {

      if (err) {
        this.db.error(err.message);
        return complete();
      }

      client.query(query, params, (function() {

        log(query, params, new Date().valueOf() - start);
        complete();
        callback.apply(this, arguments);

      }.bind(this)));

    });

    return true;

  }

  public transaction(preparedArray: any, callback: Function) {

    if (!preparedArray.length) {
      throw new Error('Must give valid array of statements (with or without parameters)');
    }

    if (typeof preparedArray === 'string') {
      preparedArray = preparedArray.split(';').filter((v) => {
        return !!v;
      }).map((v) => {
        return [v];
      });
    }

    if (typeof callback !== 'function') {
      callback = () => {};
    }

    const start = new Date().valueOf();

    pg.connect(this._config, (err, client, complete) => {

      if (err) {
        this.db.error(err.message);
        callback(err);
        return complete();
      }

      let queries = preparedArray.map((queryData: any) => {

        const query = queryData[0];
        const params = queryData[1] || [];

        return (callback: (err: Error, result: pg.QueryResult) => void) => {
          this.db.log(query, params, new Date().valueOf() - start);
          client.query(queryData[0], queryData[1], callback);
        };

      });

      queries = (<any[]>[]).concat(
        (callback: any) => {
          client.query('BEGIN', callback);
        },
        queries
      );

      this.db.info('Transaction started...');

      async.series(queries, (txnErr, results) => {

        if (txnErr) {

          this.db.error(txnErr.message);
          this.db.info('Rollback started...');

          client.query('ROLLBACK', (err) => {

            if (err) {
              this.db.error(`Rollback failed - ${err.message}`);
              this.db.info('Transaction complete!');
              complete();
              callback(err);
            } else {
              this.db.info('Rollback complete!');
              this.db.info('Transaction complete!');
              complete();
              callback(txnErr);
            }

          });

        } else {

          this.db.info('Commit started...');

          client.query('COMMIT', (err) => {

            if (err) {
              this.db.error(`Commit failed - ${err.message}`);
              this.db.info('Transaction complete!');
              complete();
              callback(err);
              return;
            }

            this.db.info('Commit complete!');
            this.db.info('Transaction complete!');
            complete();
            callback(null, results);

          });

        }

      });

    });

  }

  /* Command functions... */

  public drop(databaseName: string, callback: Function) {

    this.query(this.generateDropDatabaseQuery(databaseName), [], (err: Error, result: any) => {

      if (err) {
        return callback(err);
      }

      this.db.info(`Dropped database "${databaseName}"`);
      callback(null);

    });

  }

  public create(databaseName: string, callback: Function) {

    this.query(this.generateCreateDatabaseQuery(databaseName), [], (err: Error, result: any) => {

      if (err) {
        return callback(err);
      }

      this.db.info(`Created empty database "${databaseName}"`);
      callback(null);

    });

  }

  /* generate functions */

  public generateArray(arr: any[]) {

    return '{' + arr.join(',') + '}';

  }

  public generateConnectionString(host: string, port: number,
                                  database: string, user: string, password: string) {

    if (!host || !port || !database) {
      return '';
    }

    return 'postgres://' + user + ':' + password + '@' + host + ':' + port + '/' + database;

  }

  public parseConnectionString(str: string) {

    const cfg: IConfig = {
      host: '',
      database: '',
      user: '',
      password: '',
      port: 5432,
      ssl: false
    };

    const match = str.match(/^postgres:\/\/([A-Za-z0-9_]+)(?:\:([A-Za-z0-9_\-]+))?@([A-Za-z0-9_\.\-]+):(\d+)\/([A-Za-z0-9_]+)$/);

    if (match) {
      cfg.user = match[1];
      cfg.password = match[2];
      cfg.host = match[3];
      cfg.port = parseInt(match[4], 10);
      cfg.database = match[5];
    }

    return cfg;

  }

  public generateClearDatabaseQuery() {

    return [
      'DROP SCHEMA public CASCADE',
      'CREATE SCHEMA public'
    ].join(';');

  }

  public generateCreateDatabaseQuery(name: string) {

    return [
      'CREATE DATABASE',
      this.escapeField(name)
    ].join(' ');

  }

  public generateDropDatabaseQuery(name: string) {

    return [
      'DROP DATABASE IF EXISTS',
      this.escapeField(name)
    ].join(' ');

  }

  public generateColumn(columnName: string, columnType: string, columnProperties: IColumnProperties) {

    return [
      this.escapeField(columnName),
      columnType,
      columnProperties.array ? 'ARRAY' : '',
      (columnProperties.primary_key || !columnProperties.nullable) ? 'NOT NULL' : ''
    ].filter((v) => { return !!v; }).join(' ');

  }

  public generateAlterColumn(columnName: string, columnType: string, columnProperties: IColumnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      'TYPE',
      columnType,
      columnProperties.array ? 'ARRAY' : ''
    ].filter((v) => { return !!v; }).join(' ');

  }

  public generateAlterColumnSetNull(columnName: string, columnType: string, columnProperties: IColumnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      (columnProperties.primary_key || !columnProperties.nullable) ? 'SET' : 'DROP',
      'NOT NULL'
    ].join(' ');

  }

  public generateAlterColumnDropDefault(columnName: string, columnType?: string, columnProperties?: IColumnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      'DROP DEFAULT'
    ].join(' ');

  }

  public generateAlterColumnSetDefaultSeq(columnName: string, seqName: string) {
    return [
      'ALTER COLUMN ',
        this.escapeField(columnName),
      ' SET DEFAULT nextval(\'',
        seqName,
      '\')'
    ].join('');
  }

  public generateIndex(table: string, columnName: string) {

    return this.generateConstraint(table, columnName, 'index');

  }

  public generateConstraint(table: string, columnName: string, suffix: string) {
    return this.escapeField([table, columnName, suffix].join('_'));
  }

  public generatePrimaryKey(table: string, columnName: string) {

    return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'pk'), ' PRIMARY KEY(', this.escapeField(columnName), ')'].join('');

  }

  public generateUniqueKey(table: string, columnName: string) {

    return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'unique'), ' UNIQUE(', this.escapeField(columnName), ')'].join('');

  }

  public generateAlterTableRename(table: string, newTableName: string, columns: any) {

    return [
      [
        'ALTER TABLE',
          this.escapeField(table),
        'RENAME TO',
          this.escapeField(newTableName)
      ].join(' ')
    ].concat(
      this.getPrimaryKeys(columns).map((columnData) => {
        return [
          'ALTER TABLE',
            this.escapeField(newTableName),
          'RENAME CONSTRAINT',
            this.generateConstraint(table, columnData.name, 'pk'),
          'TO',
            this.generateConstraint(newTableName, columnData.name, 'pk')
        ].join(' ');
      }),
      this.getUniqueKeys(columns).map((columnData) => {
        return [
          'ALTER TABLE',
            this.escapeField(newTableName),
          'RENAME CONSTRAINT',
            this.generateConstraint(table, columnData.name, 'unique'),
          'TO',
            this.generateConstraint(newTableName, columnData.name, 'unique')
        ].join(' ');
      }),
      this.getAutoIncrementKeys(columns).map((columnData) => {
        return this.generateRenameSequenceQuery(table, columnData.name, newTableName, columnData.name);
      })
    ).join(';');
  }

  public generateAlterTableColumnType(table: string, columnName: string,
                                      columnType: string, columnProperties: IColumnProperties) {

    const queries = [
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumn(columnName, columnType, columnProperties)
      ].join(' '),
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnSetNull(columnName, columnType, columnProperties)
      ].join(' '),
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnDropDefault(columnName)
      ].join(' '),
      this.generateDropSequenceQuery(table, columnName)
    ];

    if (columnProperties.auto_increment) {
      queries.push(this.generateCreateSequenceQuery(table, columnName));
      queries.push([
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnSetDefaultSeq(columnName, this.generateSequence(table, columnName))
      ].join(' '));
    }

    return queries.join(';');

  }

  public generateAlterTableAddPrimaryKey(table: string, columnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD',
        this.generatePrimaryKey(table, columnName)
    ].join(' ');

  }

  public generateAlterTableDropPrimaryKey(table: string, columnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        this.generateConstraint(table, columnName, 'pk')
    ].join(' ');

  }

  public generateAlterTableAddUniqueKey(table: string, columnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD',
        this.generateUniqueKey(table, columnName)
    ].join(' ');

  }

  public generateAlterTableDropUniqueKey(table: string, columnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        this.generateConstraint(table, columnName, 'unique')
    ].join(' ');

  }

  public generateAlterTableAddColumn(table: string, columnName: string,
                                     columnType: string, columnProperties: IColumnProperties) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD COLUMN',
        this.generateColumn(columnName, columnType, columnProperties)
    ].join(' ');

  }

  public generateAlterTableDropColumn(table: string, columnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP COLUMN IF EXISTS',
        this.escapeField(columnName)
    ].join(' ');

  }

  public generateAlterTableRenameColumn(table: string, columnName: string, newColumnName: string) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'RENAME COLUMN',
        this.escapeField(columnName),
      'TO',
      this.escapeField(newColumnName)
    ].join(' ');

  }

  public generateCreateIndex(table: string, columnName: string, indexType: any) {

    indexType = this.indexTypes.indexOf(indexType) > -1 ? indexType : this.indexTypes[0];
    let indexName = columnName;
    let usingValue = this.escapeField(columnName);

    if (columnName.indexOf(this.columnDepthDelimiter) !== -1) {
      // turn ex: recipie->name into recipe_name
      indexName = columnName.replace(new RegExp(this.columnDepthDelimiter, 'i'), '_');
      usingValue = `(${columnName})`;
    }
    return [
      'CREATE INDEX',
        this.generateIndex(table, indexName),
      'ON',
        this.escapeField(table),
      'USING',
        indexType,
      ['(', usingValue, ')'].join('')
    ].join(' ');

  }

  public generateDropIndex(table: string, columnName: string) {

    return [
      'DROP INDEX', this.generateIndex(table, columnName)
    ].join(' ');

  }

  public generateSequence(table: string, columnName: string) {
    return this.generateConstraint(table, columnName, 'seq');
  }

  public generateCreateSequenceQuery(table: string, columnName: string) {

    return [
      [
        'CREATE SEQUENCE',
          this.generateSequence(table, columnName),
        'START 1',
        'OWNED BY',
          [this.escapeField(table), this.escapeField(columnName)].join('.')
      ].join(' '),
      [
        'SELECT setval(\'',
          this.generateSequence(table, columnName),
        '\', GREATEST(COALESCE(MAX(',
          this.escapeField(columnName),
        '), 0), 0) + 1, false) FROM ',
          this.escapeField(table)
      ].join('')
    ].join(';');

  }

  public generateSimpleForeignKeyQuery(table: string, referenceTable: string) {
    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD CONSTRAINT',
        `${this.generateConstraint(table, referenceTable, 'id_fk')}`,
      'FOREIGN KEY',
        `(${this.escapeField(`${inflect.singularize(referenceTable)}_id`)})`,
      'REFERENCES',
        `${this.escapeField(referenceTable)} (${this.escapeField('id')})`
    ].join(' ');

  }

  public generateDropSimpleForeignKeyQuery(table: string, referenceTable: string) {
    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        `${this.generateConstraint(table, referenceTable, 'id_fk')}`
    ].join(' ');

  }

  public generateRenameSequenceQuery(table: string, columnName: string,
                                     newTable: string, newColumnName: string) {

    return [
      'ALTER SEQUENCE',
        this.generateSequence(table, columnName),
      'RENAME TO',
        this.generateSequence(newTable, newColumnName)
    ].join(' ');

  }

  public generateDropSequenceQuery(table: string, columnName: string) {
    return [
      'DROP SEQUENCE IF EXISTS',
      this.generateSequence(table, columnName)
    ].join(' ');
  }

  public generateCreateTableQuery(table: string, columns: any) {

    // Create sequences along with table

    return [
      super.generateCreateTableQuery(table, columns),
      this.getAutoIncrementKeys(columns).map((columnData) => {
        return [
          this.generateCreateSequenceQuery(table, columnData.name),
          [
            'ALTER TABLE',
              this.escapeField(table),
              this.generateAlterColumnSetDefaultSeq(columnData.name, this.generateSequence(table, columnData.name))
          ].join(' ')
        ].join(';');
      })
    ].join(';');

  }

  public generateLimitClause(limitObj: {
    count?: number;
    offset?: number;
  }) {

    return (!limitObj) ? '' :
      (limitObj.count ? ` LIMIT ${limitObj.count}` : '') +
      (limitObj.offset ? ` OFFSET ${limitObj.offset}` : '');

  }

  public preprocessWhereObj(table: string, whereObj: IWhereObject[]) {

    const whereObjArray: any[] = [];
    whereObj.forEach( where => {
      if (utilities.isObject(where.value)) {
        Object.keys(where.value).map( (k) => {
          whereObjArray.push(Object.assign({}, where, {
            columnName: `${where.columnName}${this.whereDepthDelimiter}'${k}'`,
            value: where.value[k]
          }));
        });
      } else {
        whereObjArray.push(where);
      }
    });

    return whereObjArray;

  }

}

PostgresAdapter.prototype.sanitizeType = {
  boolean: (v: any) => {
    return ['f', 't'][v | 0];
  },
  json: (v: any) => {
    return JSON.stringify(v);
  }
};

PostgresAdapter.prototype.escapeFieldCharacter = `"`;
PostgresAdapter.prototype.columnDepthDelimiter = '->';
PostgresAdapter.prototype.whereDepthDelimiter = '->>';

PostgresAdapter.prototype.indexTypes = [
  'btree',
  'hash',
  'gist',
  'gin'
];

PostgresAdapter.prototype.documentTypes = [
  'json'
];

PostgresAdapter.prototype.comparators = {
  is: (field: string) => `${field} = __VAR__`,
  not: (field: string) => `${field} <> __VAR__`,
  lt: (field: string) => `${field} < __VAR__`,
  lte: (field: string) => `${field} <= __VAR__`,
  gt: (field: string) => `${field} > __VAR__`,
  gte: (field: string) => `${field} >= __VAR__`,
  contains: (field: string) => `${field} LIKE '%' || __VAR__ || '%'`,
  icontains: (field: string) => `${field} ILIKE '%' || __VAR__ || '%'`,
  startswith: (field: string) => `${field} LIKE __VAR__ || '%'`,
  istartswith: (field: string) => `${field} ILIKE __VAR__ || '%'`,
  endswith: (field: string) => `${field} LIKE '%' || __VAR__`,
  iendswith: (field: string) => `${field} ILIKE '%' || __VAR__`,
  like: (field: string) => `${field} LIKE __VAR__`,
  ilike: (field: string) => `${field} ILIKE __VAR__`,
  is_null: (field: string) => `${field} IS NULL`,
  not_null: (field: string) => `${field} IS NOT NULL`,
  in: (field: string) => `ARRAY[${field}] <@ __VAR__`,
  not_in: (field: string) => `NOT (ARRAY[${field}] <@ __VAR__)`,
  json: (field: string, value: any) => {
    return `${field.replace(/"/g,"")} = __VAR__`;
  },
  jsoncontains: (field: string) => {
    return `${field.replace(/"/g,"")} ? __VAR__`;
  }
};

PostgresAdapter.prototype.types = {
  serial: {
    dbName: 'BIGINT',
    properties: {
      primary_key: true,
      nullable: false,
      auto_increment: true
    }
  },
  int: {
    dbName: 'BIGINT'
  },
  currency: {
    dbName: 'BIGINT'
  },
  float: {
    dbName: 'FLOAT'
  },
  string: {
    dbName: 'VARCHAR'
  },
  text: {
    dbName: 'TEXT'
  },
  datetime: {
    dbName: 'TIMESTAMP'
  },
  boolean: {
    dbName: 'BOOLEAN'
  },
  json: {
    dbName: 'JSONB'
  }
};

PostgresAdapter.prototype.supportsForeignKey = true;

export default PostgresAdapter;
