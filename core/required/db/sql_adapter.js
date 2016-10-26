"use strict";
class SQLAdapter {
    sanitize(type, value) {
        const fnSanitize = this.sanitizeType[type];
        return fnSanitize ? fnSanitize(value) : value;
    }
    escapeField(name) {
        return ['', name, ''].join(this.escapeFieldCharacter);
    }
    getTypeProperties(typeName, optionalValues) {
        const type = this.types[typeName];
        const typeProperties = type ? (type.properties || {}) : {};
        optionalValues = optionalValues || {};
        const outputType = Object.create(this.typePropertyDefaults);
        this.typeProperties.forEach((v) => {
            if (optionalValues.hasOwnProperty(v)) {
                outputType[v] = optionalValues[v];
            }
            else if (typeProperties.hasOwnProperty(v)) {
                outputType[v] = typeProperties[v];
            }
        });
        return outputType;
    }
    getTypeDbName(typeName) {
        const type = this.types[typeName];
        return type ? type.dbName : 'INTEGER';
    }
    generateColumnsStatement(table, columns) {
        const self = this;
        return columns
            .map(function (columnData) {
            return self.generateColumn(columnData.name, self.getTypeDbName(columnData.type), self.getTypeProperties(columnData.type, columnData.properties));
        })
            .join(',');
    }
    getAutoIncrementKeys(columns) {
        let self = this;
        return columns.filter(function (columnData) {
            return self.getTypeProperties(columnData.type, columnData.properties).auto_increment;
        });
    }
    ;
    getPrimaryKeys(columns) {
        let self = this;
        return columns
            .filter(function (columnData) {
            return self.getTypeProperties(columnData.type, columnData.properties).primary_key;
        });
    }
    getUniqueKeys(columns) {
        let self = this;
        return columns
            .filter(function (columnData) {
            let type = self.getTypeProperties(columnData.type, columnData.properties);
            return (!type.primary_key && type.unique);
        });
    }
    generatePrimaryKeysStatement(table, columns) {
        let self = this;
        return this.getPrimaryKeys(columns)
            .map(function (columnData) {
            return self.generatePrimaryKey(table, columnData.name);
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
            ].filter(function (v) { return !!v; }).join(','),
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
                field = typeof field === 'string' ? { columnNames: [field], alias: field, transformation: (v) => v } : field;
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
            columnNames.map(function (v, i) { return '$' + (i + 1); }).join(','),
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
            columnNames.map(function (v, i) { return '$' + (i + 1); }).join(','),
            ') RETURNING *'
        ].join('');
    }
    generateAlterTableQuery(table, columnName, type, properties) {
        let queries = [];
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
    createMultiFilter(table, whereObjArray) {
        return whereObjArray
            .filter((v) => v)
            .sort((a, b) => a.joined === b.joined ? a.table > b.table : a.joined > b.joined) // important! must be sorted.
            .map((v) => this.preprocessWhereObj(table, v))
            .map((v) => this.parseWhereObj(table, v));
    }
    generateWhereClause(table, multiFilter, paramOffset) {
        paramOffset = Math.max(0, parseInt(paramOffset) || 0);
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
        return ('(' + multiFilter.map((whereObj) => {
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
                clauses.push(comparators[whereObj.comparator](whereObj.refName, whereObj.value));
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
                currentJoinedClauses.push(comparators[whereObj.comparator](whereObj.refName, whereObj.value));
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
        let joinedAlready = {};
        return (!joinArray || !joinArray.length) ? '' :
            joinArray.map((joinData) => {
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
        return !groupByArray.length ? '' : ' GROUP BY ' + groupByArray.map((v) => {
            let columns = v.columnNames.map((column) => `${this.escapeField(table)}.${this.escapeField(column)}`);
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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S0FBSyxHQUFHO0lBQ3ZDLEdBQUcsRUFBRSxDQUFDLEtBQWEsS0FBSyxPQUFPLEtBQUssR0FBRztJQUN2QyxLQUFLLEVBQUUsQ0FBQyxLQUFhLEtBQUssU0FBUyxLQUFLLEdBQUc7SUFDM0MsUUFBUSxFQUFFLENBQUMsS0FBYSxLQUFLLGtCQUFrQixLQUFLLElBQUk7SUFDeEQsSUFBSSxFQUFFLENBQUMsS0FBYSxLQUFLLE1BQU07SUFDL0IsUUFBUSxFQUFFLENBQUMsS0FBYSxLQUFLLHlCQUF5QixLQUFLLElBQUk7SUFDL0QsUUFBUSxFQUFFLENBQUMsS0FBYSxLQUFLLHlCQUF5QixLQUFLLElBQUk7SUFDL0QsVUFBVSxFQUFFLENBQUMsS0FBYSxLQUFLLG1CQUFtQixLQUFLLHdCQUF3QjtDQUNoRixDQUFDO0FBRUYsVUFBVSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsR0FBRyxNQUFNLENBQUM7QUFFL0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLFVBQVUsQ0FBQyxTQUFTLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUN2QyxVQUFVLENBQUMsU0FBUyxDQUFDLG9CQUFvQixHQUFHLEVBQUUsQ0FBQztBQUMvQyxVQUFVLENBQUMsU0FBUyxDQUFDLG9CQUFvQixHQUFHLEVBQUUsQ0FBQztBQUMvQyxVQUFVLENBQUMsU0FBUyxDQUFDLG1CQUFtQixHQUFHLEVBQUUsQ0FBQztBQUU5QyxVQUFVLENBQUMsU0FBUyxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztBQUVoRDtrQkFBZSxVQUFVLENBQUMiLCJmaWxlIjoiZGIvc3FsX2FkYXB0ZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0RhdGFUeXBlLCBJQ29sdW1uLCBJQ29sdW1uUHJvcGVydGllc30gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgdHlwZSBDb21wYXJhdG9yVHlwZSA9ICdpcycgfCAnbm90JyB8ICdsdCcgfCAnbHRlJyB8ICdndCcgfCAnZ3RlJyB8ICdjb250YWlucycgfCAnaWNvbnRhaW5zJyB8XG4gICAgICAgICAgICAgICAgICAgICAgJ3N0YXJ0c3dpdGgnIHwgJ2lzdGFydHN3aXRoJyB8ICdlbmRzd2l0aCcgfCAnaWVuZHN3aXRoJyB8ICdsaWtlJyB8ICdpbGlrZScgfCAnaXNfbnVsbCcgfCAnbm90X251bGwnIHwgJ2luJyB8ICdub3RfaW4nO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wYXJhdG9yIHtcbiAgW3R5cGVLZXk6IHN0cmluZ106IEZ1bmN0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXaGVyZU9iamVjdCB7XG4gIHRhYmxlOiBzdHJpbmc7XG4gIGNvbHVtbk5hbWU6IHN0cmluZztcbiAgcmVmTmFtZTogc3RyaW5nO1xuICBjb21wYXJhdG9yOiBDb21wYXJhdG9yVHlwZTtcbiAgdmFsdWU6IGFueTtcbiAgaWdub3JlVmFsdWU6IGJvb2xlYW47XG4gIGpvaW5lZDogYW55O1xuICBqb2luczogYW55O1xufVxuXG5hYnN0cmFjdCBjbGFzcyBTUUxBZGFwdGVyIHtcblxuICAvLyB0c2xpbnQ6ZGlzYWJsZTptYXgtbGluZS1sZW5ndGhcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQ29ubmVjdGlvblN0cmluZyhob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgZGF0YWJhc2U6IHN0cmluZywgdXNlcjogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgcGFyc2VDb25uZWN0aW9uU3RyaW5nKHN0cjogc3RyaW5nKTogdm9pZDtcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQ2xlYXJEYXRhYmFzZVF1ZXJ5KCk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQ3JlYXRlRGF0YWJhc2VRdWVyeSguLi5hcmdzOiBhbnlbXSk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlRHJvcERhdGFiYXNlUXVlcnkoLi4uYXJnczogYW55W10pOiBzdHJpbmc7XG4gIHB1YmxpYyBhYnN0cmFjdCBnZW5lcmF0ZUluZGV4KC4uLmFyZ3M6IGFueVtdKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVDb25zdHJhaW50KC4uLmFyZ3M6IGFueVtdKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVDb2x1bW4oY29sdW1uTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBJQ29sdW1uUHJvcGVydGllcyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQWx0ZXJDb2x1bW4oY29sdW1uTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBJQ29sdW1uUHJvcGVydGllcyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQWx0ZXJDb2x1bW5TZXROdWxsKGNvbHVtbk5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogSUNvbHVtblByb3BlcnRpZXMpOiBzdHJpbmc7XG4gIHB1YmxpYyBhYnN0cmFjdCBnZW5lcmF0ZVByaW1hcnlLZXkoY29sdW1uTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBJQ29sdW1uUHJvcGVydGllcyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlVW5pcXVlS2V5KGNvbHVtbk5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogSUNvbHVtblByb3BlcnRpZXMpOiBzdHJpbmc7XG4gIHB1YmxpYyBhYnN0cmFjdCBnZW5lcmF0ZUFsdGVyVGFibGVSZW5hbWUodGFibGU6IHN0cmluZywgbmV3VGFibGVOYW1lOiBzdHJpbmcsIGNvbHVtbnM/OiBhbnkpOiBzdHJpbmc7XG4gIHB1YmxpYyBhYnN0cmFjdCBnZW5lcmF0ZUFsdGVyVGFibGVDb2x1bW5UeXBlKHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgY29sdW1uVHlwZTogc3RyaW5nLCBjb2x1bW5Qcm9wZXJ0aWVzOiBJQ29sdW1uUHJvcGVydGllcyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQWx0ZXJUYWJsZUFkZFByaW1hcnlLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVBbHRlclRhYmxlRHJvcFByaW1hcnlLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVBbHRlclRhYmxlQWRkVW5pcXVlS2V5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQWx0ZXJUYWJsZURyb3BVbmlxdWVLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVBbHRlclRhYmxlQWRkQ29sdW1uKHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgY29sdW1uVHlwZTogc3RyaW5nLCBjb2x1bW5Qcm9wZXJ0aWVzOiBJQ29sdW1uUHJvcGVydGllcyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlQWx0ZXJUYWJsZURyb3BDb2x1bW4odGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVBbHRlclRhYmxlUmVuYW1lQ29sdW1uKHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgbmV3Q29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVDcmVhdGVJbmRleCh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsIGluZGV4VHlwZTogYW55KTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVEcm9wSW5kZXgodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKTogc3RyaW5nO1xuICBwdWJsaWMgYWJzdHJhY3QgZ2VuZXJhdGVTaW1wbGVGb3JlaWduS2V5UXVlcnkodGFibGU6IHN0cmluZywgcmVmZXJlbmNlVGFibGU6IHN0cmluZyk6IHN0cmluZztcbiAgcHVibGljIGFic3RyYWN0IGdlbmVyYXRlRHJvcFNpbXBsZUZvcmVpZ25LZXlRdWVyeSh0YWJsZTogc3RyaW5nLCByZWZlcmVuY2VUYWJsZTogc3RyaW5nKTogc3RyaW5nO1xuICAvLyB0c2xpbnQ6ZW5hYmxlOm1heC1saW5lLWxlbmd0aFxuXG4gIHB1YmxpYyBzYW5pdGl6ZVR5cGU6IHtcbiAgICBbdHlwZUtleTogc3RyaW5nXTogRnVuY3Rpb247XG4gIH07XG4gIHB1YmxpYyBlc2NhcGVGaWVsZENoYXJhY3Rlcjogc3RyaW5nO1xuICBwdWJsaWMgdHlwZXM6IHtcbiAgICBbdHlwZU5hbWU6IHN0cmluZ106IHtcbiAgICAgIGRiTmFtZTogc3RyaW5nO1xuICAgICAgcHJvcGVydGllcz86IElDb2x1bW5Qcm9wZXJ0aWVzO1xuICAgIH1cbiAgfTtcbiAgcHVibGljIHR5cGVQcm9wZXJ0eURlZmF1bHRzOiBJQ29sdW1uUHJvcGVydGllcztcbiAgcHVibGljIHR5cGVQcm9wZXJ0aWVzOiBzdHJpbmdbXTtcbiAgcHVibGljIGNvbXBhcmF0b3JJZ25vcmVzVmFsdWU6IHtcbiAgICBpc19udWxsOiBib29sZWFuLFxuICAgIG5vdF9udWxsOiBib29sZWFuLFxuICAgIFtrZXk6IHN0cmluZ106IGFueTtcbiAgfTtcbiAgcHVibGljIGNvbXBhcmF0b3JzOiB7XG4gICAgW2tleTogc3RyaW5nXTogRnVuY3Rpb247XG4gIH07XG4gIHB1YmxpYyBhZ2dyZWdhdGVzOiB7XG4gICAgW2tleTogc3RyaW5nXTogRnVuY3Rpb247XG4gIH07XG4gIHB1YmxpYyBkZWZhdWx0QWdncmVnYXRlOiBzdHJpbmc7XG4gIHB1YmxpYyBjb2x1bW5EZXB0aERlbGltaXRlcjogc3RyaW5nO1xuICBwdWJsaWMgd2hlcmVEZXB0aERlbGltaXRlcjogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdXBwb3J0c0ZvcmVpZ25LZXk6IGJvb2xlYW47XG4gIHB1YmxpYyBkb2N1bWVudFR5cGVzOiBzdHJpbmdbXTtcbiAgcHVibGljIGluZGV4VHlwZXM6IHN0cmluZ1tdO1xuXG4gIHB1YmxpYyBzYW5pdGl6ZSh0eXBlOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcblxuICAgIGNvbnN0IGZuU2FuaXRpemUgPSB0aGlzLnNhbml0aXplVHlwZVt0eXBlXTtcbiAgICByZXR1cm4gZm5TYW5pdGl6ZSA/IGZuU2FuaXRpemUodmFsdWUpIDogdmFsdWU7XG5cbiAgfVxuXG4gIHB1YmxpYyBlc2NhcGVGaWVsZChuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gWycnLCBuYW1lLCAnJ10uam9pbih0aGlzLmVzY2FwZUZpZWxkQ2hhcmFjdGVyKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRUeXBlUHJvcGVydGllcyh0eXBlTmFtZTogc3RyaW5nLCBvcHRpb25hbFZhbHVlczogYW55KSB7XG5cbiAgICBjb25zdCB0eXBlID0gdGhpcy50eXBlc1t0eXBlTmFtZV07XG4gICAgY29uc3QgdHlwZVByb3BlcnRpZXM6IGFueSA9IHR5cGUgPyAodHlwZS5wcm9wZXJ0aWVzIHx8IHt9KSA6IHt9O1xuXG4gICAgb3B0aW9uYWxWYWx1ZXMgPSBvcHRpb25hbFZhbHVlcyB8fCB7fTtcblxuICAgIGNvbnN0IG91dHB1dFR5cGU6IGFueSA9IE9iamVjdC5jcmVhdGUodGhpcy50eXBlUHJvcGVydHlEZWZhdWx0cyk7XG4gICAgdGhpcy50eXBlUHJvcGVydGllcy5mb3JFYWNoKCh2KSA9PiB7XG4gICAgICBpZiAob3B0aW9uYWxWYWx1ZXMuaGFzT3duUHJvcGVydHkodikpIHtcbiAgICAgICAgb3V0cHV0VHlwZVt2XSA9IG9wdGlvbmFsVmFsdWVzW3ZdO1xuICAgICAgfSBlbHNlIGlmKHR5cGVQcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHYpKSB7XG4gICAgICAgIG91dHB1dFR5cGVbdl0gPSB0eXBlUHJvcGVydGllc1t2XTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBvdXRwdXRUeXBlO1xuXG4gIH1cblxuICBwdWJsaWMgZ2V0VHlwZURiTmFtZSh0eXBlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgdHlwZSA9IHRoaXMudHlwZXNbdHlwZU5hbWVdO1xuICAgIHJldHVybiB0eXBlID8gdHlwZS5kYk5hbWUgOiAnSU5URUdFUic7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDb2x1bW5zU3RhdGVtZW50KHRhYmxlOiBzdHJpbmcsIGNvbHVtbnM6IElDb2x1bW5bXSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBjb2x1bW5zXG4gICAgICAubWFwKGZ1bmN0aW9uKGNvbHVtbkRhdGEpIHtcbiAgICAgICAgcmV0dXJuIHNlbGYuZ2VuZXJhdGVDb2x1bW4oY29sdW1uRGF0YS5uYW1lLCBzZWxmLmdldFR5cGVEYk5hbWUoY29sdW1uRGF0YS50eXBlKSwgc2VsZi5nZXRUeXBlUHJvcGVydGllcyhjb2x1bW5EYXRhLnR5cGUsIGNvbHVtbkRhdGEucHJvcGVydGllcykpO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsJyk7XG4gIH1cblxuICBwdWJsaWMgZ2V0QXV0b0luY3JlbWVudEtleXMoY29sdW1uczogSUNvbHVtbltdKSB7XG5cbiAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uKGNvbHVtbkRhdGEpIHtcbiAgICAgIHJldHVybiBzZWxmLmdldFR5cGVQcm9wZXJ0aWVzKGNvbHVtbkRhdGEudHlwZSwgY29sdW1uRGF0YS5wcm9wZXJ0aWVzKS5hdXRvX2luY3JlbWVudDtcbiAgICB9KTtcblxuICB9O1xuXG4gIHB1YmxpYyBnZXRQcmltYXJ5S2V5cyhjb2x1bW5zOiBJQ29sdW1uW10pIHtcblxuICAgIGxldCBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gY29sdW1uc1xuICAgICAgLmZpbHRlcihmdW5jdGlvbihjb2x1bW5EYXRhKSB7XG4gICAgICAgIHJldHVybiBzZWxmLmdldFR5cGVQcm9wZXJ0aWVzKGNvbHVtbkRhdGEudHlwZSwgY29sdW1uRGF0YS5wcm9wZXJ0aWVzKS5wcmltYXJ5X2tleTtcbiAgICAgIH0pO1xuXG5cbiAgfVxuXG4gIHB1YmxpYyBnZXRVbmlxdWVLZXlzKGNvbHVtbnM6IElDb2x1bW5bXSkge1xuXG4gICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBjb2x1bW5zXG4gICAgICAuZmlsdGVyKGZ1bmN0aW9uKGNvbHVtbkRhdGEpIHtcbiAgICAgICAgbGV0IHR5cGUgPSBzZWxmLmdldFR5cGVQcm9wZXJ0aWVzKGNvbHVtbkRhdGEudHlwZSwgY29sdW1uRGF0YS5wcm9wZXJ0aWVzKTtcbiAgICAgICAgcmV0dXJuICghdHlwZS5wcmltYXJ5X2tleSAmJiB0eXBlLnVuaXF1ZSk7XG4gICAgICB9KTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlUHJpbWFyeUtleXNTdGF0ZW1lbnQodGFibGU6IHN0cmluZywgY29sdW1uczogSUNvbHVtbltdKSB7XG4gICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0aGlzLmdldFByaW1hcnlLZXlzKGNvbHVtbnMpXG4gICAgICAubWFwKGZ1bmN0aW9uKGNvbHVtbkRhdGEpIHtcbiAgICAgICAgcmV0dXJuIHNlbGYuZ2VuZXJhdGVQcmltYXJ5S2V5KHRhYmxlLCBjb2x1bW5EYXRhLm5hbWUpO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsJyk7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVVbmlxdWVLZXlzU3RhdGVtZW50KHRhYmxlOiBzdHJpbmcsIGNvbHVtbnM6IElDb2x1bW5bXSkge1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0VW5pcXVlS2V5cyhjb2x1bW5zKVxuICAgICAgLm1hcChjb2x1bW5EYXRhID0+IHRoaXMuZ2VuZXJhdGVVbmlxdWVLZXkodGFibGUsIGNvbHVtbkRhdGEubmFtZSkpXG4gICAgICAuam9pbignLCcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDcmVhdGVUYWJsZVF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbnM6IElDb2x1bW5bXSkge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdDUkVBVEUgVEFCTEUgJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnKCcsXG4gICAgICAgIFtcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlQ29sdW1uc1N0YXRlbWVudCh0YWJsZSwgY29sdW1ucyksXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZVByaW1hcnlLZXlzU3RhdGVtZW50KHRhYmxlLCBjb2x1bW5zKSxcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlVW5pcXVlS2V5c1N0YXRlbWVudCh0YWJsZSwgY29sdW1ucylcbiAgICAgICAgXS5maWx0ZXIoZnVuY3Rpb24odikgeyByZXR1cm4gISF2OyB9KS5qb2luKCcsJyksXG4gICAgICAnKSdcbiAgICBdLmpvaW4oJycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVEcm9wVGFibGVRdWVyeSh0YWJsZTogc3RyaW5nLCBpZkV4aXN0czogYm9vbGVhbikge1xuXG4gICAgcmV0dXJuIGBEUk9QIFRBQkxFICR7aWZFeGlzdHM/J0lGIEVYSVNUUyAnOicnfSR7dGhpcy5lc2NhcGVGaWVsZCh0YWJsZSl9YDtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlVHJ1bmNhdGVUYWJsZVF1ZXJ5KHRhYmxlOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiBgVFJVTkNBVEUgVEFCTEUgJHt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKX0gUkVTVEFSVCBJREVOVElUWWA7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZVNlbGVjdFF1ZXJ5KHN1YlF1ZXJ5OiBhbnksIHRhYmxlOiBzdHJpbmcsIGNvbHVtbnM6IElDb2x1bW5bXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXVsdGlGaWx0ZXI6IGFueSwgam9pbkFycmF5OiBhbnlbXSwgZ3JvdXBCeUFycmF5OiBhbnlbXSwgb3JkZXJCeUFycmF5OiBhbnlbXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbWl0T2JqOiBhbnksIHBhcmFtT2Zmc2V0OiBhbnkpIHtcblxuICAgIGNvbnN0IGZvcm1hdFRhYmxlRmllbGQgPSAodGFibGU6IHN0cmluZywgY29sdW1uOiBzdHJpbmcpID0+IGAke3RoaXMuZXNjYXBlRmllbGQodGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoY29sdW1uKX1gO1xuXG4gICAgaWYgKHR5cGVvZiBzdWJRdWVyeSA9PT0gJ29iamVjdCcgJiYgc3ViUXVlcnkgIT09IG51bGwpIHtcbiAgICAgIHN1YlF1ZXJ5ID0gdGhpcy5lc2NhcGVGaWVsZChzdWJRdWVyeS50YWJsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1YlF1ZXJ5ID0gc3ViUXVlcnkgPyBgKCR7c3ViUXVlcnl9KWAgOiB0YWJsZTtcbiAgICB9XG5cbiAgICBncm91cEJ5QXJyYXkgPSBncm91cEJ5QXJyYXkgfHwgW107XG4gICAgb3JkZXJCeUFycmF5ID0gb3JkZXJCeUFycmF5IHx8IFtdO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdTRUxFQ1QgJyxcbiAgICAgICAgY29sdW1ucy5tYXAoKGZpZWxkOiBhbnkpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IHR5cGVvZiBmaWVsZCA9PT0gJ3N0cmluZycgPyB7Y29sdW1uTmFtZXM6IFtmaWVsZF0sIGFsaWFzOiBmaWVsZCwgdHJhbnNmb3JtYXRpb246ICh2OiBhbnkpID0+IHZ9IDogZmllbGQ7XG4gICAgICAgICAgY29uc3QgZGVmbiA9IGZpZWxkLnRyYW5zZm9ybWF0aW9uLmFwcGx5KG51bGwsIGZpZWxkLmNvbHVtbk5hbWVzLm1hcCgoY29sdW1uTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZm9ybWF0VGFibGVGaWVsZChmaWVsZC5uYW1lIHx8IGZpZWxkLnRhYmxlIHx8IHRhYmxlLCBjb2x1bW5OYW1lKTtcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgcmV0dXJuIGAoJHtkZWZufSkgQVMgJHt0aGlzLmVzY2FwZUZpZWxkKGZpZWxkLmFsaWFzKX1gO1xuICAgICAgICB9KS5qb2luKCcsJyksXG4gICAgICAnIEZST00gJyxcbiAgICAgICAgc3ViUXVlcnksXG4gICAgICAgICcgQVMgJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVKb2luQ2xhdXNlKHRhYmxlLCBqb2luQXJyYXksIHBhcmFtT2Zmc2V0KSxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZVdoZXJlQ2xhdXNlKHRhYmxlLCBtdWx0aUZpbHRlciwgcGFyYW1PZmZzZXQpLFxuICAgICAgICB0aGlzLmdlbmVyYXRlR3JvdXBCeUNsYXVzZSh0YWJsZSwgZ3JvdXBCeUFycmF5KSxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZU9yZGVyQnlDbGF1c2UodGFibGUsIG9yZGVyQnlBcnJheSwgZ3JvdXBCeUFycmF5KSxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUxpbWl0Q2xhdXNlKGxpbWl0T2JqKVxuICAgIF0uam9pbignJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUNvdW50UXVlcnkoc3ViUXVlcnk6IHN0cmluZywgdGFibGU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIGBTRUxFQ1QgQ09VTlQoKikgYCxcbiAgICAgIGBBUyBfX3RvdGFsX18gRlJPTSBgLFxuICAgICAgc3ViUXVlcnkgPyBgKCR7c3ViUXVlcnl9KSBBUyBgIDogJycsXG4gICAgICBgJHt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKX1gXG4gICAgXS5qb2luKCcnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlVXBkYXRlUXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZXM6IGFueSkge1xuXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVVcGRhdGVBbGxRdWVyeSh0YWJsZSwgY29sdW1uTmFtZXNbMF0sIGNvbHVtbk5hbWVzLnNsaWNlKDEpLCBbXSwgMSk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZVVwZGF0ZUFsbFF1ZXJ5KHRhYmxlOiBzdHJpbmcsIHBrQ29sdW1uOiBzdHJpbmcsIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uRnVuY3Rpb25zOiBhbnksIG9mZnNldD86IG51bWJlciwgc3ViUXVlcnk/OiBhbnkpIHtcblxuICAgIGNvbnN0IGZpZWxkcyA9IGNvbHVtbk5hbWVzXG4gICAgICAubWFwKHRoaXMuZXNjYXBlRmllbGQuYmluZCh0aGlzKSlcbiAgICAgIC5jb25jYXQoY29sdW1uRnVuY3Rpb25zLm1hcCgoZjogYW55KSA9PiB0aGlzLmVzY2FwZUZpZWxkKGZbMF0pKSk7XG5cbiAgICBjb25zdCBwYXJhbXMgPSBjb2x1bW5OYW1lc1xuICAgICAgLm1hcCgodjogYW55LCBpOiBhbnkpID0+ICckJyArIChpICsgb2Zmc2V0ICsgMSkpXG4gICAgICAuY29uY2F0KGNvbHVtbkZ1bmN0aW9ucy5tYXAoKGY6IGFueSkgPT4gZlsxXSh0aGlzLmVzY2FwZUZpZWxkKGZbMF0pKSkpO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIGBVUERBVEUgJHt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKX1gLFxuICAgICAgYCBTRVQgKCR7ZmllbGRzLmpvaW4oJywnKX0pID0gKCR7cGFyYW1zLmpvaW4oJywnKX0pYCxcbiAgICAgIGAgV0hFUkUgKGAsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQocGtDb2x1bW4pLFxuICAgICAgICBzdWJRdWVyeSA/IGAgSU4gKCR7c3ViUXVlcnl9KWAgOiBgID0gJDFgLFxuICAgICAgYCkgUkVUVVJOSU5HICpgXG4gICAgXS5qb2luKCcnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlRGVsZXRlUXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZXM6IHN0cmluZ1tdKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgJ0RFTEVURSBGUk9NICcsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQodGFibGUpLFxuICAgICAgJyBXSEVSRSAoJyxcbiAgICAgICAgY29sdW1uTmFtZXMubWFwKHRoaXMuZXNjYXBlRmllbGQuYmluZCh0aGlzKSkuam9pbignLCcpLFxuICAgICAgJykgPSAoJyxcbiAgICAgICAgY29sdW1uTmFtZXMubWFwKGZ1bmN0aW9uKHYsIGkpIHsgcmV0dXJuICckJyArIChpICsgMSk7IH0pLmpvaW4oJywnKSxcbiAgICAgICcpIFJFVFVSTklORyAqJ1xuICAgIF0uam9pbignJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZURlbGV0ZUFsbFF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgdmFsdWVzOiBhbnksIGpvaW5zOiBhbnkpIHtcblxuICAgIGxldCBzdWJRdWVyeTogYW55O1xuXG4gICAgaWYgKCFqb2lucykge1xuXG4gICAgICBzdWJRdWVyeSA9IGAke3ZhbHVlcy5tYXAoKHY6IGFueSwgaTogYW55KSA9PiAnXFwkJyArIChpICsgMSkpfWA7XG5cbiAgICB9IGVsc2Uge1xuXG4gICAgICBzdWJRdWVyeSA9IFtcbiAgICAgICAgYFNFTEVDVCAke3RoaXMuZXNjYXBlRmllbGQodGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoY29sdW1uTmFtZSl9IEZST00gJHt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKX1gXG4gICAgICBdO1xuXG4gICAgICBzdWJRdWVyeSA9IHN1YlF1ZXJ5LmNvbmNhdChcbiAgICAgICAgam9pbnMuc2xpY2UoKS5yZXZlcnNlKCkubWFwKChqOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBgSU5ORVIgSk9JTiAke3RoaXMuZXNjYXBlRmllbGQoai5wcmV2VGFibGUpfSBPTiBgLFxuICAgICAgICAgICAgYCR7dGhpcy5lc2NhcGVGaWVsZChqLnByZXZUYWJsZSl9LiR7dGhpcy5lc2NhcGVGaWVsZChqLnByZXZDb2x1bW4pfSA9IGAsXG4gICAgICAgICAgICBgJHt0aGlzLmVzY2FwZUZpZWxkKGouam9pblRhYmxlKX0uJHt0aGlzLmVzY2FwZUZpZWxkKGouam9pbkNvbHVtbil9YCxcbiAgICAgICAgICAgIGkgPT09IGpvaW5zLmxlbmd0aCAtIDEgP1xuICAgICAgICAgICAgICBgIEFORCAke3RoaXMuZXNjYXBlRmllbGQoai5wcmV2VGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoai5wcmV2Q29sdW1uKX0gSU4gKCR7dmFsdWVzLm1hcCgodjogYW55LCBpOiBhbnkpID0+ICdcXCQnICsgKGkgKyAxKSl9KWAgOiAnJ1xuICAgICAgICAgIF0uam9pbignJylcbiAgICAgICAgfSlcbiAgICAgICkuam9pbignICcpO1xuXG4gICAgfVxuXG4gICAgcmV0dXJuIFtcbiAgICAgIGBERUxFVEUgRlJPTSAke3RoaXMuZXNjYXBlRmllbGQodGFibGUpfWAsXG4gICAgICBgV0hFUkUgJHt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKX0uJHt0aGlzLmVzY2FwZUZpZWxkKGNvbHVtbk5hbWUpfWAsXG4gICAgICBgSU4gKCR7c3ViUXVlcnl9KWBcbiAgICBdLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUluc2VydFF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSkge1xuICAgIHJldHVybiBbXG4gICAgICAnSU5TRVJUIElOVE8gJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnKCcsXG4gICAgICAgIGNvbHVtbk5hbWVzLm1hcCh0aGlzLmVzY2FwZUZpZWxkLmJpbmQodGhpcykpLmpvaW4oJywnKSxcbiAgICAgICcpIFZBTFVFUygnLFxuICAgICAgICBjb2x1bW5OYW1lcy5tYXAoZnVuY3Rpb24odiwgaSkgeyByZXR1cm4gJyQnICsgKGkgKyAxKTsgfSkuam9pbignLCcpLFxuICAgICAgJykgUkVUVVJOSU5HIConXG4gICAgXS5qb2luKCcnKTtcbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUFsdGVyVGFibGVRdWVyeSh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgcHJvcGVydGllczogYW55KSB7XG5cbiAgICBsZXQgcXVlcmllczogYW55W10gPSBbXTtcblxuICAgIGlmICh0eXBlKSB7XG4gICAgICBxdWVyaWVzLnB1c2goXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVBbHRlclRhYmxlQ29sdW1uVHlwZShcbiAgICAgICAgICB0YWJsZSxcbiAgICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICAgIHRoaXMuZ2V0VHlwZURiTmFtZSh0eXBlKSxcbiAgICAgICAgICB0aGlzLmdldFR5cGVQcm9wZXJ0aWVzKHR5cGUsIHByb3BlcnRpZXMpXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkoJ3ByaW1hcnlfa2V5JykpIHtcbiAgICAgIHF1ZXJpZXMucHVzaChcbiAgICAgICAgW1xuICAgICAgICAgIHRoaXMuZ2VuZXJhdGVBbHRlclRhYmxlRHJvcFByaW1hcnlLZXksXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZUFsdGVyVGFibGVBZGRQcmltYXJ5S2V5XG4gICAgICAgIF1bcHJvcGVydGllcy5wcmltYXJ5X2tleSB8IDBdLmNhbGwodGhpcywgdGFibGUsIGNvbHVtbk5hbWUpXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAocHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eSgndW5pcXVlJykpIHtcbiAgICAgIHF1ZXJpZXMucHVzaChcbiAgICAgICAgW1xuICAgICAgICAgIHRoaXMuZ2VuZXJhdGVBbHRlclRhYmxlRHJvcFVuaXF1ZUtleSxcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlQWx0ZXJUYWJsZUFkZFVuaXF1ZUtleVxuICAgICAgICBdW3Byb3BlcnRpZXMudW5pcXVlIHwgMF0uY2FsbCh0aGlzLCB0YWJsZSwgY29sdW1uTmFtZSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHF1ZXJpZXMuam9pbignOycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbHRlclRhYmxlQWRkQ29sdW1uUXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHByb3BlcnRpZXM6IGFueSkge1xuXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVBbHRlclRhYmxlQWRkQ29sdW1uKFxuICAgICAgdGFibGUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgdGhpcy5nZXRUeXBlRGJOYW1lKHR5cGUpLFxuICAgICAgdGhpcy5nZXRUeXBlUHJvcGVydGllcyh0eXBlLCBwcm9wZXJ0aWVzKVxuICAgICk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUFsdGVyVGFibGVEcm9wQ29sdW1uUXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZUFsdGVyVGFibGVEcm9wQ29sdW1uKHRhYmxlLCBjb2x1bW5OYW1lKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJUYWJsZVJlbmFtZUNvbHVtblF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgbmV3Q29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZUFsdGVyVGFibGVSZW5hbWVDb2x1bW4odGFibGUsIGNvbHVtbk5hbWUsIG5ld0NvbHVtbk5hbWUpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDcmVhdGVJbmRleFF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZywgaW5kZXhUeXBlOiBzdHJpbmcpIHtcblxuICAgIGluZGV4VHlwZSA9IGluZGV4VHlwZSB8fCAnYnRyZWUnO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVDcmVhdGVJbmRleCh0YWJsZSwgY29sdW1uTmFtZSwgaW5kZXhUeXBlKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlRHJvcEluZGV4UXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZURyb3BJbmRleCh0YWJsZSwgY29sdW1uTmFtZSk7XG5cbiAgfVxuXG4gIHB1YmxpYyBwcmVwcm9jZXNzV2hlcmVPYmoodGFibGU6IHN0cmluZywgd2hlcmVPYmo6IElXaGVyZU9iamVjdCkge1xuICAgIHJldHVybiB3aGVyZU9iajtcbiAgfVxuXG4gIHB1YmxpYyBwYXJzZVdoZXJlT2JqKHRhYmxlOiBzdHJpbmcsIHdoZXJlT2JqOiBJV2hlcmVPYmplY3RbXSkge1xuXG4gICAgcmV0dXJuIHdoZXJlT2JqLm1hcCgod2hlcmUsIGkpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRhYmxlOiB3aGVyZS50YWJsZSxcbiAgICAgICAgY29sdW1uTmFtZTogd2hlcmUuY29sdW1uTmFtZSxcbiAgICAgICAgcmVmTmFtZTogW3RoaXMuZXNjYXBlRmllbGQod2hlcmUudGFibGUgfHwgdGFibGUpLCB0aGlzLmVzY2FwZUZpZWxkKHdoZXJlLmNvbHVtbk5hbWUpXS5qb2luKCcuJyksXG4gICAgICAgIGNvbXBhcmF0b3I6IHdoZXJlLmNvbXBhcmF0b3IsXG4gICAgICAgIHZhbHVlOiB3aGVyZS52YWx1ZSxcbiAgICAgICAgaWdub3JlVmFsdWU6ICEhdGhpcy5jb21wYXJhdG9ySWdub3Jlc1ZhbHVlW3doZXJlLmNvbXBhcmF0b3JdLFxuICAgICAgICBqb2luZWQ6IHdoZXJlLmpvaW5lZCxcbiAgICAgICAgam9pbnM6IHdoZXJlLmpvaW5zXG4gICAgICB9O1xuICAgIH0pO1xuXG4gIH1cblxuICBwdWJsaWMgY3JlYXRlTXVsdGlGaWx0ZXIodGFibGU6IHN0cmluZywgd2hlcmVPYmpBcnJheTogYW55KSB7XG5cbiAgICByZXR1cm4gd2hlcmVPYmpBcnJheVxuICAgICAgLmZpbHRlcigodjogYW55KSA9PiB2KVxuICAgICAgLy8gVGhpcyBzaG91bGQgYmUgd2l0aCAxJ3MgYW5kIDAncyBub3QgYm9vbGVhbnM/XG4gICAgICAuc29ydCgoYTogYW55LCBiOiBhbnkpID0+IGEuam9pbmVkID09PSBiLmpvaW5lZCA/IGEudGFibGUgPiBiLnRhYmxlIDogYS5qb2luZWQgPiBiLmpvaW5lZCkgLy8gaW1wb3J0YW50ISBtdXN0IGJlIHNvcnRlZC5cbiAgICAgIC5tYXAoKHY6IGFueSkgPT4gdGhpcy5wcmVwcm9jZXNzV2hlcmVPYmoodGFibGUsIHYpKVxuICAgICAgLm1hcCgodjogYW55KSA9PiB0aGlzLnBhcnNlV2hlcmVPYmoodGFibGUsIHYpKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlV2hlcmVDbGF1c2UodGFibGU6IHN0cmluZywgbXVsdGlGaWx0ZXI6IGFueSwgcGFyYW1PZmZzZXQ6IGFueSkge1xuXG4gICAgcGFyYW1PZmZzZXQgPSBNYXRoLm1heCgwLCBwYXJzZUludChwYXJhbU9mZnNldCkgfHwgMCk7XG5cbiAgICBpZiAoIW11bHRpRmlsdGVyIHx8ICFtdWx0aUZpbHRlci5sZW5ndGgpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICByZXR1cm4gYCBXSEVSRSAke3RoaXMuZ2VuZXJhdGVPckNsYXVzZSh0YWJsZSwgbXVsdGlGaWx0ZXIsIHBhcmFtT2Zmc2V0KX1gO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVPckNsYXVzZSh0YWJsZTogc3RyaW5nLCBtdWx0aUZpbHRlcjogYW55LCBwYXJhbU9mZnNldDogYW55KSB7XG5cbiAgICBwYXJhbU9mZnNldCA9IE1hdGgubWF4KDAsIHBhcnNlSW50KHBhcmFtT2Zmc2V0LCAxMCkgfHwgMCk7XG5cbiAgICBpZiAoIW11bHRpRmlsdGVyIHx8ICFtdWx0aUZpbHRlci5sZW5ndGgpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICByZXR1cm4gKCcoJyArIG11bHRpRmlsdGVyLm1hcCgod2hlcmVPYmo6IElXaGVyZU9iamVjdCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVBbmRDbGF1c2UodGFibGUsIHdoZXJlT2JqKTtcbiAgICB9KS5qb2luKCcpIE9SICgnKSArICcpJykucmVwbGFjZSgvX19WQVJfXy9nLCAoKSA9PiBgXFwkJHsxICsgKHBhcmFtT2Zmc2V0KyspfWApO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbmRDbGF1c2UodGFibGU6IHN0cmluZywgd2hlcmVPYmpBcnJheTogYW55KSB7XG5cbiAgICBjb25zdCBjb21wYXJhdG9ycyA9IHRoaXMuY29tcGFyYXRvcnM7XG5cbiAgICBpZiAoIXdoZXJlT2JqQXJyYXkubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgY29uc3QgbGFzdFRhYmxlID0gbnVsbDtcbiAgICBsZXQgY2xhdXNlczogYW55W10gPSBbXTtcbiAgICBsZXQgam9pbmVkQ2xhdXNlczogYW55W10gPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2hlcmVPYmpBcnJheS5sZW5ndGg7IGkrKykge1xuXG4gICAgICBjb25zdCB3aGVyZU9iaiA9IHdoZXJlT2JqQXJyYXlbaV07XG4gICAgICBjb25zdCBqb2luZWQgPSB3aGVyZU9iai5qb2luZWQ7XG4gICAgICBjb25zdCB0YWJsZSA9IHdoZXJlT2JqLnRhYmxlO1xuXG4gICAgICBpZiAoIWpvaW5lZCkge1xuXG4gICAgICAgIGNsYXVzZXMucHVzaChjb21wYXJhdG9yc1t3aGVyZU9iai5jb21wYXJhdG9yXSh3aGVyZU9iai5yZWZOYW1lLCB3aGVyZU9iai52YWx1ZSkpO1xuXG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIGxldCBjdXJyZW50Sm9pbmVkQ2xhdXNlczogYW55W10gPSBbXTtcblxuICAgICAgICBpZiAobGFzdFRhYmxlID09PSB0YWJsZSkge1xuXG4gICAgICAgICAgY3VycmVudEpvaW5lZENsYXVzZXMgPSBqb2luZWRDbGF1c2VzW2pvaW5lZENsYXVzZXMubGVuZ3RoIC0gMV0uY2xhdXNlcztcblxuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgam9pbmVkQ2xhdXNlcy5wdXNoKHtcbiAgICAgICAgICAgIHRhYmxlOiB0YWJsZSxcbiAgICAgICAgICAgIGpvaW5zOiB3aGVyZU9iai5qb2lucyxcbiAgICAgICAgICAgIGNsYXVzZXM6IGN1cnJlbnRKb2luZWRDbGF1c2VzXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjbGF1c2VzLnB1c2gobnVsbCk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGN1cnJlbnRKb2luZWRDbGF1c2VzLnB1c2goY29tcGFyYXRvcnNbd2hlcmVPYmouY29tcGFyYXRvcl0od2hlcmVPYmoucmVmTmFtZSwgd2hlcmVPYmoudmFsdWUpKTtcblxuICAgICAgfVxuXG4gICAgfVxuXG4gICAgam9pbmVkQ2xhdXNlcyA9IGpvaW5lZENsYXVzZXMubWFwKGpjID0+IHtcblxuICAgICAgcmV0dXJuIFtcbiAgICAgICAgYChgLFxuICAgICAgICAgIGBTRUxFQ1QgJHt0aGlzLmVzY2FwZUZpZWxkKGpjLnRhYmxlKX0uJHt0aGlzLmVzY2FwZUZpZWxkKCdpZCcpfSBgLFxuICAgICAgICAgIGBGUk9NICR7dGhpcy5lc2NhcGVGaWVsZChqYy50YWJsZSl9IGAsXG4gICAgICAgICAgamMuam9pbnMubWFwKChqb2luOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgYElOTkVSIEpPSU4gJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW4uam9pblRhYmxlKX0gQVMgJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW4uam9pbkFsaWFzKX0gT04gYCxcbiAgICAgICAgICAgICAgYCR7dGhpcy5lc2NhcGVGaWVsZChqb2luLmpvaW5BbGlhcyl9LiR7dGhpcy5lc2NhcGVGaWVsZChqb2luLmpvaW5Db2x1bW4pfSA9IGAsXG4gICAgICAgICAgICAgIGAke3RoaXMuZXNjYXBlRmllbGQoam9pbi5wcmV2VGFibGUgfHwgdGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoam9pbi5wcmV2Q29sdW1uKX1gLFxuICAgICAgICAgICAgICBpID09PSBqYy5qb2lucy5sZW5ndGggLSAxID9cbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICBgIEFORCBgLFxuICAgICAgICAgICAgICAgICAgYCR7dGhpcy5lc2NhcGVGaWVsZChqb2luLmpvaW5BbGlhcyl9LiR7dGhpcy5lc2NhcGVGaWVsZChqb2luLmpvaW5Db2x1bW4pfSA9IGAsXG4gICAgICAgICAgICAgICAgICBgJHt0aGlzLmVzY2FwZUZpZWxkKGpjLnRhYmxlKX0uJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW4uam9pbkNvbHVtbil9IGAsXG4gICAgICAgICAgICAgICAgICBgQU5EICgke2pjLmNsYXVzZXMuam9pbignIEFORCAnKX0pIGBcbiAgICAgICAgICAgICAgICBdLmpvaW4oJycpIDogJydcbiAgICAgICAgICAgIF0uam9pbignJylcbiAgICAgICAgICB9KS5qb2luKCcgJyksXG4gICAgICAgICAgYExJTUlUIDFgLFxuICAgICAgICBgKSBJUyBOT1QgTlVMTGBcbiAgICAgIF0uam9pbignJyk7XG5cbiAgICB9KTtcblxuICAgIGNsYXVzZXMgPSBjbGF1c2VzLm1hcChjID0+IHtcbiAgICAgIGlmICghYykge1xuICAgICAgICByZXR1cm4gam9pbmVkQ2xhdXNlcy5zaGlmdCgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGM7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY2xhdXNlcy5qb2luKCcgQU5EICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2V0UGFyYW1zRnJvbU11bHRpRmlsdGVyKG11bHRpRmlsdGVyOiBhbnkpIHtcbiAgICByZXR1cm4gW10uY29uY2F0LmFwcGx5KFtdLCBtdWx0aUZpbHRlcilcbiAgICAgIC5maWx0ZXIoKHdoZXJlT2JqOiBJV2hlcmVPYmplY3QpID0+ICF3aGVyZU9iai5pZ25vcmVWYWx1ZSlcbiAgICAgIC5tYXAoKHdoZXJlT2JqOiBJV2hlcmVPYmplY3QpID0+IHdoZXJlT2JqLnZhbHVlKTtcbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZU9yZGVyQnlDbGF1c2UodGFibGU6IHN0cmluZywgb3JkZXJCeUFycmF5OiBhbnlbXSwgZ3JvdXBCeUFycmF5OiBhbnlbXSkge1xuXG4gICAgcmV0dXJuICFvcmRlckJ5QXJyYXkubGVuZ3RoID8gJycgOiAnIE9SREVSIEJZICcgKyBvcmRlckJ5QXJyYXkubWFwKHYgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IHYuY29sdW1uTmFtZXMubWFwKChjb2x1bW5OYW1lOiBzdHJpbmcpID0+IGAke3RoaXMuZXNjYXBlRmllbGQodGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoY29sdW1uTmFtZSl9YCk7XG4gICAgICByZXR1cm4gYCR7KHYudHJhbnNmb3JtYXRpb24gfHwgKCh2OiBhbnkpID0+IHYpKS5hcHBseShudWxsLCBjb2x1bW5zKX0gJHt2LmRpcmVjdGlvbn1gO1xuICAgIH0pLmpvaW4oJywgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUpvaW5DbGF1c2UodGFibGU6IHN0cmluZywgam9pbkFycmF5OiBhbnksIHBhcmFtT2Zmc2V0OiBhbnkpIHtcblxuICAgIHBhcmFtT2Zmc2V0ID0gTWF0aC5tYXgoMCwgcGFyc2VJbnQocGFyYW1PZmZzZXQsIDEwKSB8fCAwKTtcbiAgICBsZXQgam9pbmVkQWxyZWFkeTogYW55ID0ge307XG5cbiAgICByZXR1cm4gKCFqb2luQXJyYXkgfHwgIWpvaW5BcnJheS5sZW5ndGgpID8gJycgOlxuICAgICAgam9pbkFycmF5Lm1hcCgoam9pbkRhdGE6IGFueSkgPT4ge1xuXG4gICAgICAgIGpvaW5EYXRhID0gam9pbkRhdGEuZmlsdGVyKChqb2luOiBhbnkpID0+ICFqb2luZWRBbHJlYWR5W2pvaW4uam9pbkFsaWFzXSk7XG5cbiAgICAgICAgcmV0dXJuIGpvaW5EYXRhLm1hcCgoam9pbjogYW55LCBpOiBudW1iZXIpID0+IHtcblxuICAgICAgICAgIGpvaW5lZEFscmVhZHlbam9pbi5qb2luQWxpYXNdID0gdHJ1ZTtcblxuICAgICAgICAgIGNvbnN0IGpvaW5Db2x1bW5zID0gam9pbi5qb2luQ29sdW1uIGluc3RhbmNlb2YgQXJyYXkgPyBqb2luLmpvaW5Db2x1bW4gOiBbam9pbi5qb2luQ29sdW1uXVxuICAgICAgICAgIGNvbnN0IHByZXZDb2x1bW5zID0gam9pbi5wcmV2Q29sdW1uIGluc3RhbmNlb2YgQXJyYXkgPyBqb2luLnByZXZDb2x1bW4gOiBbam9pbi5wcmV2Q29sdW1uXVxuXG4gICAgICAgICAgY29uc3Qgc3RhdGVtZW50czogYW55W10gPSBbXTtcblxuICAgICAgICAgIGpvaW5Db2x1bW5zLmZvckVhY2goKGpvaW5Db2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgcHJldkNvbHVtbnMuZm9yRWFjaCgocHJldkNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHN0YXRlbWVudHMucHVzaChcbiAgICAgICAgICAgICAgICBgJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW4uam9pbkFsaWFzKX0uJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW5Db2x1bW4pfSA9IGAgK1xuICAgICAgICAgICAgICAgIGAke3RoaXMuZXNjYXBlRmllbGQoam9pbi5wcmV2QWxpYXMgfHwgdGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQocHJldkNvbHVtbil9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG5cblxuICAgICAgICAgIGNvbnN0IGZpbHRlckNsYXVzZSA9IHRoaXMuZ2VuZXJhdGVPckNsYXVzZShqb2luLmpvaW5BbGlhcywgam9pbi5tdWx0aUZpbHRlciwgcGFyYW1PZmZzZXQpO1xuICAgICAgICAgIGpvaW4ubXVsdGlGaWx0ZXIgJiYgam9pbi5tdWx0aUZpbHRlci5mb3JFYWNoKChhcnI6IGFueSkgPT4gcGFyYW1PZmZzZXQgKz0gYXJyLmxlbmd0aCk7XG5cbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgYCBMRUZUIEpPSU4gJHt0aGlzLmVzY2FwZUZpZWxkKGpvaW4uam9pblRhYmxlKX1gLFxuICAgICAgICAgICAgYCBBUyAke3RoaXMuZXNjYXBlRmllbGQoam9pbi5qb2luQWxpYXMpfWAsXG4gICAgICAgICAgICBgIE9OICgke3N0YXRlbWVudHMuam9pbignIE9SICcpfWAsXG4gICAgICAgICAgICBmaWx0ZXJDbGF1c2UgPyBgIEFORCAke2ZpbHRlckNsYXVzZX1gIDogJycsXG4gICAgICAgICAgICAnKSdcbiAgICAgICAgICBdLmpvaW4oJycpO1xuXG4gICAgICAgIH0pLmpvaW4oJycpXG5cbiAgICAgIH0pLmpvaW4oJycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVHcm91cEJ5Q2xhdXNlKHRhYmxlOiBzdHJpbmcsIGdyb3VwQnlBcnJheTogYW55KSB7XG5cbiAgICByZXR1cm4gIWdyb3VwQnlBcnJheS5sZW5ndGggPyAnJyA6ICcgR1JPVVAgQlkgJyArIGdyb3VwQnlBcnJheS5tYXAoKHY6IGFueSkgPT4ge1xuICAgICAgbGV0IGNvbHVtbnMgPSB2LmNvbHVtbk5hbWVzLm1hcCgoY29sdW1uOiBhbnkpID0+IGAke3RoaXMuZXNjYXBlRmllbGQodGFibGUpfS4ke3RoaXMuZXNjYXBlRmllbGQoY29sdW1uKX1gKTtcbiAgICAgIHJldHVybiB2LnRyYW5zZm9ybWF0aW9uLmFwcGx5KG51bGwsIGNvbHVtbnMpO1xuICAgIH0pLmpvaW4oJywgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUxpbWl0Q2xhdXNlKGxpbWl0T2JqOiBhbnkpIHtcblxuICAgIHJldHVybiAoIWxpbWl0T2JqKSA/ICcnIDogW1xuICAgICAgJyBMSU1JVCAnLFxuICAgICAgbGltaXRPYmoub2Zmc2V0LFxuICAgICAgJywgJyxcbiAgICAgIGxpbWl0T2JqLmNvdW50XG4gICAgXS5qb2luKCcnKTtcblxuICB9XG5cbiAgcHVibGljIGFnZ3JlZ2F0ZShhZ2dyZWdhdG9yOiBhbnkpIHtcblxuICAgIHJldHVybiB0eXBlb2YgYWdncmVnYXRvciA9PT0gJ2Z1bmN0aW9uJyA/IGFnZ3JlZ2F0b3IgOiAoXG4gICAgICAodGhpcy5hZ2dyZWdhdGVzLmhhc093blByb3BlcnR5KGFnZ3JlZ2F0b3IpID9cbiAgICAgICAgdGhpcy5hZ2dyZWdhdGVzW2FnZ3JlZ2F0b3JdIDpcbiAgICAgICAgdGhpcy5hZ2dyZWdhdGVzW3RoaXMuZGVmYXVsdEFnZ3JlZ2F0ZV0pXG4gICAgKTtcblxuICB9XG5cbn1cblxuU1FMQWRhcHRlci5wcm90b3R5cGUudHlwZVByb3BlcnRpZXMgPSBbXG4gICdsZW5ndGgnLFxuICAnbnVsbGFibGUnLFxuICAndW5pcXVlJyxcbiAgJ3ByaW1hcnlfa2V5JyxcbiAgJ2F1dG9faW5jcmVtZW50JyxcbiAgJ2FycmF5JyxcbiAgJ2RlZmF1bHRWYWx1ZSdcbl07XG5cblNRTEFkYXB0ZXIucHJvdG90eXBlLnR5cGVQcm9wZXJ0eURlZmF1bHRzID0ge1xuICBsZW5ndGg6IG51bGwsXG4gIG51bGxhYmxlOiB0cnVlLFxuICB1bmlxdWU6IGZhbHNlLFxuICBwcmltYXJ5X2tleTogZmFsc2UsXG4gIGF1dG9faW5jcmVtZW50OiBmYWxzZSxcbiAgYXJyYXk6IGZhbHNlLFxuICBkZWZhdWx0VmFsdWU6IG51bGxcbn07XG5cblNRTEFkYXB0ZXIucHJvdG90eXBlLmluZGV4VHlwZXMgPSBbXTtcblxuU1FMQWRhcHRlci5wcm90b3R5cGUuY29tcGFyYXRvcnMgPSB7XG4gIGlzOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9ID0gX19WQVJfX2AsXG4gIG5vdDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSA8PiBfX1ZBUl9fYCxcbiAgbHQ6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gPCBfX1ZBUl9fYCxcbiAgbHRlOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IDw9IF9fVkFSX19gLFxuICBndDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSA+IF9fVkFSX19gLFxuICBndGU6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gPj0gX19WQVJfX2AsXG4gIGNvbnRhaW5zOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IExJS0UgJyUnIHx8IF9fVkFSX18gfHwgJyUnYCxcbiAgaWNvbnRhaW5zOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElMSUtFICclJyB8fCBfX1ZBUl9fIHx8ICclJ2AsXG4gIHN0YXJ0c3dpdGg6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSBfX1ZBUl9fIHx8ICclJ2AsXG4gIGlzdGFydHN3aXRoOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElMSUtFIF9fVkFSX18gfHwgJyUnYCxcbiAgZW5kc3dpdGg6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSAnJScgfHwgX19WQVJfX2AsXG4gIGllbmRzd2l0aDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSBJTElLRSAnJScgfHwgX19WQVJfX2AsXG4gIGxpa2U6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSBfX1ZBUl9fYCxcbiAgaWxpa2U6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gSUxJS0UgX19WQVJfX2AsXG4gIGlzX251bGw6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gSVMgTlVMTGAsXG4gIG5vdF9udWxsOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElTIE5PVCBOVUxMYCxcbiAgaW46IChmaWVsZDogc3RyaW5nKSA9PiBgQVJSQVlbJHtmaWVsZH1dIDxAIF9fVkFSX19gLFxuICBub3RfaW46IChmaWVsZDogc3RyaW5nKSA9PiBgTk9UIChBUlJBWVske2ZpZWxkfV0gPEAgX19WQVJfXylgXG59O1xuXG5TUUxBZGFwdGVyLnByb3RvdHlwZS5jb21wYXJhdG9ySWdub3Jlc1ZhbHVlID0ge1xuICBpc19udWxsOiB0cnVlLFxuICBub3RfbnVsbDogdHJ1ZVxufTtcblxuU1FMQWRhcHRlci5wcm90b3R5cGUuZG9jdW1lbnRUeXBlcyA9IFtdO1xuXG5TUUxBZGFwdGVyLnByb3RvdHlwZS5hZ2dyZWdhdGVzID0ge1xuICBzdW06IChmaWVsZDogc3RyaW5nKSA9PiBgU1VNKCR7ZmllbGR9KWAsXG4gIGF2ZzogKGZpZWxkOiBzdHJpbmcpID0+IGBBVkcoJHtmaWVsZH0pYCxcbiAgbWluOiAoZmllbGQ6IHN0cmluZykgPT4gYE1JTigke2ZpZWxkfSlgLFxuICBtYXg6IChmaWVsZDogc3RyaW5nKSA9PiBgTUFYKCR7ZmllbGR9KWAsXG4gIGNvdW50OiAoZmllbGQ6IHN0cmluZykgPT4gYENPVU5UKCR7ZmllbGR9KWAsXG4gIGRpc3RpbmN0OiAoZmllbGQ6IHN0cmluZykgPT4gYENPVU5UKERJU1RJTkNUKCR7ZmllbGR9KSlgLFxuICBub25lOiAoZmllbGQ6IHN0cmluZykgPT4gYE5VTExgLFxuICBtaW5fZGF0ZTogKGZpZWxkOiBzdHJpbmcpID0+IGBNSU4oREFURV9UUlVOQygnZGF5JywgJHtmaWVsZH0pKWAsXG4gIG1heF9kYXRlOiAoZmllbGQ6IHN0cmluZykgPT4gYE1BWChEQVRFX1RSVU5DKCdkYXknLCAke2ZpZWxkfSkpYCxcbiAgY291bnRfdHJ1ZTogKGZpZWxkOiBzdHJpbmcpID0+IGBDT1VOVChDQVNFIFdIRU4gJHtmaWVsZH0gVEhFTiAxIEVMU0UgTlVMTCBFTkQpYFxufTtcblxuU1FMQWRhcHRlci5wcm90b3R5cGUuZGVmYXVsdEFnZ3JlZ2F0ZSA9ICdub25lJztcblxuU1FMQWRhcHRlci5wcm90b3R5cGUudHlwZXMgPSB7fTtcblNRTEFkYXB0ZXIucHJvdG90eXBlLnNhbml0aXplVHlwZSA9IHt9O1xuU1FMQWRhcHRlci5wcm90b3R5cGUuZXNjYXBlRmllbGRDaGFyYWN0ZXIgPSAnJztcblNRTEFkYXB0ZXIucHJvdG90eXBlLmNvbHVtbkRlcHRoRGVsaW1pdGVyID0gJyc7XG5TUUxBZGFwdGVyLnByb3RvdHlwZS53aGVyZURlcHRoRGVsaW1pdGVyID0gJyc7XG5cblNRTEFkYXB0ZXIucHJvdG90eXBlLnN1cHBvcnRzRm9yZWlnbktleSA9IGZhbHNlO1xuXG5leHBvcnQgZGVmYXVsdCBTUUxBZGFwdGVyO1xuIl19
