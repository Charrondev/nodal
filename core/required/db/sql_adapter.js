"use strict";
class SQLAdapter {
    sanitize(type, value) {
        const fnSanitize = this.sanitizeType[type];
        return fnSanitize ? fnSanitize(value) : value;
    }
    escapeField(name) {
        return ['', name, ''].join(this.escapeFieldCharacter);
    }
    getTypeProperties(typeName, optionalValues = {}) {
        const type = this.types[typeName];
        const typeProperties = type ? (type.properties || {}) : {};
        return Object.assign({}, this.typePropertyDefaults, optionalValues, typeProperties);
    }
    getTypeDbName(typeName) {
        const type = this.types[typeName];
        return type ? type.dbName : 'INTEGER';
    }
    generateColumnsStatement(table, columns) {
        return columns
            .map((columnData) => {
            return this.generateColumn(columnData.name, this.getTypeDbName(columnData.type), this.getTypeProperties(columnData.type, columnData.properties));
        })
            .join(',');
    }
    getAutoIncrementKeys(columns) {
        return columns.filter((columnData) => {
            return this.getTypeProperties(columnData.type, columnData.properties).auto_increment;
        });
    }
    ;
    getPrimaryKeys(columns) {
        return columns
            .filter((columnData) => {
            return this.getTypeProperties(columnData.type, columnData.properties).primary_key;
        });
    }
    getUniqueKeys(columns) {
        return columns
            .filter((columnData) => {
            const type = this.getTypeProperties(columnData.type, columnData.properties);
            return (!type.primary_key && type.unique);
        });
    }
    generatePrimaryKeysStatement(table, columns) {
        return this.getPrimaryKeys(columns)
            .map((columnData) => {
            return this.generatePrimaryKey(table, columnData.name);
        })
            .join(',');
    }
    generateUniqueKeysStatement(table, columns) {
        return this.getUniqueKeys(columns)
            .map(columnData => this.generateUniqueKey(table, columnData.name))
            .join(',');
    }
    generateCreateTableQuery(table, columns) {
        return [
            'CREATE TABLE ',
            this.escapeField(table),
            '(',
            [
                this.generateColumnsStatement(table, columns),
                this.generatePrimaryKeysStatement(table, columns),
                this.generateUniqueKeysStatement(table, columns)
            ].filter((v) => { return !!v; }).join(','),
            ')'
        ].join('');
    }
    generateDropTableQuery(table, ifExists) {
        return `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}${this.escapeField(table)}`;
    }
    generateTruncateTableQuery(table) {
        return `TRUNCATE TABLE ${this.escapeField(table)} RESTART IDENTITY`;
    }
    generateSelectQuery(subQuery, table, columns, multiFilter, joinArray, groupByArray, orderByArray, limitObj, paramOffset) {
        const formatTableField = (table, column) => `${this.escapeField(table)}.${this.escapeField(column)}`;
        if (typeof subQuery === 'object' && subQuery !== null) {
            subQuery = this.escapeField(subQuery.table);
        }
        else {
            subQuery = subQuery ? `(${subQuery})` : table;
        }
        groupByArray = groupByArray || [];
        orderByArray = orderByArray || [];
        return [
            'SELECT ',
            columns.map((field) => {
                let formattedField;
                if (typeof field === 'string') {
                    formattedField = { columnNames: [field], alias: field, transformation: (v) => v };
                }
                else {
                    formattedField = field;
                }
                const defn = field.transformation.apply(null, field.columnNames.map((columnName) => {
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
    generateCountQuery(subQuery, table) {
        return [
            `SELECT COUNT(*) `,
            `AS __total__ FROM `,
            subQuery ? `(${subQuery}) AS ` : '',
            `${this.escapeField(table)}`
        ].join('');
    }
    generateUpdateQuery(table, columnNames) {
        return this.generateUpdateAllQuery(table, columnNames[0], columnNames.slice(1), [], 1);
    }
    generateUpdateAllQuery(table, pkColumn, columnNames, columnFunctions, offset, subQuery) {
        const fields = columnNames
            .map(this.escapeField.bind(this))
            .concat(columnFunctions.map((f) => this.escapeField(f[0])));
        const params = columnNames
            .map((v, i) => '$' + (i + offset + 1))
            .concat(columnFunctions.map((f) => f[1](this.escapeField(f[0]))));
        return [
            `UPDATE ${this.escapeField(table)}`,
            ` SET (${fields.join(',')}) = (${params.join(',')})`,
            ` WHERE (`,
            this.escapeField(pkColumn),
            subQuery ? ` IN (${subQuery})` : ` = $1`,
            `) RETURNING *`
        ].join('');
    }
    generateDeleteQuery(table, columnNames) {
        return [
            'DELETE FROM ',
            this.escapeField(table),
            ' WHERE (',
            columnNames.map(this.escapeField.bind(this)).join(','),
            ') = (',
            columnNames.map((v, i) => { return '$' + (i + 1); }).join(','),
            ') RETURNING *'
        ].join('');
    }
    generateDeleteAllQuery(table, columnName, values, joins) {
        let subQuery;
        if (!joins) {
            subQuery = `${values.map((v, i) => '\$' + (i + 1))}`;
        }
        else {
            subQuery = [
                `SELECT ${this.escapeField(table)}.${this.escapeField(columnName)} FROM ${this.escapeField(table)}`
            ];
            subQuery = subQuery.concat(joins.slice().reverse().map((j, i) => {
                return [
                    `INNER JOIN ${this.escapeField(j.prevTable)} ON `,
                    `${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} = `,
                    `${this.escapeField(j.joinTable)}.${this.escapeField(j.joinColumn)}`,
                    i === joins.length - 1 ?
                        ` AND ${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} IN (${values.map((v, i) => '\$' + (i + 1))})` : ''
                ].join('');
            })).join(' ');
        }
        return [
            `DELETE FROM ${this.escapeField(table)}`,
            `WHERE ${this.escapeField(table)}.${this.escapeField(columnName)}`,
            `IN (${subQuery})`
        ].join(' ');
    }
    generateInsertQuery(table, columnNames) {
        return [
            'INSERT INTO ',
            this.escapeField(table),
            '(',
            columnNames.map(this.escapeField.bind(this)).join(','),
            ') VALUES(',
            columnNames.map((v, i) => { return '$' + (i + 1); }).join(','),
            ') RETURNING *'
        ].join('');
    }
    generateAlterTableQuery(table, columnName, type, properties) {
        const queries = [];
        if (type) {
            queries.push(this.generateAlterTableColumnType(table, columnName, this.getTypeDbName(type), this.getTypeProperties(type, properties)));
        }
        if (properties.hasOwnProperty('primary_key')) {
            queries.push([
                this.generateAlterTableDropPrimaryKey,
                this.generateAlterTableAddPrimaryKey
            ][properties.primary_key | 0].call(this, table, columnName));
        }
        else if (properties.hasOwnProperty('unique')) {
            queries.push([
                this.generateAlterTableDropUniqueKey,
                this.generateAlterTableAddUniqueKey
            ][properties.unique | 0].call(this, table, columnName));
        }
        return queries.join(';');
    }
    generateAlterTableAddColumnQuery(table, columnName, type, properties) {
        return this.generateAlterTableAddColumn(table, columnName, this.getTypeDbName(type), this.getTypeProperties(type, properties));
    }
    generateAlterTableDropColumnQuery(table, columnName) {
        return this.generateAlterTableDropColumn(table, columnName);
    }
    generateAlterTableRenameColumnQuery(table, columnName, newColumnName) {
        return this.generateAlterTableRenameColumn(table, columnName, newColumnName);
    }
    generateCreateIndexQuery(table, columnName, indexType) {
        indexType = indexType || 'btree';
        return this.generateCreateIndex(table, columnName, indexType);
    }
    generateDropIndexQuery(table, columnName) {
        return this.generateDropIndex(table, columnName);
    }
    preprocessWhereObj(table, whereObj) {
        return whereObj;
    }
    parseWhereObj(table, whereObj) {
        return whereObj.map((where, i) => {
            const comparator = where.comparator;
            return {
                table: where.table,
                columnName: where.columnName,
                refName: [this.escapeField(where.table || table), this.escapeField(where.columnName)].join('.'),
                comparator: where.comparator,
                value: where.value,
                ignoreValue: !!this.comparatorIgnoresValue[comparator],
                joined: where.joined,
                joins: where.joins
            };
        });
    }
    createMultiFilter(table, whereObjArray) {
        // Why are booleans being returned in a sort function
        const sortFunction = (a, b) => {
            return a.joined === b.joined ? a.table > b.table : a.joined > b.joined;
        };
        return whereObjArray
            .filter(v => v)
            .sort(sortFunction) // important! must be sorted.
            .map((v) => this.preprocessWhereObj(table, v))
            .map(v => this.parseWhereObj(table, v)); // Should this be any array or not?
    }
    generateWhereClause(table, multiFilter, paramOffset) {
        paramOffset = Math.max(0, parseInt(paramOffset, 10) || 0);
        if (!multiFilter || !multiFilter.length) {
            return '';
        }
        return ` WHERE ${this.generateOrClause(table, multiFilter, paramOffset)}`;
    }
    generateOrClause(table, multiFilter, paramOffset) {
        paramOffset = Math.max(0, parseInt(paramOffset, 10) || 0);
        if (!multiFilter || !multiFilter.length) {
            return '';
        }
        return ('(' + multiFilter.map(whereObj => {
            return this.generateAndClause(table, whereObj);
        }).join(') OR (') + ')').replace(/__VAR__/g, () => `\$${1 + (paramOffset++)}`);
    }
    generateAndClause(table, whereObjArray) {
        const comparators = this.comparators;
        if (!whereObjArray.length) {
            return '';
        }
        const lastTable = null;
        let clauses = [];
        let joinedClauses = [];
        for (let i = 0; i < whereObjArray.length; i++) {
            const whereObj = whereObjArray[i];
            const joined = whereObj.joined;
            const table = whereObj.table;
            if (!joined) {
                const comparatorFunction = comparators[whereObj.comparator];
                clauses.push(comparatorFunction(whereObj.refName, whereObj.value));
            }
            else {
                let currentJoinedClauses = [];
                if (lastTable === table) {
                    currentJoinedClauses = joinedClauses[joinedClauses.length - 1].clauses;
                }
                else {
                    joinedClauses.push({
                        table: table,
                        joins: whereObj.joins,
                        clauses: currentJoinedClauses
                    });
                    clauses.push(null);
                }
                const comparatorFunction = comparators[whereObj.comparator];
                currentJoinedClauses.push(comparatorFunction(whereObj.refName, whereObj.value));
            }
        }
        joinedClauses = joinedClauses.map(jc => {
            return [
                `(`,
                `SELECT ${this.escapeField(jc.table)}.${this.escapeField('id')} `,
                `FROM ${this.escapeField(jc.table)} `,
                jc.joins.map((join, i) => {
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
                    ].join('');
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
    getParamsFromMultiFilter(multiFilter) {
        return [].concat.apply([], multiFilter)
            .filter((whereObj) => !whereObj.ignoreValue)
            .map((whereObj) => whereObj.value);
    }
    generateOrderByClause(table, orderByArray, groupByArray) {
        return !orderByArray.length ? '' : ' ORDER BY ' + orderByArray.map(v => {
            const columns = v.columnNames.map((columnName) => `${this.escapeField(table)}.${this.escapeField(columnName)}`);
            return `${(v.transformation || ((v) => v)).apply(null, columns)} ${v.direction}`;
        }).join(', ');
    }
    generateJoinClause(table, joinArray, paramOffset) {
        paramOffset = Math.max(0, parseInt(paramOffset, 10) || 0);
        const joinedAlready = {};
        return (!joinArray || !joinArray.length) ? '' :
            joinArray.map(joinData => {
                joinData = joinData.filter((join) => !joinedAlready[join.joinAlias]);
                return joinData.map((join, i) => {
                    joinedAlready[join.joinAlias] = true;
                    const joinColumns = join.joinColumn instanceof Array ? join.joinColumn : [join.joinColumn];
                    const prevColumns = join.prevColumn instanceof Array ? join.prevColumn : [join.prevColumn];
                    const statements = [];
                    joinColumns.forEach((joinColumn) => {
                        prevColumns.forEach((prevColumn) => {
                            statements.push(`${this.escapeField(join.joinAlias)}.${this.escapeField(joinColumn)} = ` +
                                `${this.escapeField(join.prevAlias || table)}.${this.escapeField(prevColumn)}`);
                        });
                    });
                    const filterClause = this.generateOrClause(join.joinAlias, join.multiFilter, paramOffset);
                    join.multiFilter && join.multiFilter.forEach((arr) => paramOffset += arr.length);
                    return [
                        ` LEFT JOIN ${this.escapeField(join.joinTable)}`,
                        ` AS ${this.escapeField(join.joinAlias)}`,
                        ` ON (${statements.join(' OR ')}`,
                        filterClause ? ` AND ${filterClause}` : '',
                        ')'
                    ].join('');
                }).join('');
            }).join('');
    }
    generateGroupByClause(table, groupByArray) {
        return !groupByArray.length ? '' : ' GROUP BY ' + groupByArray.map(v => {
            const columns = v.columnNames.map((column) => `${this.escapeField(table)}.${this.escapeField(column)}`);
            return v.transformation.apply(null, columns);
        }).join(', ');
    }
    generateLimitClause(limitObj) {
        return (!limitObj) ? '' : [
            ' LIMIT ',
            limitObj.offset,
            ', ',
            limitObj.count
        ].join('');
    }
    aggregate(aggregator) {
        return typeof aggregator === 'function' ? aggregator : ((this.aggregates.hasOwnProperty(aggregator) ?
            this.aggregates[aggregator] :
            this.aggregates[this.defaultAggregate]));
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
    is: (field) => `${field} = __VAR__`,
    not: (field) => `${field} <> __VAR__`,
    lt: (field) => `${field} < __VAR__`,
    lte: (field) => `${field} <= __VAR__`,
    gt: (field) => `${field} > __VAR__`,
    gte: (field) => `${field} >= __VAR__`,
    contains: (field) => `${field} LIKE '%' || __VAR__ || '%'`,
    icontains: (field) => `${field} ILIKE '%' || __VAR__ || '%'`,
    startswith: (field) => `${field} LIKE __VAR__ || '%'`,
    istartswith: (field) => `${field} ILIKE __VAR__ || '%'`,
    endswith: (field) => `${field} LIKE '%' || __VAR__`,
    iendswith: (field) => `${field} ILIKE '%' || __VAR__`,
    like: (field) => `${field} LIKE __VAR__`,
    ilike: (field) => `${field} ILIKE __VAR__`,
    is_null: (field) => `${field} IS NULL`,
    not_null: (field) => `${field} IS NOT NULL`,
    in: (field) => `ARRAY[${field}] <@ __VAR__`,
    not_in: (field) => `NOT (ARRAY[${field}] <@ __VAR__)`
};
SQLAdapter.prototype.comparatorIgnoresValue = {
    is_null: true,
    not_null: true
};
SQLAdapter.prototype.documentTypes = [];
SQLAdapter.prototype.aggregates = {
    sum: (field) => `SUM(${field})`,
    avg: (field) => `AVG(${field})`,
    min: (field) => `MIN(${field})`,
    max: (field) => `MAX(${field})`,
    count: (field) => `COUNT(${field})`,
    distinct: (field) => `COUNT(DISTINCT(${field}))`,
    none: (field) => `NULL`,
    min_date: (field) => `MIN(DATE_TRUNC('day', ${field}))`,
    max_date: (field) => `MAX(DATE_TRUNC('day', ${field}))`,
    count_true: (field) => `COUNT(CASE WHEN ${field} THEN 1 ELSE NULL END)`
};
SQLAdapter.prototype.defaultAggregate = 'none';
SQLAdapter.prototype.types = {};
SQLAdapter.prototype.sanitizeType = {};
SQLAdapter.prototype.escapeFieldCharacter = '';
SQLAdapter.prototype.columnDepthDelimiter = '';
SQLAdapter.prototype.whereDepthDelimiter = '';
SQLAdapter.prototype.supportsForeignKey = false;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SQLAdapter;
