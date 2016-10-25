"use strict";
const fs_1 = require('fs');
const inflect = require('i')();
class SchemaGenerator {
    constructor(db) {
        this.db = db;
        this.migrationId = null;
        this.models = {};
        this.indices = [];
        this._defaultPath = 'db/schema.json';
    }
    load(filename) {
        filename = filename || this._defaultPath;
        filename = process.cwd() + '/' + filename;
        // Need to pass an encoding to readFileSync or it could return a Buffer.
        return this.read(fs_1.default.readFileSync(filename, 'utf8'));
    }
    fetch(callback) {
        this.db.query('SELECT "schema_migrations"."schema" FROM "schema_migrations" ORDER BY "id" DESC LIMIT 1', [], ((err, result) => {
            if (err) {
                return callback(err);
            }
            result.rows && result.rows.length && this.read(result.rows[0].schema);
            callback(null);
        }));
    }
    save(filename) {
        filename = filename || this._defaultPath;
        filename = process.cwd() + '/' + filename;
        fs_1.default.writeFileSync(filename, this.generate());
        return true;
    }
    mergeProperties(columnData, properties) {
        properties = properties || {};
        const defaults = this.db.adapter.typePropertyDefaults;
        const oldProperties = this.db.adapter.getTypeProperties(columnData.type, columnData.properties) || {};
        const newProperties = {};
        this.db.adapter.typeProperties.forEach((v) => {
            if (properties.hasOwnProperty(v) && properties[v] !== defaults[v]) {
                newProperties[v] = properties[v];
            }
            else if (oldProperties.hasOwnProperty(v) && oldProperties[v] !== defaults[v]) {
                newProperties[v] = oldProperties[v];
            }
        });
        columnData.properties = newProperties;
        return columnData;
    }
    set(schema) {
        this.setMigrationId(schema.migration_id);
        this.models = schema.models || {};
        this.indices = schema.indices || [];
        return true;
    }
    setMigrationId(id) {
        this.migrationId = id;
    }
    findClass(table) {
        const models = this.models;
        return Object.keys(models).filter((v) => {
            return models[v].table === table;
        }).pop() || '';
    }
    createTable(table, arrColumnData, modelName) {
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
        arrColumnData.forEach(((columnData) => {
            this.mergeProperties(columnData);
        }));
        this.models[tableClass] = {
            table: table,
            columns: arrColumnData
        };
        return arrColumnData;
    }
    dropTable(table) {
        const tableClass = this.findClass(table);
        if (!tableClass) {
            throw new Error('Table "' + table + '" does not exist in your schema');
        }
        delete this.models[tableClass];
        return true;
    }
    renameTable(table, newTableName, renameModel, newModelName) {
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
    alterColumn(table, column, type, properties) {
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
        const schemaFieldData = models[modelKey].columns.filter((v) => {
            return v.name === column;
        }).pop();
        if (!schemaFieldData) {
            throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
        }
        schemaFieldData.type = type;
        this.mergeProperties(schemaFieldData, properties);
        return true;
    }
    addColumn(table, column, type, properties) {
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
    dropColumn(table, column) {
        const models = this.models;
        const modelKey = Object.keys(models).filter((t) => {
            return models[t].table === table;
        }).pop();
        if (!modelKey) {
            throw new Error('Table "' + table + '" does not exist');
        }
        const modelSchema = models[modelKey];
        const columnIndex = modelSchema.columns.map((v) => { return v.name; }).indexOf(column);
        if (columnIndex === -1) {
            throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
        }
        modelSchema.columns.splice(columnIndex, 1);
        return true;
    }
    renameColumn(table, column, newColumn) {
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
        if (!schemaFieldData) {
            throw new Error('Column "' + column + '" of table "' + table + '" already exists');
        }
        schemaFieldData.name = newColumn;
        return true;
    }
    createIndex(table, column, type) {
        if (this.indices.filter((v) => {
            return v.table === table && v.column === column;
        }).length) {
            throw new Error(`Index already exists on column "${column}" of table "${table}"`);
        }
        this.indices.push({ table: table, column: column, type: type });
        return true;
    }
    dropIndex(table, column) {
        this.indices = this.indices.filter((v) => {
            return !(v.table === table && v.column === column);
        });
        return true;
    }
    addForeignKey(table, referenceTable) {
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
    dropForeignKey(table, referenceTable) {
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
    read(json) {
        return this.set(JSON.parse(json));
    }
    generate() {
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
                        curTable.columns.map((columnData) => {
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SchemaGenerator;
