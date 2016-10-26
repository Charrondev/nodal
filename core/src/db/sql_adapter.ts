import {DataType, IColumn, IColumnProperties} from '../types';

export type ComparatorType = 'is' | 'not' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'icontains' |
                      'startswith' | 'istartswith' | 'endswith' | 'iendswith' | 'like' | 'ilike' | 'is_null' | 'not_null' | 'in' | 'not_in';

export interface IComparator {
  [typeKey: string]: Function;
}

export interface IWhereObject {
  table: string;
  columnName: string;
  refName: string;
  comparator: ComparatorType;
  value: any;
  ignoreValue: boolean;
  joined: any;
  joins: any;
}

abstract class SQLAdapter {

  // tslint:disable:max-line-length
  public abstract generateConnectionString(host: string, port: number, database: string, user: string, password: string): string;
  public abstract parseConnectionString(str: string): void;
  public abstract generateClearDatabaseQuery(): string;
  public abstract generateCreateDatabaseQuery(...args: any[]): string;
  public abstract generateDropDatabaseQuery(...args: any[]): string;
  public abstract generateIndex(...args: any[]): string;
  public abstract generateConstraint(...args: any[]): string;
  public abstract generateColumn(columnName: string, type: string, properties?: IColumnProperties): string;
  public abstract generateAlterColumn(columnName: string, type: string, properties?: IColumnProperties): string;
  public abstract generateAlterColumnSetNull(columnName: string, type: string, properties?: IColumnProperties): string;
  public abstract generatePrimaryKey(columnName: string, type: string, properties?: IColumnProperties): string;
  public abstract generateUniqueKey(columnName: string, type: string, properties?: IColumnProperties): string;
  public abstract generateAlterTableRename(table: string, newTableName: string, columns?: any): string;
  public abstract generateAlterTableColumnType(table: string, columnName: string, columnType: string, columnProperties: IColumnProperties): string;
  public abstract generateAlterTableAddPrimaryKey(table: string, columnName: string): string;
  public abstract generateAlterTableDropPrimaryKey(table: string, columnName: string): string;
  public abstract generateAlterTableAddUniqueKey(table: string, columnName: string): string;
  public abstract generateAlterTableDropUniqueKey(table: string, columnName: string): string;
  public abstract generateAlterTableAddColumn(table: string, columnName: string, columnType: string, columnProperties: IColumnProperties): string;
  public abstract generateAlterTableDropColumn(table: string, columnName: string): string;
  public abstract generateAlterTableRenameColumn(table: string, columnName: string, newColumnName: string): string;
  public abstract generateCreateIndex(table: string, columnName: string, indexType: any): string;
  public abstract generateDropIndex(table: string, columnName: string): string;
  public abstract generateSimpleForeignKeyQuery(table: string, referenceTable: string): string;
  public abstract generateDropSimpleForeignKeyQuery(table: string, referenceTable: string): string;
  // tslint:enable:max-line-length

  public sanitizeType: {
    [typeKey: string]: Function;
  };
  public escapeFieldCharacter: string;
  public types: {
    [typeName: string]: {
      dbName: string;
      properties?: IColumnProperties;
    }
  };
  public typePropertyDefaults: IColumnProperties;
  public typeProperties: string[];
  public comparatorIgnoresValue: {
    is_null: boolean,
    not_null: boolean,
    [key: string]: any;
  };
  public comparators: {
    [key: string]: Function;
  };
  public aggregates: {
    [key: string]: Function;
  };
  public defaultAggregate: string;
  public columnDepthDelimiter: string;
  public whereDepthDelimiter: string;

  public supportsForeignKey: boolean;
  public documentTypes: string[];
  public indexTypes: string[];

  public sanitize(type: string, value: any) {

    const fnSanitize = this.sanitizeType[type];
    return fnSanitize ? fnSanitize(value) : value;

  }

  public escapeField(name: string) {
    return ['', name, ''].join(this.escapeFieldCharacter);
  }

  public getTypeProperties(typeName: string, optionalValues: any) {

    const type = this.types[typeName];
    const typeProperties: any = type ? (type.properties || {}) : {};

    optionalValues = optionalValues || {};

    const outputType: any = Object.create(this.typePropertyDefaults);
    this.typeProperties.forEach((v) => {
      if (optionalValues.hasOwnProperty(v)) {
        outputType[v] = optionalValues[v];
      } else if(typeProperties.hasOwnProperty(v)) {
        outputType[v] = typeProperties[v];
      }
    });

    return outputType;

  }

  public getTypeDbName(typeName: string) {
    const type = this.types[typeName];
    return type ? type.dbName : 'INTEGER';
  }

  public generateColumnsStatement(table: string, columns: IColumn[]) {
    const self = this;
    return columns
      .map(function(columnData) {
        return self.generateColumn(columnData.name, self.getTypeDbName(columnData.type), self.getTypeProperties(columnData.type, columnData.properties));
      })
      .join(',');
  }

  public getAutoIncrementKeys(columns: IColumn[]) {

    let self = this;
    return columns.filter(function(columnData) {
      return self.getTypeProperties(columnData.type, columnData.properties).auto_increment;
    });

  };

  public getPrimaryKeys(columns: IColumn[]) {

    let self = this;
    return columns
      .filter(function(columnData) {
        return self.getTypeProperties(columnData.type, columnData.properties).primary_key;
      });


  }

  public getUniqueKeys(columns: IColumn[]) {

    let self = this;
    return columns
      .filter(function(columnData) {
        let type = self.getTypeProperties(columnData.type, columnData.properties);
        return (!type.primary_key && type.unique);
      });

  }

  public generatePrimaryKeysStatement(table: string, columns: IColumn[]) {
    let self = this;
    return this.getPrimaryKeys(columns)
      .map(function(columnData) {
        return self.generatePrimaryKey(table, columnData.name);
      })
      .join(',');
  }

  public generateUniqueKeysStatement(table: string, columns: IColumn[]) {

    return this.getUniqueKeys(columns)
      .map(columnData => this.generateUniqueKey(table, columnData.name))
      .join(',');

  }

  public generateCreateTableQuery(table: string, columns: IColumn[]) {

    return [
      'CREATE TABLE ',
        this.escapeField(table),
      '(',
        [
          this.generateColumnsStatement(table, columns),
          this.generatePrimaryKeysStatement(table, columns),
          this.generateUniqueKeysStatement(table, columns)
        ].filter(function(v) { return !!v; }).join(','),
      ')'
    ].join('');

  }

  public generateDropTableQuery(table: string, ifExists: boolean) {

    return `DROP TABLE ${ifExists?'IF EXISTS ':''}${this.escapeField(table)}`;

  }

  public generateTruncateTableQuery(table: string) {

    return `TRUNCATE TABLE ${this.escapeField(table)} RESTART IDENTITY`;

  }

  public generateSelectQuery(subQuery: any, table: string, columns: IColumn[],
                             multiFilter: any, joinArray: any[], groupByArray: any[], orderByArray: any[], 
                             limitObj: any, paramOffset: any) {

    const formatTableField = (table: string, column: string) => `${this.escapeField(table)}.${this.escapeField(column)}`;

    if (typeof subQuery === 'object' && subQuery !== null) {
      subQuery = this.escapeField(subQuery.table);
    } else {
      subQuery = subQuery ? `(${subQuery})` : table;
    }

    groupByArray = groupByArray || [];
    orderByArray = orderByArray || [];

    return [
      'SELECT ',
        columns.map((field: any) => {
          field = typeof field === 'string' ? {columnNames: [field], alias: field, transformation: (v: any) => v} : field;
          const defn = field.transformation.apply(null, field.columnNames.map((columnName: string) => {
            return formatTableField(field.name || field.table || table, columnName);
          }));
          return `(${defn}) AS ${this.escapeField(field.alias)}`;
        }).join(','),
      ' FROM ',
        subQuery,
        ' AS ',
        this.escapeField(table),
        this.generateJoinClause(table, joinArray, paramOffset),
        this.generateWhereClause(table, multiFilter, paramOffset),
        this.generateGroupByClause(table, groupByArray),
        this.generateOrderByClause(table, orderByArray, groupByArray),
        this.generateLimitClause(limitObj)
    ].join('');

  }

  public generateCountQuery(subQuery: string, table: string) {

    return [
      `SELECT COUNT(*) `,
      `AS __total__ FROM `,
      subQuery ? `(${subQuery}) AS ` : '',
      `${this.escapeField(table)}`
    ].join('');

  }

  public generateUpdateQuery(table: string, columnNames: any) {

    return this.generateUpdateAllQuery(table, columnNames[0], columnNames.slice(1), [], 1);

  }

  public generateUpdateAllQuery(table: string, pkColumn: string, columnNames: string[],
                                columnFunctions: any, offset?: number, subQuery?: any) {

    const fields = columnNames
      .map(this.escapeField.bind(this))
      .concat(columnFunctions.map((f: any) => this.escapeField(f[0])));

    const params = columnNames
      .map((v: any, i: any) => '$' + (i + offset + 1))
      .concat(columnFunctions.map((f: any) => f[1](this.escapeField(f[0]))));

    return [
      `UPDATE ${this.escapeField(table)}`,
      ` SET (${fields.join(',')}) = (${params.join(',')})`,
      ` WHERE (`,
        this.escapeField(pkColumn),
        subQuery ? ` IN (${subQuery})` : ` = $1`,
      `) RETURNING *`
    ].join('');

  }

  public generateDeleteQuery(table: string, columnNames: string[]) {

    return [
      'DELETE FROM ',
        this.escapeField(table),
      ' WHERE (',
        columnNames.map(this.escapeField.bind(this)).join(','),
      ') = (',
        columnNames.map(function(v, i) { return '$' + (i + 1); }).join(','),
      ') RETURNING *'
    ].join('');

  }

  public generateDeleteAllQuery(table: string, columnName: string, values: any, joins: any) {

    let subQuery: any;

    if (!joins) {

      subQuery = `${values.map((v: any, i: any) => '\$' + (i + 1))}`;

    } else {

      subQuery = [
        `SELECT ${this.escapeField(table)}.${this.escapeField(columnName)} FROM ${this.escapeField(table)}`
      ];

      subQuery = subQuery.concat(
        joins.slice().reverse().map((j: any, i: number) => {
          return [
            `INNER JOIN ${this.escapeField(j.prevTable)} ON `,
            `${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} = `,
            `${this.escapeField(j.joinTable)}.${this.escapeField(j.joinColumn)}`,
            i === joins.length - 1 ?
              ` AND ${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} IN (${values.map((v: any, i: any) => '\$' + (i + 1))})` : ''
          ].join('')
        })
      ).join(' ');

    }

    return [
      `DELETE FROM ${this.escapeField(table)}`,
      `WHERE ${this.escapeField(table)}.${this.escapeField(columnName)}`,
      `IN (${subQuery})`
    ].join(' ');
  }

  public generateInsertQuery(table: string, columnNames: string[]) {
    return [
      'INSERT INTO ',
        this.escapeField(table),
      '(',
        columnNames.map(this.escapeField.bind(this)).join(','),
      ') VALUES(',
        columnNames.map(function(v, i) { return '$' + (i + 1); }).join(','),
      ') RETURNING *'
    ].join('');
  }

  public generateAlterTableQuery(table: string, columnName: string, type: string, properties: any) {

    let queries: any[] = [];

    if (type) {
      queries.push(
        this.generateAlterTableColumnType(
          table,
          columnName,
          this.getTypeDbName(type),
          this.getTypeProperties(type, properties)
        )
      );
    }

    if (properties.hasOwnProperty('primary_key')) {
      queries.push(
        [
          this.generateAlterTableDropPrimaryKey,
          this.generateAlterTableAddPrimaryKey
        ][properties.primary_key | 0].call(this, table, columnName)
      );
    } else if (properties.hasOwnProperty('unique')) {
      queries.push(
        [
          this.generateAlterTableDropUniqueKey,
          this.generateAlterTableAddUniqueKey
        ][properties.unique | 0].call(this, table, columnName)
      );
    }

    return queries.join(';');

  }

  public generateAlterTableAddColumnQuery(table: string, columnName: string, type: string, properties: any) {

    return this.generateAlterTableAddColumn(
      table,
      columnName,
      this.getTypeDbName(type),
      this.getTypeProperties(type, properties)
    );

  }

  public generateAlterTableDropColumnQuery(table: string, columnName: string) {

    return this.generateAlterTableDropColumn(table, columnName);

  }

  public generateAlterTableRenameColumnQuery(table: string, columnName: string, newColumnName: string) {

    return this.generateAlterTableRenameColumn(table, columnName, newColumnName);

  }

  public generateCreateIndexQuery(table: string, columnName: string, indexType: string) {

    indexType = indexType || 'btree';

    return this.generateCreateIndex(table, columnName, indexType);

  }

  public generateDropIndexQuery(table: string, columnName: string) {

    return this.generateDropIndex(table, columnName);

  }

  public preprocessWhereObj(table: string, whereObj: IWhereObject) {
    return whereObj;
  }

  public parseWhereObj(table: string, whereObj: IWhereObject[]) {

    return whereObj.map((where, i) => {
      return {
        table: where.table,
        columnName: where.columnName,
        refName: [this.escapeField(where.table || table), this.escapeField(where.columnName)].join('.'),
        comparator: where.comparator,
        value: where.value,
        ignoreValue: !!this.comparatorIgnoresValue[where.comparator],
        joined: where.joined,
        joins: where.joins
      };
    });

  }

  public createMultiFilter(table: string, whereObjArray: any) {

    return whereObjArray
      .filter((v: any) => v)
      // This should be with 1's and 0's not booleans?
      .sort((a: any, b: any) => a.joined === b.joined ? a.table > b.table : a.joined > b.joined) // important! must be sorted.
      .map((v: any) => this.preprocessWhereObj(table, v))
      .map((v: any) => this.parseWhereObj(table, v));

  }

  public generateWhereClause(table: string, multiFilter: any, paramOffset: any) {

    paramOffset = Math.max(0, parseInt(paramOffset) || 0);

    if (!multiFilter || !multiFilter.length) {
      return '';
    }

    return ` WHERE ${this.generateOrClause(table, multiFilter, paramOffset)}`;

  }

  public generateOrClause(table: string, multiFilter: any, paramOffset: any) {

    paramOffset = Math.max(0, parseInt(paramOffset, 10) || 0);

    if (!multiFilter || !multiFilter.length) {
      return '';
    }

    return ('(' + multiFilter.map((whereObj: IWhereObject) => {
      return this.generateAndClause(table, whereObj);
    }).join(') OR (') + ')').replace(/__VAR__/g, () => `\$${1 + (paramOffset++)}`);

  }

  public generateAndClause(table: string, whereObjArray: any) {

    const comparators = this.comparators;

    if (!whereObjArray.length) {
      return '';
    }

    const lastTable = null;
    let clauses: any[] = [];
    let joinedClauses: any[] = [];

    for (let i = 0; i < whereObjArray.length; i++) {

      const whereObj = whereObjArray[i];
      const joined = whereObj.joined;
      const table = whereObj.table;

      if (!joined) {

        clauses.push(comparators[whereObj.comparator](whereObj.refName, whereObj.value));

      } else {

        let currentJoinedClauses: any[] = [];

        if (lastTable === table) {

          currentJoinedClauses = joinedClauses[joinedClauses.length - 1].clauses;

        } else {

          joinedClauses.push({
            table: table,
            joins: whereObj.joins,
            clauses: currentJoinedClauses
          });

          clauses.push(null);

        }

        currentJoinedClauses.push(comparators[whereObj.comparator](whereObj.refName, whereObj.value));

      }

    }

    joinedClauses = joinedClauses.map(jc => {

      return [
        `(`,
          `SELECT ${this.escapeField(jc.table)}.${this.escapeField('id')} `,
          `FROM ${this.escapeField(jc.table)} `,
          jc.joins.map((join: any, i: number) => {
            return [
              `INNER JOIN ${this.escapeField(join.joinTable)} AS ${this.escapeField(join.joinAlias)} ON `,
              `${this.escapeField(join.joinAlias)}.${this.escapeField(join.joinColumn)} = `,
              `${this.escapeField(join.prevTable || table)}.${this.escapeField(join.prevColumn)}`,
              i === jc.joins.length - 1 ?
                [
                  ` AND `,
                  `${this.escapeField(join.joinAlias)}.${this.escapeField(join.joinColumn)} = `,
                  `${this.escapeField(jc.table)}.${this.escapeField(join.joinColumn)} `,
                  `AND (${jc.clauses.join(' AND ')}) `
                ].join('') : ''
            ].join('')
          }).join(' '),
          `LIMIT 1`,
        `) IS NOT NULL`
      ].join('');

    });

    clauses = clauses.map(c => {
      if (!c) {
        return joinedClauses.shift();
      }
      return c;
    });

    return clauses.join(' AND ');

  }

  public getParamsFromMultiFilter(multiFilter: any) {
    return [].concat.apply([], multiFilter)
      .filter((whereObj: IWhereObject) => !whereObj.ignoreValue)
      .map((whereObj: IWhereObject) => whereObj.value);
  }

  public generateOrderByClause(table: string, orderByArray: any[], groupByArray: any[]) {

    return !orderByArray.length ? '' : ' ORDER BY ' + orderByArray.map(v => {
      const columns = v.columnNames.map((columnName: string) => `${this.escapeField(table)}.${this.escapeField(columnName)}`);
      return `${(v.transformation || ((v: any) => v)).apply(null, columns)} ${v.direction}`;
    }).join(', ');

  }

  public generateJoinClause(table: string, joinArray: any, paramOffset: any) {

    paramOffset = Math.max(0, parseInt(paramOffset, 10) || 0);
    let joinedAlready: any = {};

    return (!joinArray || !joinArray.length) ? '' :
      joinArray.map((joinData: any) => {

        joinData = joinData.filter((join: any) => !joinedAlready[join.joinAlias]);

        return joinData.map((join: any, i: number) => {

          joinedAlready[join.joinAlias] = true;

          const joinColumns = join.joinColumn instanceof Array ? join.joinColumn : [join.joinColumn]
          const prevColumns = join.prevColumn instanceof Array ? join.prevColumn : [join.prevColumn]

          const statements: any[] = [];

          joinColumns.forEach((joinColumn: any) => {
            prevColumns.forEach((prevColumn: any) => {
              statements.push(
                `${this.escapeField(join.joinAlias)}.${this.escapeField(joinColumn)} = ` +
                `${this.escapeField(join.prevAlias || table)}.${this.escapeField(prevColumn)}`
              );
            });
          });


          const filterClause = this.generateOrClause(join.joinAlias, join.multiFilter, paramOffset);
          join.multiFilter && join.multiFilter.forEach((arr: any) => paramOffset += arr.length);

          return [
            ` LEFT JOIN ${this.escapeField(join.joinTable)}`,
            ` AS ${this.escapeField(join.joinAlias)}`,
            ` ON (${statements.join(' OR ')}`,
            filterClause ? ` AND ${filterClause}` : '',
            ')'
          ].join('');

        }).join('')

      }).join('');

  }

  public generateGroupByClause(table: string, groupByArray: any) {

    return !groupByArray.length ? '' : ' GROUP BY ' + groupByArray.map((v: any) => {
      let columns = v.columnNames.map((column: any) => `${this.escapeField(table)}.${this.escapeField(column)}`);
      return v.transformation.apply(null, columns);
    }).join(', ');

  }

  public generateLimitClause(limitObj: any) {

    return (!limitObj) ? '' : [
      ' LIMIT ',
      limitObj.offset,
      ', ',
      limitObj.count
    ].join('');

  }

  public aggregate(aggregator: any) {

    return typeof aggregator === 'function' ? aggregator : (
      (this.aggregates.hasOwnProperty(aggregator) ?
        this.aggregates[aggregator] :
        this.aggregates[this.defaultAggregate])
    );

  }

}

SQLAdapter.prototype.typeProperties = [
  'length',
  'nullable',
  'unique',
  'primary_key',
  'auto_increment',
  'array',
  'defaultValue'
];

SQLAdapter.prototype.typePropertyDefaults = {
  length: null,
  nullable: true,
  unique: false,
  primary_key: false,
  auto_increment: false,
  array: false,
  defaultValue: null
};

SQLAdapter.prototype.indexTypes = [];

SQLAdapter.prototype.comparators = {
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
  not_in: (field: string) => `NOT (ARRAY[${field}] <@ __VAR__)`
};

SQLAdapter.prototype.comparatorIgnoresValue = {
  is_null: true,
  not_null: true
};

SQLAdapter.prototype.documentTypes = [];

SQLAdapter.prototype.aggregates = {
  sum: (field: string) => `SUM(${field})`,
  avg: (field: string) => `AVG(${field})`,
  min: (field: string) => `MIN(${field})`,
  max: (field: string) => `MAX(${field})`,
  count: (field: string) => `COUNT(${field})`,
  distinct: (field: string) => `COUNT(DISTINCT(${field}))`,
  none: (field: string) => `NULL`,
  min_date: (field: string) => `MIN(DATE_TRUNC('day', ${field}))`,
  max_date: (field: string) => `MAX(DATE_TRUNC('day', ${field}))`,
  count_true: (field: string) => `COUNT(CASE WHEN ${field} THEN 1 ELSE NULL END)`
};

SQLAdapter.prototype.defaultAggregate = 'none';

SQLAdapter.prototype.types = {};
SQLAdapter.prototype.sanitizeType = {};
SQLAdapter.prototype.escapeFieldCharacter = '';
SQLAdapter.prototype.columnDepthDelimiter = '';
SQLAdapter.prototype.whereDepthDelimiter = '';

SQLAdapter.prototype.supportsForeignKey = false;

export default SQLAdapter;
