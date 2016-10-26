"use strict";
const inflect = require('i')();
const sql_adapter_js_1 = require('../sql_adapter.js');
const utilities_1 = require('../../utilities');
const async = require('async');
const pg = require('pg');
pg.defaults.poolSize = 8;
class PostgresAdapter extends sql_adapter_js_1.default {
    constructor(db, cfg) {
        super();
        cfg = cfg.connectionString ? this.parseConnectionString(cfg.connectionString) : cfg;
        this.db = db;
        this._config = cfg;
    }
    close() {
        pg.end();
    }
    query(query, params, callback) {
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
            client.query(query, params, (function () {
                log(query, params, new Date().valueOf() - start);
                complete();
                callback.apply(this, arguments);
            }.bind(this)));
        });
        return true;
    }
    transaction(preparedArray, callback) {
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
            callback = () => { };
        }
        const start = new Date().valueOf();
        pg.connect(this._config, (err, client, complete) => {
            if (err) {
                this.db.error(err.message);
                callback(err);
                return complete();
            }
            let queries = preparedArray.map((queryData) => {
                const query = queryData[0];
                const params = queryData[1] || [];
                return (callback) => {
                    this.db.log(query, params, new Date().valueOf() - start);
                    client.query(queryData[0], queryData[1], callback);
                };
            });
            queries = [].concat((callback) => {
                client.query('BEGIN', callback);
            }, queries);
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
                        }
                        else {
                            this.db.info('Rollback complete!');
                            this.db.info('Transaction complete!');
                            complete();
                            callback(txnErr);
                        }
                    });
                }
                else {
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
    drop(databaseName, callback) {
        this.query(this.generateDropDatabaseQuery(databaseName), [], (err, result) => {
            if (err) {
                return callback(err);
            }
            this.db.info(`Dropped database "${databaseName}"`);
            callback(null);
        });
    }
    create(databaseName, callback) {
        this.query(this.generateCreateDatabaseQuery(databaseName), [], (err, result) => {
            if (err) {
                return callback(err);
            }
            this.db.info(`Created empty database "${databaseName}"`);
            callback(null);
        });
    }
    /* generate functions */
    generateArray(arr) {
        return '{' + arr.join(',') + '}';
    }
    generateConnectionString(host, port, database, user, password) {
        if (!host || !port || !database) {
            return '';
        }
        return 'postgres://' + user + ':' + password + '@' + host + ':' + port + '/' + database;
    }
    parseConnectionString(str) {
        const cfg = {
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
    generateClearDatabaseQuery() {
        return [
            'DROP SCHEMA public CASCADE',
            'CREATE SCHEMA public'
        ].join(';');
    }
    generateCreateDatabaseQuery(name) {
        return [
            'CREATE DATABASE',
            this.escapeField(name)
        ].join(' ');
    }
    generateDropDatabaseQuery(name) {
        return [
            'DROP DATABASE IF EXISTS',
            this.escapeField(name)
        ].join(' ');
    }
    generateColumn(columnName, columnType, columnProperties) {
        return [
            this.escapeField(columnName),
            columnType,
            columnProperties.array ? 'ARRAY' : '',
            (columnProperties.primary_key || !columnProperties.nullable) ? 'NOT NULL' : ''
        ].filter((v) => { return !!v; }).join(' ');
    }
    generateAlterColumn(columnName, columnType, columnProperties) {
        return [
            'ALTER COLUMN',
            this.escapeField(columnName),
            'TYPE',
            columnType,
            columnProperties.array ? 'ARRAY' : ''
        ].filter((v) => { return !!v; }).join(' ');
    }
    generateAlterColumnSetNull(columnName, columnType, columnProperties) {
        return [
            'ALTER COLUMN',
            this.escapeField(columnName),
            (columnProperties.primary_key || !columnProperties.nullable) ? 'SET' : 'DROP',
            'NOT NULL'
        ].join(' ');
    }
    generateAlterColumnDropDefault(columnName, columnType, columnProperties) {
        return [
            'ALTER COLUMN',
            this.escapeField(columnName),
            'DROP DEFAULT'
        ].join(' ');
    }
    generateAlterColumnSetDefaultSeq(columnName, seqName) {
        return [
            'ALTER COLUMN ',
            this.escapeField(columnName),
            ' SET DEFAULT nextval(\'',
            seqName,
            '\')'
        ].join('');
    }
    generateIndex(table, columnName) {
        return this.generateConstraint(table, columnName, 'index');
    }
    generateConstraint(table, columnName, suffix) {
        return this.escapeField([table, columnName, suffix].join('_'));
    }
    generatePrimaryKey(table, columnName) {
        return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'pk'), ' PRIMARY KEY(', this.escapeField(columnName), ')'].join('');
    }
    generateUniqueKey(table, columnName) {
        return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'unique'), ' UNIQUE(', this.escapeField(columnName), ')'].join('');
    }
    generateAlterTableRename(table, newTableName, columns) {
        return [
            [
                'ALTER TABLE',
                this.escapeField(table),
                'RENAME TO',
                this.escapeField(newTableName)
            ].join(' ')
        ].concat(this.getPrimaryKeys(columns).map((columnData) => {
            return [
                'ALTER TABLE',
                this.escapeField(newTableName),
                'RENAME CONSTRAINT',
                this.generateConstraint(table, columnData.name, 'pk'),
                'TO',
                this.generateConstraint(newTableName, columnData.name, 'pk')
            ].join(' ');
        }), this.getUniqueKeys(columns).map((columnData) => {
            return [
                'ALTER TABLE',
                this.escapeField(newTableName),
                'RENAME CONSTRAINT',
                this.generateConstraint(table, columnData.name, 'unique'),
                'TO',
                this.generateConstraint(newTableName, columnData.name, 'unique')
            ].join(' ');
        }), this.getAutoIncrementKeys(columns).map((columnData) => {
            return this.generateRenameSequenceQuery(table, columnData.name, newTableName, columnData.name);
        })).join(';');
    }
    generateAlterTableColumnType(table, columnName, columnType, columnProperties) {
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
    generateAlterTableAddPrimaryKey(table, columnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'ADD',
            this.generatePrimaryKey(table, columnName)
        ].join(' ');
    }
    generateAlterTableDropPrimaryKey(table, columnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'DROP CONSTRAINT IF EXISTS',
            this.generateConstraint(table, columnName, 'pk')
        ].join(' ');
    }
    generateAlterTableAddUniqueKey(table, columnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'ADD',
            this.generateUniqueKey(table, columnName)
        ].join(' ');
    }
    generateAlterTableDropUniqueKey(table, columnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'DROP CONSTRAINT IF EXISTS',
            this.generateConstraint(table, columnName, 'unique')
        ].join(' ');
    }
    generateAlterTableAddColumn(table, columnName, columnType, columnProperties) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'ADD COLUMN',
            this.generateColumn(columnName, columnType, columnProperties)
        ].join(' ');
    }
    generateAlterTableDropColumn(table, columnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'DROP COLUMN IF EXISTS',
            this.escapeField(columnName)
        ].join(' ');
    }
    generateAlterTableRenameColumn(table, columnName, newColumnName) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'RENAME COLUMN',
            this.escapeField(columnName),
            'TO',
            this.escapeField(newColumnName)
        ].join(' ');
    }
    generateCreateIndex(table, columnName, indexType) {
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
    generateDropIndex(table, columnName) {
        return [
            'DROP INDEX', this.generateIndex(table, columnName)
        ].join(' ');
    }
    generateSequence(table, columnName) {
        return this.generateConstraint(table, columnName, 'seq');
    }
    generateCreateSequenceQuery(table, columnName) {
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
    generateSimpleForeignKeyQuery(table, referenceTable) {
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
    generateDropSimpleForeignKeyQuery(table, referenceTable) {
        return [
            'ALTER TABLE',
            this.escapeField(table),
            'DROP CONSTRAINT IF EXISTS',
            `${this.generateConstraint(table, referenceTable, 'id_fk')}`
        ].join(' ');
    }
    generateRenameSequenceQuery(table, columnName, newTable, newColumnName) {
        return [
            'ALTER SEQUENCE',
            this.generateSequence(table, columnName),
            'RENAME TO',
            this.generateSequence(newTable, newColumnName)
        ].join(' ');
    }
    generateDropSequenceQuery(table, columnName) {
        return [
            'DROP SEQUENCE IF EXISTS',
            this.generateSequence(table, columnName)
        ].join(' ');
    }
    generateCreateTableQuery(table, columns) {
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
    generateLimitClause(limitObj) {
        return (!limitObj) ? '' :
            (limitObj.count ? ` LIMIT ${limitObj.count}` : '') +
                (limitObj.offset ? ` OFFSET ${limitObj.offset}` : '');
    }
    preprocessWhereObj(table, whereObj) {
        const whereObjArray = [];
        whereObj.forEach(where => {
            if (utilities_1.default.isObject(where.value)) {
                Object.keys(where.value).map((k) => {
                    whereObjArray.push(Object.assign({}, where, {
                        columnName: `${where.columnName}${this.whereDepthDelimiter}'${k}'`,
                        value: where.value[k]
                    }));
                });
            }
            else {
                whereObjArray.push(where);
            }
        });
        return whereObjArray;
    }
}
PostgresAdapter.prototype.sanitizeType = {
    boolean: (v) => {
        return ['f', 't'][v | 0];
    },
    json: (v) => {
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
    not_in: (field) => `NOT (ARRAY[${field}] <@ __VAR__)`,
    json: (field, value) => {
        return `${field.replace(/"/g, "")} = __VAR__`;
    },
    jsoncontains: (field) => {
        return `${field.replace(/"/g, "")} ? __VAR__`;
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PostgresAdapter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImRiL2FkYXB0ZXJzL3Bvc3RncmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUMvQixpQ0FBdUMsbUJBQW1CLENBQUMsQ0FBQTtBQUczRCw0QkFBc0IsaUJBQWlCLENBQUMsQ0FBQTtBQUV4QyxNQUFPLEtBQUssV0FBVyxPQUFPLENBQUMsQ0FBQztBQUVoQyxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUNuQixFQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFZaEMsOEJBQThCLHdCQUFVO0lBS3RDLFlBQVksRUFBWSxFQUFFLEdBQVk7UUFFcEMsT0FBTyxDQUFDO1FBRVIsR0FBRyxHQUFHLEdBQUcsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsR0FBRyxDQUFDO1FBRXBGLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUM7SUFDckIsQ0FBQztJQUVNLEtBQUs7UUFFVixFQUFFLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFWCxDQUFDO0lBRU0sS0FBSyxDQUFDLEtBQWEsRUFBRSxNQUFXLEVBQUUsUUFBa0I7UUFFekQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxPQUFPLFFBQVEsS0FB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QUFPO0tBQ2hCO0NBQ0YsQ0FBQztBQUVGLGVBQWUsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO0FBRXBEO2tCQUFlLGVBQWUsQ0FBQyIsImZpbGUiOiJkYi9hZGFwdGVycy9wb3N0Z3Jlcy5qcyIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGluZmxlY3QgPSByZXF1aXJlKCdpJykoKTtcbmltcG9ydCBTUUxBZGFwdGVyLCB7SVdoZXJlT2JqZWN0fSBmcm9tICcuLi9zcWxfYWRhcHRlci5qcyc7XG5pbXBvcnQgRGF0YWJhc2UgZnJvbSAnLi4vZGF0YWJhc2UnO1xuaW1wb3J0IHtJQ29sdW1uUHJvcGVydGllc30gZnJvbSAnLi4vLi4vdHlwZXMnO1xuaW1wb3J0IHV0aWxpdGllcyBmcm9tICcuLi8uLi91dGlsaXRpZXMnO1xuXG5pbXBvcnQgYXN5bmMgPSByZXF1aXJlKCdhc3luYycpO1xuXG5pbXBvcnQgKiBhcyBwZyBmcm9tICdwZyc7XG4oPGFueT5wZykuZGVmYXVsdHMucG9vbFNpemUgPSA4O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWcge1xuICBjb25uZWN0aW9uU3RyaW5nPzogc3RyaW5nO1xuICBob3N0Pzogc3RyaW5nO1xuICBkYXRhYmFzZT86IHN0cmluZztcbiAgdXNlcj86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIHBvcnQ/OiBudW1iZXI7XG4gIHNzbD86IGJvb2xlYW47XG59XG5cbmNsYXNzIFBvc3RncmVzQWRhcHRlciBleHRlbmRzIFNRTEFkYXB0ZXIge1xuXG4gIHB1YmxpYyBkYjogRGF0YWJhc2U7XG4gIHByaXZhdGUgX2NvbmZpZzogSUNvbmZpZztcblxuICBjb25zdHJ1Y3RvcihkYjogRGF0YWJhc2UsIGNmZzogSUNvbmZpZykge1xuXG4gICAgc3VwZXIoKTtcblxuICAgIGNmZyA9IGNmZy5jb25uZWN0aW9uU3RyaW5nID8gdGhpcy5wYXJzZUNvbm5lY3Rpb25TdHJpbmcoY2ZnLmNvbm5lY3Rpb25TdHJpbmcpIDogY2ZnO1xuXG4gICAgdGhpcy5kYiA9IGRiO1xuICAgIHRoaXMuX2NvbmZpZyA9IGNmZztcbiAgfVxuXG4gIHB1YmxpYyBjbG9zZSgpIHtcblxuICAgIHBnLmVuZCgpO1xuXG4gIH1cblxuICBwdWJsaWMgcXVlcnkocXVlcnk6IHN0cmluZywgcGFyYW1zOiBhbnksIGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJy5xdWVyeSByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xuICAgIH1cblxuICAgIGlmICghKHBhcmFtcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdwYXJhbXMgbXVzdCBiZSBhIHZhbGlkIGFycmF5Jyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdGFydCA9IG5ldyBEYXRlKCkudmFsdWVPZigpO1xuICAgIGNvbnN0IGxvZyA9IHRoaXMuZGIubG9nLmJpbmQodGhpcy5kYik7XG5cbiAgICBwZy5jb25uZWN0KHRoaXMuX2NvbmZpZywgKGVyciwgY2xpZW50LCBjb21wbGV0ZSkgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHRoaXMuZGIuZXJyb3IoZXJyLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm4gY29tcGxldGUoKTtcbiAgICAgIH1cblxuICAgICAgY2xpZW50LnF1ZXJ5KHF1ZXJ5LCBwYXJhbXMsIChmdW5jdGlvbigpIHtcblxuICAgICAgICBsb2cocXVlcnksIHBhcmFtcywgbmV3IERhdGUoKS52YWx1ZU9mKCkgLSBzdGFydCk7XG4gICAgICAgIGNvbXBsZXRlKCk7XG4gICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cbiAgICAgIH0uYmluZCh0aGlzKSkpO1xuXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9XG5cbiAgcHVibGljIHRyYW5zYWN0aW9uKHByZXBhcmVkQXJyYXk6IGFueSwgY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cbiAgICBpZiAoIXByZXBhcmVkQXJyYXkubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgZ2l2ZSB2YWxpZCBhcnJheSBvZiBzdGF0ZW1lbnRzICh3aXRoIG9yIHdpdGhvdXQgcGFyYW1ldGVycyknKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHByZXBhcmVkQXJyYXkgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwcmVwYXJlZEFycmF5ID0gcHJlcGFyZWRBcnJheS5zcGxpdCgnOycpLmZpbHRlcigodikgPT4ge1xuICAgICAgICByZXR1cm4gISF2O1xuICAgICAgfSkubWFwKCh2KSA9PiB7XG4gICAgICAgIHJldHVybiBbdl07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9ICgpID0+IHt9O1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0ID0gbmV3IERhdGUoKS52YWx1ZU9mKCk7XG5cbiAgICBwZy5jb25uZWN0KHRoaXMuX2NvbmZpZywgKGVyciwgY2xpZW50LCBjb21wbGV0ZSkgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHRoaXMuZGIuZXJyb3IoZXJyLm1lc3NhZ2UpO1xuICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICByZXR1cm4gY29tcGxldGUoKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHF1ZXJpZXMgPSBwcmVwYXJlZEFycmF5Lm1hcCgocXVlcnlEYXRhOiBhbnkpID0+IHtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHF1ZXJ5RGF0YVswXTtcbiAgICAgICAgY29uc3QgcGFyYW1zID0gcXVlcnlEYXRhWzFdIHx8IFtdO1xuXG4gICAgICAgIHJldHVybiAoY2FsbGJhY2s6IChlcnI6IEVycm9yLCByZXN1bHQ6IHBnLlF1ZXJ5UmVzdWx0KSA9PiB2b2lkKSA9PiB7XG4gICAgICAgICAgdGhpcy5kYi5sb2cocXVlcnksIHBhcmFtcywgbmV3IERhdGUoKS52YWx1ZU9mKCkgLSBzdGFydCk7XG4gICAgICAgICAgY2xpZW50LnF1ZXJ5KHF1ZXJ5RGF0YVswXSwgcXVlcnlEYXRhWzFdLCBjYWxsYmFjayk7XG4gICAgICAgIH07XG5cbiAgICAgIH0pO1xuXG4gICAgICBxdWVyaWVzID0gKDxhbnlbXT5bXSkuY29uY2F0KFxuICAgICAgICAoY2FsbGJhY2s6IGFueSkgPT4ge1xuICAgICAgICAgIGNsaWVudC5xdWVyeSgnQkVHSU4nLCBjYWxsYmFjayk7XG4gICAgICAgIH0sXG4gICAgICAgIHF1ZXJpZXNcbiAgICAgICk7XG5cbiAgICAgIHRoaXMuZGIuaW5mbygnVHJhbnNhY3Rpb24gc3RhcnRlZC4uLicpO1xuXG4gICAgICBhc3luYy5zZXJpZXMocXVlcmllcywgKHR4bkVyciwgcmVzdWx0cykgPT4ge1xuXG4gICAgICAgIGlmICh0eG5FcnIpIHtcblxuICAgICAgICAgIHRoaXMuZGIuZXJyb3IodHhuRXJyLm1lc3NhZ2UpO1xuICAgICAgICAgIHRoaXMuZGIuaW5mbygnUm9sbGJhY2sgc3RhcnRlZC4uLicpO1xuXG4gICAgICAgICAgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycsIChlcnIpID0+IHtcblxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICB0aGlzLmRiLmVycm9yKGBSb2xsYmFjayBmYWlsZWQgLSAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgICB0aGlzLmRiLmluZm8oJ1RyYW5zYWN0aW9uIGNvbXBsZXRlIScpO1xuICAgICAgICAgICAgICBjb21wbGV0ZSgpO1xuICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGhpcy5kYi5pbmZvKCdSb2xsYmFjayBjb21wbGV0ZSEnKTtcbiAgICAgICAgICAgICAgdGhpcy5kYi5pbmZvKCdUcmFuc2FjdGlvbiBjb21wbGV0ZSEnKTtcbiAgICAgICAgICAgICAgY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgY2FsbGJhY2sodHhuRXJyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICB0aGlzLmRiLmluZm8oJ0NvbW1pdCBzdGFydGVkLi4uJyk7XG5cbiAgICAgICAgICBjbGllbnQucXVlcnkoJ0NPTU1JVCcsIChlcnIpID0+IHtcblxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICB0aGlzLmRiLmVycm9yKGBDb21taXQgZmFpbGVkIC0gJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgICAgICAgdGhpcy5kYi5pbmZvKCdUcmFuc2FjdGlvbiBjb21wbGV0ZSEnKTtcbiAgICAgICAgICAgICAgY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmRiLmluZm8oJ0NvbW1pdCBjb21wbGV0ZSEnKTtcbiAgICAgICAgICAgIHRoaXMuZGIuaW5mbygnVHJhbnNhY3Rpb24gY29tcGxldGUhJyk7XG4gICAgICAgICAgICBjb21wbGV0ZSgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XG5cbiAgICAgICAgICB9KTtcblxuICAgICAgICB9XG5cbiAgICAgIH0pO1xuXG4gICAgfSk7XG5cbiAgfVxuXG4gIC8qIENvbW1hbmQgZnVuY3Rpb25zLi4uICovXG5cbiAgcHVibGljIGRyb3AoZGF0YWJhc2VOYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgdGhpcy5xdWVyeSh0aGlzLmdlbmVyYXRlRHJvcERhdGFiYXNlUXVlcnkoZGF0YWJhc2VOYW1lKSwgW10sIChlcnI6IEVycm9yLCByZXN1bHQ6IGFueSkgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmRiLmluZm8oYERyb3BwZWQgZGF0YWJhc2UgXCIke2RhdGFiYXNlTmFtZX1cImApO1xuICAgICAgY2FsbGJhY2sobnVsbCk7XG5cbiAgICB9KTtcblxuICB9XG5cbiAgcHVibGljIGNyZWF0ZShkYXRhYmFzZU5hbWU6IHN0cmluZywgY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cbiAgICB0aGlzLnF1ZXJ5KHRoaXMuZ2VuZXJhdGVDcmVhdGVEYXRhYmFzZVF1ZXJ5KGRhdGFiYXNlTmFtZSksIFtdLCAoZXJyOiBFcnJvciwgcmVzdWx0OiBhbnkpID0+IHtcblxuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5kYi5pbmZvKGBDcmVhdGVkIGVtcHR5IGRhdGFiYXNlIFwiJHtkYXRhYmFzZU5hbWV9XCJgKTtcbiAgICAgIGNhbGxiYWNrKG51bGwpO1xuXG4gICAgfSk7XG5cbiAgfVxuXG4gIC8qIGdlbmVyYXRlIGZ1bmN0aW9ucyAqL1xuXG4gIHB1YmxpYyBnZW5lcmF0ZUFycmF5KGFycjogYW55W10pIHtcblxuICAgIHJldHVybiAneycgKyBhcnIuam9pbignLCcpICsgJ30nO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDb25uZWN0aW9uU3RyaW5nKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFiYXNlOiBzdHJpbmcsIHVzZXI6IHN0cmluZywgcGFzc3dvcmQ6IHN0cmluZykge1xuXG4gICAgaWYgKCFob3N0IHx8ICFwb3J0IHx8ICFkYXRhYmFzZSkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIHJldHVybiAncG9zdGdyZXM6Ly8nICsgdXNlciArICc6JyArIHBhc3N3b3JkICsgJ0AnICsgaG9zdCArICc6JyArIHBvcnQgKyAnLycgKyBkYXRhYmFzZTtcblxuICB9XG5cbiAgcHVibGljIHBhcnNlQ29ubmVjdGlvblN0cmluZyhzdHI6IHN0cmluZykge1xuXG4gICAgY29uc3QgY2ZnOiBJQ29uZmlnID0ge1xuICAgICAgaG9zdDogJycsXG4gICAgICBkYXRhYmFzZTogJycsXG4gICAgICB1c2VyOiAnJyxcbiAgICAgIHBhc3N3b3JkOiAnJyxcbiAgICAgIHBvcnQ6IDU0MzIsXG4gICAgICBzc2w6IGZhbHNlXG4gICAgfTtcblxuICAgIGNvbnN0IG1hdGNoID0gc3RyLm1hdGNoKC9ecG9zdGdyZXM6XFwvXFwvKFtBLVphLXowLTlfXSspKD86XFw6KFtBLVphLXowLTlfXFwtXSspKT9AKFtBLVphLXowLTlfXFwuXFwtXSspOihcXGQrKVxcLyhbQS1aYS16MC05X10rKSQvKTtcblxuICAgIGlmIChtYXRjaCkge1xuICAgICAgY2ZnLnVzZXIgPSBtYXRjaFsxXTtcbiAgICAgIGNmZy5wYXNzd29yZCA9IG1hdGNoWzJdO1xuICAgICAgY2ZnLmhvc3QgPSBtYXRjaFszXTtcbiAgICAgIGNmZy5wb3J0ID0gcGFyc2VJbnQobWF0Y2hbNF0sIDEwKTtcbiAgICAgIGNmZy5kYXRhYmFzZSA9IG1hdGNoWzVdO1xuICAgIH1cblxuICAgIHJldHVybiBjZmc7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUNsZWFyRGF0YWJhc2VRdWVyeSgpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnRFJPUCBTQ0hFTUEgcHVibGljIENBU0NBREUnLFxuICAgICAgJ0NSRUFURSBTQ0hFTUEgcHVibGljJ1xuICAgIF0uam9pbignOycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDcmVhdGVEYXRhYmFzZVF1ZXJ5KG5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdDUkVBVEUgREFUQUJBU0UnLFxuICAgICAgdGhpcy5lc2NhcGVGaWVsZChuYW1lKVxuICAgIF0uam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVEcm9wRGF0YWJhc2VRdWVyeShuYW1lOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnRFJPUCBEQVRBQkFTRSBJRiBFWElTVFMnLFxuICAgICAgdGhpcy5lc2NhcGVGaWVsZChuYW1lKVxuICAgIF0uam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDb2x1bW4oY29sdW1uTmFtZTogc3RyaW5nLCBjb2x1bW5UeXBlOiBzdHJpbmcsIGNvbHVtblByb3BlcnRpZXM6IElDb2x1bW5Qcm9wZXJ0aWVzKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKSxcbiAgICAgIGNvbHVtblR5cGUsXG4gICAgICBjb2x1bW5Qcm9wZXJ0aWVzLmFycmF5ID8gJ0FSUkFZJyA6ICcnLFxuICAgICAgKGNvbHVtblByb3BlcnRpZXMucHJpbWFyeV9rZXkgfHwgIWNvbHVtblByb3BlcnRpZXMubnVsbGFibGUpID8gJ05PVCBOVUxMJyA6ICcnXG4gICAgXS5maWx0ZXIoKHYpID0+IHsgcmV0dXJuICEhdjsgfSkuam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbHRlckNvbHVtbihjb2x1bW5OYW1lOiBzdHJpbmcsIGNvbHVtblR5cGU6IHN0cmluZywgY29sdW1uUHJvcGVydGllczogSUNvbHVtblByb3BlcnRpZXMpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnQUxURVIgQ09MVU1OJyxcbiAgICAgIHRoaXMuZXNjYXBlRmllbGQoY29sdW1uTmFtZSksXG4gICAgICAnVFlQRScsXG4gICAgICBjb2x1bW5UeXBlLFxuICAgICAgY29sdW1uUHJvcGVydGllcy5hcnJheSA/ICdBUlJBWScgOiAnJ1xuICAgIF0uZmlsdGVyKCh2KSA9PiB7IHJldHVybiAhIXY7IH0pLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJDb2x1bW5TZXROdWxsKGNvbHVtbk5hbWU6IHN0cmluZywgY29sdW1uVHlwZTogc3RyaW5nLCBjb2x1bW5Qcm9wZXJ0aWVzOiBJQ29sdW1uUHJvcGVydGllcykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdBTFRFUiBDT0xVTU4nLFxuICAgICAgdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKSxcbiAgICAgIChjb2x1bW5Qcm9wZXJ0aWVzLnByaW1hcnlfa2V5IHx8ICFjb2x1bW5Qcm9wZXJ0aWVzLm51bGxhYmxlKSA/ICdTRVQnIDogJ0RST1AnLFxuICAgICAgJ05PVCBOVUxMJ1xuICAgIF0uam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbHRlckNvbHVtbkRyb3BEZWZhdWx0KGNvbHVtbk5hbWU6IHN0cmluZywgY29sdW1uVHlwZT86IHN0cmluZywgY29sdW1uUHJvcGVydGllcz86IElDb2x1bW5Qcm9wZXJ0aWVzKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgJ0FMVEVSIENPTFVNTicsXG4gICAgICB0aGlzLmVzY2FwZUZpZWxkKGNvbHVtbk5hbWUpLFxuICAgICAgJ0RST1AgREVGQVVMVCdcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJDb2x1bW5TZXREZWZhdWx0U2VxKGNvbHVtbk5hbWU6IHN0cmluZywgc2VxTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICdBTFRFUiBDT0xVTU4gJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKSxcbiAgICAgICcgU0VUIERFRkFVTFQgbmV4dHZhbChcXCcnLFxuICAgICAgICBzZXFOYW1lLFxuICAgICAgJ1xcJyknXG4gICAgXS5qb2luKCcnKTtcbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUluZGV4KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCBjb2x1bW5OYW1lLCAnaW5kZXgnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQ29uc3RyYWludCh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZXNjYXBlRmllbGQoW3RhYmxlLCBjb2x1bW5OYW1lLCBzdWZmaXhdLmpvaW4oJ18nKSk7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVQcmltYXJ5S2V5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFsnQ09OU1RSQUlOVCAnLCB0aGlzLmdlbmVyYXRlQ29uc3RyYWludCh0YWJsZSwgY29sdW1uTmFtZSwgJ3BrJyksICcgUFJJTUFSWSBLRVkoJywgdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKSwgJyknXS5qb2luKCcnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlVW5pcXVlS2V5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFsnQ09OU1RSQUlOVCAnLCB0aGlzLmdlbmVyYXRlQ29uc3RyYWludCh0YWJsZSwgY29sdW1uTmFtZSwgJ3VuaXF1ZScpLCAnIFVOSVFVRSgnLCB0aGlzLmVzY2FwZUZpZWxkKGNvbHVtbk5hbWUpLCAnKSddLmpvaW4oJycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbHRlclRhYmxlUmVuYW1lKHRhYmxlOiBzdHJpbmcsIG5ld1RhYmxlTmFtZTogc3RyaW5nLCBjb2x1bW5zOiBhbnkpIHtcblxuICAgIHJldHVybiBbXG4gICAgICBbXG4gICAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAgICdSRU5BTUUgVE8nLFxuICAgICAgICAgIHRoaXMuZXNjYXBlRmllbGQobmV3VGFibGVOYW1lKVxuICAgICAgXS5qb2luKCcgJylcbiAgICBdLmNvbmNhdChcbiAgICAgIHRoaXMuZ2V0UHJpbWFyeUtleXMoY29sdW1ucykubWFwKChjb2x1bW5EYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgICAgIHRoaXMuZXNjYXBlRmllbGQobmV3VGFibGVOYW1lKSxcbiAgICAgICAgICAnUkVOQU1FIENPTlNUUkFJTlQnLFxuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUNvbnN0cmFpbnQodGFibGUsIGNvbHVtbkRhdGEubmFtZSwgJ3BrJyksXG4gICAgICAgICAgJ1RPJyxcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGVDb25zdHJhaW50KG5ld1RhYmxlTmFtZSwgY29sdW1uRGF0YS5uYW1lLCAncGsnKVxuICAgICAgICBdLmpvaW4oJyAnKTtcbiAgICAgIH0pLFxuICAgICAgdGhpcy5nZXRVbmlxdWVLZXlzKGNvbHVtbnMpLm1hcCgoY29sdW1uRGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKG5ld1RhYmxlTmFtZSksXG4gICAgICAgICAgJ1JFTkFNRSBDT05TVFJBSU5UJyxcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCBjb2x1bW5EYXRhLm5hbWUsICd1bmlxdWUnKSxcbiAgICAgICAgICAnVE8nLFxuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUNvbnN0cmFpbnQobmV3VGFibGVOYW1lLCBjb2x1bW5EYXRhLm5hbWUsICd1bmlxdWUnKVxuICAgICAgICBdLmpvaW4oJyAnKTtcbiAgICAgIH0pLFxuICAgICAgdGhpcy5nZXRBdXRvSW5jcmVtZW50S2V5cyhjb2x1bW5zKS5tYXAoKGNvbHVtbkRhdGEpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVSZW5hbWVTZXF1ZW5jZVF1ZXJ5KHRhYmxlLCBjb2x1bW5EYXRhLm5hbWUsIG5ld1RhYmxlTmFtZSwgY29sdW1uRGF0YS5uYW1lKTtcbiAgICAgIH0pXG4gICAgKS5qb2luKCc7Jyk7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVBbHRlclRhYmxlQ29sdW1uVHlwZSh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtblR5cGU6IHN0cmluZywgY29sdW1uUHJvcGVydGllczogSUNvbHVtblByb3BlcnRpZXMpIHtcblxuICAgIGNvbnN0IHF1ZXJpZXMgPSBbXG4gICAgICBbXG4gICAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZUFsdGVyQ29sdW1uKGNvbHVtbk5hbWUsIGNvbHVtblR5cGUsIGNvbHVtblByb3BlcnRpZXMpXG4gICAgICBdLmpvaW4oJyAnKSxcbiAgICAgIFtcbiAgICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKSxcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlQWx0ZXJDb2x1bW5TZXROdWxsKGNvbHVtbk5hbWUsIGNvbHVtblR5cGUsIGNvbHVtblByb3BlcnRpZXMpXG4gICAgICBdLmpvaW4oJyAnKSxcbiAgICAgIFtcbiAgICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKSxcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlQWx0ZXJDb2x1bW5Ecm9wRGVmYXVsdChjb2x1bW5OYW1lKVxuICAgICAgXS5qb2luKCcgJyksXG4gICAgICB0aGlzLmdlbmVyYXRlRHJvcFNlcXVlbmNlUXVlcnkodGFibGUsIGNvbHVtbk5hbWUpXG4gICAgXTtcblxuICAgIGlmIChjb2x1bW5Qcm9wZXJ0aWVzLmF1dG9faW5jcmVtZW50KSB7XG4gICAgICBxdWVyaWVzLnB1c2godGhpcy5nZW5lcmF0ZUNyZWF0ZVNlcXVlbmNlUXVlcnkodGFibGUsIGNvbHVtbk5hbWUpKTtcbiAgICAgIHF1ZXJpZXMucHVzaChbXG4gICAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZUFsdGVyQ29sdW1uU2V0RGVmYXVsdFNlcShjb2x1bW5OYW1lLCB0aGlzLmdlbmVyYXRlU2VxdWVuY2UodGFibGUsIGNvbHVtbk5hbWUpKVxuICAgICAgXS5qb2luKCcgJykpO1xuICAgIH1cblxuICAgIHJldHVybiBxdWVyaWVzLmpvaW4oJzsnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJUYWJsZUFkZFByaW1hcnlLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnQUREJyxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZVByaW1hcnlLZXkodGFibGUsIGNvbHVtbk5hbWUpXG4gICAgXS5qb2luKCcgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUFsdGVyVGFibGVEcm9wUHJpbWFyeUtleSh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnQUxURVIgVEFCTEUnLFxuICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKSxcbiAgICAgICdEUk9QIENPTlNUUkFJTlQgSUYgRVhJU1RTJyxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUNvbnN0cmFpbnQodGFibGUsIGNvbHVtbk5hbWUsICdwaycpXG4gICAgXS5qb2luKCcgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUFsdGVyVGFibGVBZGRVbmlxdWVLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnQUREJyxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZVVuaXF1ZUtleSh0YWJsZSwgY29sdW1uTmFtZSlcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJUYWJsZURyb3BVbmlxdWVLZXkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gW1xuICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUycsXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCBjb2x1bW5OYW1lLCAndW5pcXVlJylcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJUYWJsZUFkZENvbHVtbih0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uVHlwZTogc3RyaW5nLCBjb2x1bW5Qcm9wZXJ0aWVzOiBJQ29sdW1uUHJvcGVydGllcykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQodGFibGUpLFxuICAgICAgJ0FERCBDT0xVTU4nLFxuICAgICAgICB0aGlzLmdlbmVyYXRlQ29sdW1uKGNvbHVtbk5hbWUsIGNvbHVtblR5cGUsIGNvbHVtblByb3BlcnRpZXMpXG4gICAgXS5qb2luKCcgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZUFsdGVyVGFibGVEcm9wQ29sdW1uKHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQodGFibGUpLFxuICAgICAgJ0RST1AgQ09MVU1OIElGIEVYSVNUUycsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQoY29sdW1uTmFtZSlcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQWx0ZXJUYWJsZVJlbmFtZUNvbHVtbih0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcsIG5ld0NvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICdBTFRFUiBUQUJMRScsXG4gICAgICAgIHRoaXMuZXNjYXBlRmllbGQodGFibGUpLFxuICAgICAgJ1JFTkFNRSBDT0xVTU4nLFxuICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKGNvbHVtbk5hbWUpLFxuICAgICAgJ1RPJyxcbiAgICAgIHRoaXMuZXNjYXBlRmllbGQobmV3Q29sdW1uTmFtZSlcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlQ3JlYXRlSW5kZXgodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nLCBpbmRleFR5cGU6IGFueSkge1xuXG4gICAgaW5kZXhUeXBlID0gdGhpcy5pbmRleFR5cGVzLmluZGV4T2YoaW5kZXhUeXBlKSA+IC0xID8gaW5kZXhUeXBlIDogdGhpcy5pbmRleFR5cGVzWzBdO1xuICAgIGxldCBpbmRleE5hbWUgPSBjb2x1bW5OYW1lO1xuICAgIGxldCB1c2luZ1ZhbHVlID0gdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKTtcblxuICAgIGlmIChjb2x1bW5OYW1lLmluZGV4T2YodGhpcy5jb2x1bW5EZXB0aERlbGltaXRlcikgIT09IC0xKSB7XG4gICAgICAvLyB0dXJuIGV4OiByZWNpcGllLT5uYW1lIGludG8gcmVjaXBlX25hbWVcbiAgICAgIGluZGV4TmFtZSA9IGNvbHVtbk5hbWUucmVwbGFjZShuZXcgUmVnRXhwKHRoaXMuY29sdW1uRGVwdGhEZWxpbWl0ZXIsICdpJyksICdfJyk7XG4gICAgICB1c2luZ1ZhbHVlID0gYCgke2NvbHVtbk5hbWV9KWA7XG4gICAgfVxuICAgIHJldHVybiBbXG4gICAgICAnQ1JFQVRFIElOREVYJyxcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUluZGV4KHRhYmxlLCBpbmRleE5hbWUpLFxuICAgICAgJ09OJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnVVNJTkcnLFxuICAgICAgICBpbmRleFR5cGUsXG4gICAgICBbJygnLCB1c2luZ1ZhbHVlLCAnKSddLmpvaW4oJycpXG4gICAgXS5qb2luKCcgJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBnZW5lcmF0ZURyb3BJbmRleCh0YWJsZTogc3RyaW5nLCBjb2x1bW5OYW1lOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnRFJPUCBJTkRFWCcsIHRoaXMuZ2VuZXJhdGVJbmRleCh0YWJsZSwgY29sdW1uTmFtZSlcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlU2VxdWVuY2UodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCBjb2x1bW5OYW1lLCAnc2VxJyk7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDcmVhdGVTZXF1ZW5jZVF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZykge1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIFtcbiAgICAgICAgJ0NSRUFURSBTRVFVRU5DRScsXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZVNlcXVlbmNlKHRhYmxlLCBjb2x1bW5OYW1lKSxcbiAgICAgICAgJ1NUQVJUIDEnLFxuICAgICAgICAnT1dORUQgQlknLFxuICAgICAgICAgIFt0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKSwgdGhpcy5lc2NhcGVGaWVsZChjb2x1bW5OYW1lKV0uam9pbignLicpXG4gICAgICBdLmpvaW4oJyAnKSxcbiAgICAgIFtcbiAgICAgICAgJ1NFTEVDVCBzZXR2YWwoXFwnJyxcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlU2VxdWVuY2UodGFibGUsIGNvbHVtbk5hbWUpLFxuICAgICAgICAnXFwnLCBHUkVBVEVTVChDT0FMRVNDRShNQVgoJyxcbiAgICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKGNvbHVtbk5hbWUpLFxuICAgICAgICAnKSwgMCksIDApICsgMSwgZmFsc2UpIEZST00gJyxcbiAgICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKVxuICAgICAgXS5qb2luKCcnKVxuICAgIF0uam9pbignOycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVTaW1wbGVGb3JlaWduS2V5UXVlcnkodGFibGU6IHN0cmluZywgcmVmZXJlbmNlVGFibGU6IHN0cmluZykge1xuICAgIHJldHVybiBbXG4gICAgICAnQUxURVIgVEFCTEUnLFxuICAgICAgICB0aGlzLmVzY2FwZUZpZWxkKHRhYmxlKSxcbiAgICAgICdBREQgQ09OU1RSQUlOVCcsXG4gICAgICAgIGAke3RoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCByZWZlcmVuY2VUYWJsZSwgJ2lkX2ZrJyl9YCxcbiAgICAgICdGT1JFSUdOIEtFWScsXG4gICAgICAgIGAoJHt0aGlzLmVzY2FwZUZpZWxkKGAke2luZmxlY3Quc2luZ3VsYXJpemUocmVmZXJlbmNlVGFibGUpfV9pZGApfSlgLFxuICAgICAgJ1JFRkVSRU5DRVMnLFxuICAgICAgICBgJHt0aGlzLmVzY2FwZUZpZWxkKHJlZmVyZW5jZVRhYmxlKX0gKCR7dGhpcy5lc2NhcGVGaWVsZCgnaWQnKX0pYFxuICAgIF0uam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVEcm9wU2ltcGxlRm9yZWlnbktleVF1ZXJ5KHRhYmxlOiBzdHJpbmcsIHJlZmVyZW5jZVRhYmxlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gW1xuICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAnRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUycsXG4gICAgICAgIGAke3RoaXMuZ2VuZXJhdGVDb25zdHJhaW50KHRhYmxlLCByZWZlcmVuY2VUYWJsZSwgJ2lkX2ZrJyl9YFxuICAgIF0uam9pbignICcpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVSZW5hbWVTZXF1ZW5jZVF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdUYWJsZTogc3RyaW5nLCBuZXdDb2x1bW5OYW1lOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiBbXG4gICAgICAnQUxURVIgU0VRVUVOQ0UnLFxuICAgICAgICB0aGlzLmdlbmVyYXRlU2VxdWVuY2UodGFibGUsIGNvbHVtbk5hbWUpLFxuICAgICAgJ1JFTkFNRSBUTycsXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVTZXF1ZW5jZShuZXdUYWJsZSwgbmV3Q29sdW1uTmFtZSlcbiAgICBdLmpvaW4oJyAnKTtcblxuICB9XG5cbiAgcHVibGljIGdlbmVyYXRlRHJvcFNlcXVlbmNlUXVlcnkodGFibGU6IHN0cmluZywgY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICdEUk9QIFNFUVVFTkNFIElGIEVYSVNUUycsXG4gICAgICB0aGlzLmdlbmVyYXRlU2VxdWVuY2UodGFibGUsIGNvbHVtbk5hbWUpXG4gICAgXS5qb2luKCcgJyk7XG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVDcmVhdGVUYWJsZVF1ZXJ5KHRhYmxlOiBzdHJpbmcsIGNvbHVtbnM6IGFueSkge1xuXG4gICAgLy8gQ3JlYXRlIHNlcXVlbmNlcyBhbG9uZyB3aXRoIHRhYmxlXG5cbiAgICByZXR1cm4gW1xuICAgICAgc3VwZXIuZ2VuZXJhdGVDcmVhdGVUYWJsZVF1ZXJ5KHRhYmxlLCBjb2x1bW5zKSxcbiAgICAgIHRoaXMuZ2V0QXV0b0luY3JlbWVudEtleXMoY29sdW1ucykubWFwKChjb2x1bW5EYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZUNyZWF0ZVNlcXVlbmNlUXVlcnkodGFibGUsIGNvbHVtbkRhdGEubmFtZSksXG4gICAgICAgICAgW1xuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFJyxcbiAgICAgICAgICAgICAgdGhpcy5lc2NhcGVGaWVsZCh0YWJsZSksXG4gICAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGVBbHRlckNvbHVtblNldERlZmF1bHRTZXEoY29sdW1uRGF0YS5uYW1lLCB0aGlzLmdlbmVyYXRlU2VxdWVuY2UodGFibGUsIGNvbHVtbkRhdGEubmFtZSkpXG4gICAgICAgICAgXS5qb2luKCcgJylcbiAgICAgICAgXS5qb2luKCc7Jyk7XG4gICAgICB9KVxuICAgIF0uam9pbignOycpO1xuXG4gIH1cblxuICBwdWJsaWMgZ2VuZXJhdGVMaW1pdENsYXVzZShsaW1pdE9iajoge1xuICAgIGNvdW50PzogbnVtYmVyO1xuICAgIG9mZnNldD86IG51bWJlcjtcbiAgfSkge1xuXG4gICAgcmV0dXJuICghbGltaXRPYmopID8gJycgOlxuICAgICAgKGxpbWl0T2JqLmNvdW50ID8gYCBMSU1JVCAke2xpbWl0T2JqLmNvdW50fWAgOiAnJykgK1xuICAgICAgKGxpbWl0T2JqLm9mZnNldCA/IGAgT0ZGU0VUICR7bGltaXRPYmoub2Zmc2V0fWAgOiAnJyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBwcmVwcm9jZXNzV2hlcmVPYmoodGFibGU6IHN0cmluZywgd2hlcmVPYmo6IElXaGVyZU9iamVjdFtdKSB7XG5cbiAgICBjb25zdCB3aGVyZU9iakFycmF5OiBhbnlbXSA9IFtdO1xuICAgIHdoZXJlT2JqLmZvckVhY2goIHdoZXJlID0+IHtcbiAgICAgIGlmICh1dGlsaXRpZXMuaXNPYmplY3Qod2hlcmUudmFsdWUpKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKHdoZXJlLnZhbHVlKS5tYXAoIChrKSA9PiB7XG4gICAgICAgICAgd2hlcmVPYmpBcnJheS5wdXNoKE9iamVjdC5hc3NpZ24oe30sIHdoZXJlLCB7XG4gICAgICAgICAgICBjb2x1bW5OYW1lOiBgJHt3aGVyZS5jb2x1bW5OYW1lfSR7dGhpcy53aGVyZURlcHRoRGVsaW1pdGVyfScke2t9J2AsXG4gICAgICAgICAgICB2YWx1ZTogd2hlcmUudmFsdWVba11cbiAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgd2hlcmVPYmpBcnJheS5wdXNoKHdoZXJlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB3aGVyZU9iakFycmF5O1xuXG4gIH1cblxufVxuXG5Qb3N0Z3Jlc0FkYXB0ZXIucHJvdG90eXBlLnNhbml0aXplVHlwZSA9IHtcbiAgYm9vbGVhbjogKHY6IGFueSkgPT4ge1xuICAgIHJldHVybiBbJ2YnLCAndCddW3YgfCAwXTtcbiAgfSxcbiAganNvbjogKHY6IGFueSkgPT4ge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfVxufTtcblxuUG9zdGdyZXNBZGFwdGVyLnByb3RvdHlwZS5lc2NhcGVGaWVsZENoYXJhY3RlciA9IGBcImA7XG5Qb3N0Z3Jlc0FkYXB0ZXIucHJvdG90eXBlLmNvbHVtbkRlcHRoRGVsaW1pdGVyID0gJy0+JztcblBvc3RncmVzQWRhcHRlci5wcm90b3R5cGUud2hlcmVEZXB0aERlbGltaXRlciA9ICctPj4nO1xuXG5Qb3N0Z3Jlc0FkYXB0ZXIucHJvdG90eXBlLmluZGV4VHlwZXMgPSBbXG4gICdidHJlZScsXG4gICdoYXNoJyxcbiAgJ2dpc3QnLFxuICAnZ2luJ1xuXTtcblxuUG9zdGdyZXNBZGFwdGVyLnByb3RvdHlwZS5kb2N1bWVudFR5cGVzID0gW1xuICAnanNvbidcbl07XG5cblBvc3RncmVzQWRhcHRlci5wcm90b3R5cGUuY29tcGFyYXRvcnMgPSB7XG4gIGlzOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9ID0gX19WQVJfX2AsXG4gIG5vdDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSA8PiBfX1ZBUl9fYCxcbiAgbHQ6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gPCBfX1ZBUl9fYCxcbiAgbHRlOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IDw9IF9fVkFSX19gLFxuICBndDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSA+IF9fVkFSX19gLFxuICBndGU6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gPj0gX19WQVJfX2AsXG4gIGNvbnRhaW5zOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IExJS0UgJyUnIHx8IF9fVkFSX18gfHwgJyUnYCxcbiAgaWNvbnRhaW5zOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElMSUtFICclJyB8fCBfX1ZBUl9fIHx8ICclJ2AsXG4gIHN0YXJ0c3dpdGg6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSBfX1ZBUl9fIHx8ICclJ2AsXG4gIGlzdGFydHN3aXRoOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElMSUtFIF9fVkFSX18gfHwgJyUnYCxcbiAgZW5kc3dpdGg6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSAnJScgfHwgX19WQVJfX2AsXG4gIGllbmRzd2l0aDogKGZpZWxkOiBzdHJpbmcpID0+IGAke2ZpZWxkfSBJTElLRSAnJScgfHwgX19WQVJfX2AsXG4gIGxpa2U6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gTElLRSBfX1ZBUl9fYCxcbiAgaWxpa2U6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gSUxJS0UgX19WQVJfX2AsXG4gIGlzX251bGw6IChmaWVsZDogc3RyaW5nKSA9PiBgJHtmaWVsZH0gSVMgTlVMTGAsXG4gIG5vdF9udWxsOiAoZmllbGQ6IHN0cmluZykgPT4gYCR7ZmllbGR9IElTIE5PVCBOVUxMYCxcbiAgaW46IChmaWVsZDogc3RyaW5nKSA9PiBgQVJSQVlbJHtmaWVsZH1dIDxAIF9fVkFSX19gLFxuICBub3RfaW46IChmaWVsZDogc3RyaW5nKSA9PiBgTk9UIChBUlJBWVske2ZpZWxkfV0gPEAgX19WQVJfXylgLFxuICBqc29uOiAoZmllbGQ6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgIHJldHVybiBgJHtmaWVsZC5yZXBsYWNlKC9cIi9nLFwiXCIpfSA9IF9fVkFSX19gO1xuICB9LFxuICBqc29uY29udGFpbnM6IChmaWVsZDogc3RyaW5nKSA9PiB7XG4gICAgcmV0dXJuIGAke2ZpZWxkLnJlcGxhY2UoL1wiL2csXCJcIil9ID8gX19WQVJfX2A7XG4gIH1cbn07XG5cblBvc3RncmVzQWRhcHRlci5wcm90b3R5cGUudHlwZXMgPSB7XG4gIHNlcmlhbDoge1xuICAgIGRiTmFtZTogJ0JJR0lOVCcsXG4gICAgcHJvcGVydGllczoge1xuICAgICAgcHJpbWFyeV9rZXk6IHRydWUsXG4gICAgICBudWxsYWJsZTogZmFsc2UsXG4gICAgICBhdXRvX2luY3JlbWVudDogdHJ1ZVxuICAgIH1cbiAgfSxcbiAgaW50OiB7XG4gICAgZGJOYW1lOiAnQklHSU5UJ1xuICB9LFxuICBjdXJyZW5jeToge1xuICAgIGRiTmFtZTogJ0JJR0lOVCdcbiAgfSxcbiAgZmxvYXQ6IHtcbiAgICBkYk5hbWU6ICdGTE9BVCdcbiAgfSxcbiAgc3RyaW5nOiB7XG4gICAgZGJOYW1lOiAnVkFSQ0hBUidcbiAgfSxcbiAgdGV4dDoge1xuICAgIGRiTmFtZTogJ1RFWFQnXG4gIH0sXG4gIGRhdGV0aW1lOiB7XG4gICAgZGJOYW1lOiAnVElNRVNUQU1QJ1xuICB9LFxuICBib29sZWFuOiB7XG4gICAgZGJOYW1lOiAnQk9PTEVBTidcbiAgfSxcbiAganNvbjoge1xuICAgIGRiTmFtZTogJ0pTT05CJ1xuICB9XG59O1xuXG5Qb3N0Z3Jlc0FkYXB0ZXIucHJvdG90eXBlLnN1cHBvcnRzRm9yZWlnbktleSA9IHRydWU7XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzQWRhcHRlcjtcbiJdfQ==
