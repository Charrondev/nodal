"use strict";
const schema_generator_1 = require('./schema_generator');
class Migration {
    constructor(db) {
        if (!db) {
            throw new Error('Migration required valid database instance');
        }
        this.id = null;
        this.db = db;
        this.schema = new schema_generator_1.default(db);
    }
    up() {
        return [];
    }
    down() {
        return [];
    }
    executeUp(callback) {
        const schema = this.schema;
        schema.fetch(((err) => {
            if (err) {
                return callback(err);
            }
            schema.setMigrationId(this.id);
            const up = this.up().concat([
                'INSERT INTO "schema_migrations"("id", "schema") VALUES(' + this.id + ', \'' + schema.generate() + '\')'
            ]);
            this.db.transaction(up.join(';'), (err) => {
                !err && schema.save();
                return callback(err);
            });
        }));
    }
    executeDown(callback, prevId) {
        const schema = this.schema;
        schema.fetch(((err) => {
            if (err) {
                return callback(err);
            }
            schema.setMigrationId(prevId || null);
            const down = this.down().concat([
                'DELETE FROM "schema_migrations" WHERE id = ' + this.id
            ]);
            this.db.transaction(down.join(';'), (err) => {
                !err && schema.save();
                callback(err);
            });
        }));
    }
    createTable(table, arrFieldData, modelName) {
        arrFieldData = this.schema.createTable(table, arrFieldData, modelName);
        return this.db.adapter.generateCreateTableQuery(table, arrFieldData);
    }
    dropTable(table) {
        this.schema.dropTable(table);
        return this.db.adapter.generateDropTableQuery(table);
    }
    renameTable(table, newTableName, renameModel, newModelName) {
        const modelSchema = this.schema.renameTable(table, newTableName, renameModel, newModelName);
        return this.db.adapter.generateAlterTableRename(table, newTableName, modelSchema.columns);
    }
    alterColumn(table, column, type, properties) {
        properties = properties || {};
        this.schema.alterColumn(table, column, type, properties);
        return this.db.adapter.generateAlterTableQuery(table, column, type, properties);
    }
    addColumn(table, column, type, properties) {
        properties = properties || {};
        this.schema.addColumn(table, column, type, properties);
        return this.db.adapter.generateAlterTableAddColumnQuery(table, column, type, properties);
    }
    dropColumn(table, column) {
        this.schema.dropColumn(table, column);
        return this.db.adapter.generateAlterTableDropColumnQuery(table, column);
    }
    renameColumn(table, column, newColumn) {
        this.schema.renameColumn(table, column, newColumn);
        return this.db.adapter.generateAlterTableRenameColumnQuery(table, column, newColumn);
    }
    createIndex(table, column, type) {
        this.schema.createIndex(table, column, type);
        return this.db.adapter.generateCreateIndexQuery(table, column, type);
    }
    dropIndex(table, column) {
        this.schema.dropIndex(table, column);
        return this.db.adapter.generateDropIndexQuery(table, column);
    }
    addForeignKey(table, referenceTable) {
        if (this.db.adapter.supportsForeignKey) {
            this.schema.addForeignKey(table, referenceTable);
            return this.db.adapter.generateSimpleForeignKeyQuery(table, referenceTable);
        }
        else {
            throw new Error(`${this.db.adapter.constructor.name} does not support foreign keys`);
        }
    }
    dropForeignKey(table, referenceTable) {
        if (this.db.adapter.supportsForeignKey) {
            this.schema.dropForeignKey(table, referenceTable);
            return this.db.adapter.generateDropSimpleForeignKeyQuery(table, referenceTable);
        }
        else {
            throw new Error(`${this.db.adapter.constructor.name} does not support foreign keys`);
        }
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Migration;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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WyJpbXBvcnQge0RhdGFUeXBlLCBJQ29sdW1uUHJvcGVydGllc30gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IERhdGFiYXNlIGZyb20gJy4vZGF0YWJhc2UnO1xuaW1wb3J0IFNjaGVtYUdlbmVyYXRvciBmcm9tICcuL3NjaGVtYV9nZW5lcmF0b3InO1xuXG5jbGFzcyBNaWdyYXRpb24ge1xuXG4gIHByaXZhdGUgZGI6IERhdGFiYXNlO1xuICBwcml2YXRlIGlkOiBzdHJpbmcgfCBudWxsO1xuICBwcml2YXRlIHNjaGVtYTogU2NoZW1hR2VuZXJhdG9yO1xuXG4gIGNvbnN0cnVjdG9yKGRiOiBEYXRhYmFzZSkge1xuXG4gICAgaWYgKCFkYikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaWdyYXRpb24gcmVxdWlyZWQgdmFsaWQgZGF0YWJhc2UgaW5zdGFuY2UnKTtcbiAgICB9XG5cbiAgICB0aGlzLmlkID0gbnVsbDtcblxuICAgIHRoaXMuZGIgPSBkYjtcblxuICAgIHRoaXMuc2NoZW1hID0gbmV3IFNjaGVtYUdlbmVyYXRvcihkYik7XG5cbiAgfVxuXG4gIHB1YmxpYyB1cCgpOiBzdHJpbmdbXSB7XG5cbiAgICByZXR1cm4gW107XG5cbiAgfVxuXG4gIHB1YmxpYyBkb3duKCk6IHN0cmluZ1tdIHtcblxuICAgIHJldHVybiBbXTtcblxuICB9XG5cbiAgcHVibGljIGV4ZWN1dGVVcChjYWxsYmFjazogKGVycjogRXJyb3IpID0+IHZvaWQpIHtcblxuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hO1xuXG4gICAgc2NoZW1hLmZldGNoKCgoZXJyOiBFcnJvcikgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBzY2hlbWEuc2V0TWlncmF0aW9uSWQodGhpcy5pZCk7XG5cbiAgICAgIGNvbnN0IHVwID0gdGhpcy51cCgpLmNvbmNhdChbXG4gICAgICAgICdJTlNFUlQgSU5UTyBcInNjaGVtYV9taWdyYXRpb25zXCIoXCJpZFwiLCBcInNjaGVtYVwiKSBWQUxVRVMoJyArIHRoaXMuaWQgKyAnLCBcXCcnICsgc2NoZW1hLmdlbmVyYXRlKCkgKyAnXFwnKSdcbiAgICAgIF0pO1xuXG4gICAgICB0aGlzLmRiLnRyYW5zYWN0aW9uKHVwLmpvaW4oJzsnKSwgKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgIWVyciAmJiBzY2hlbWEuc2F2ZSgpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgfSkpO1xuXG4gIH1cblxuICBwdWJsaWMgZXhlY3V0ZURvd24oY2FsbGJhY2s6IChlcnI6IEVycm9yKSA9PiB2b2lkLCBwcmV2SWQ/OiBzdHJpbmcpIHtcblxuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hO1xuXG4gICAgc2NoZW1hLmZldGNoKCgoZXJyOiBFcnJvcikgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBzY2hlbWEuc2V0TWlncmF0aW9uSWQocHJldklkIHx8IG51bGwpO1xuXG4gICAgICBjb25zdCBkb3duID0gdGhpcy5kb3duKCkuY29uY2F0KFtcbiAgICAgICAgJ0RFTEVURSBGUk9NIFwic2NoZW1hX21pZ3JhdGlvbnNcIiBXSEVSRSBpZCA9ICcgKyB0aGlzLmlkXG4gICAgICBdKTtcblxuICAgICAgdGhpcy5kYi50cmFuc2FjdGlvbihkb3duLmpvaW4oJzsnKSwgKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgIWVyciAmJiBzY2hlbWEuc2F2ZSgpO1xuICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgfSk7XG5cbiAgICB9KSk7XG5cbiAgfVxuXG4gIHB1YmxpYyBjcmVhdGVUYWJsZSh0YWJsZTogc3RyaW5nLCBhcnJGaWVsZERhdGE6IE9iamVjdFtdLCBtb2RlbE5hbWU6IHN0cmluZykge1xuXG4gICAgYXJyRmllbGREYXRhID0gdGhpcy5zY2hlbWEuY3JlYXRlVGFibGUodGFibGUsIGFyckZpZWxkRGF0YSwgbW9kZWxOYW1lKTtcblxuICAgIHJldHVybiB0aGlzLmRiLmFkYXB0ZXIuZ2VuZXJhdGVDcmVhdGVUYWJsZVF1ZXJ5KHRhYmxlLCBhcnJGaWVsZERhdGEpO1xuXG4gIH1cblxuICBwdWJsaWMgZHJvcFRhYmxlKHRhYmxlOiBzdHJpbmcpIHtcblxuICAgIHRoaXMuc2NoZW1hLmRyb3BUYWJsZSh0YWJsZSk7XG5cbiAgICByZXR1cm4gdGhpcy5kYi5hZGFwdGVyLmdlbmVyYXRlRHJvcFRhYmxlUXVlcnkodGFibGUpO1xuXG4gIH1cblxuICBwdWJsaWMgcmVuYW1lVGFibGUodGFibGU6IHN0cmluZywgbmV3VGFibGVOYW1lOiBzdHJpbmcsIHJlbmFtZU1vZGVsOiBzdHJpbmcsIG5ld01vZGVsTmFtZTogc3RyaW5nKSB7XG5cbiAgICBjb25zdCBtb2RlbFNjaGVtYSA9IHRoaXMuc2NoZW1hLnJlbmFtZVRhYmxlKHRhYmxlLCBuZXdUYWJsZU5hbWUsIHJlbmFtZU1vZGVsLCBuZXdNb2RlbE5hbWUpO1xuXG4gICAgcmV0dXJuIHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZUFsdGVyVGFibGVSZW5hbWUodGFibGUsIG5ld1RhYmxlTmFtZSwgbW9kZWxTY2hlbWEuY29sdW1ucyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBhbHRlckNvbHVtbih0YWJsZTogc3RyaW5nLCBjb2x1bW46IHN0cmluZywgdHlwZTogRGF0YVR5cGUsIHByb3BlcnRpZXM6IElDb2x1bW5Qcm9wZXJ0aWVzKSB7XG5cbiAgICBwcm9wZXJ0aWVzID0gcHJvcGVydGllcyB8fCB7fTtcblxuICAgIHRoaXMuc2NoZW1hLmFsdGVyQ29sdW1uKHRhYmxlLCBjb2x1bW4sIHR5cGUsIHByb3BlcnRpZXMpO1xuXG4gICAgcmV0dXJuIHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZUFsdGVyVGFibGVRdWVyeSh0YWJsZSwgY29sdW1uLCB0eXBlLCBwcm9wZXJ0aWVzKTtcblxuICB9XG5cbiAgcHVibGljIGFkZENvbHVtbih0YWJsZTogc3RyaW5nLCBjb2x1bW46IHN0cmluZywgdHlwZTogRGF0YVR5cGUsIHByb3BlcnRpZXM6IElDb2x1bW5Qcm9wZXJ0aWVzKSB7XG5cbiAgICBwcm9wZXJ0aWVzID0gcHJvcGVydGllcyB8fCB7fTtcblxuICAgIHRoaXMuc2NoZW1hLmFkZENvbHVtbih0YWJsZSwgY29sdW1uLCB0eXBlLCBwcm9wZXJ0aWVzKTtcblxuICAgIHJldHVybiB0aGlzLmRiLmFkYXB0ZXIuZ2VuZXJhdGVBbHRlclRhYmxlQWRkQ29sdW1uUXVlcnkodGFibGUsIGNvbHVtbiwgdHlwZSwgcHJvcGVydGllcyk7XG5cbiAgfVxuXG4gIHB1YmxpYyBkcm9wQ29sdW1uKHRhYmxlOiBzdHJpbmcsIGNvbHVtbjogc3RyaW5nKSB7XG5cbiAgICB0aGlzLnNjaGVtYS5kcm9wQ29sdW1uKHRhYmxlLCBjb2x1bW4pO1xuXG4gICAgcmV0dXJuIHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZUFsdGVyVGFibGVEcm9wQ29sdW1uUXVlcnkodGFibGUsIGNvbHVtbik7XG5cbiAgfVxuXG4gIHB1YmxpYyByZW5hbWVDb2x1bW4odGFibGU6IHN0cmluZywgY29sdW1uOiBzdHJpbmcsIG5ld0NvbHVtbjogc3RyaW5nKSB7XG5cbiAgICB0aGlzLnNjaGVtYS5yZW5hbWVDb2x1bW4odGFibGUsIGNvbHVtbiwgbmV3Q29sdW1uKTtcblxuICAgIHJldHVybiB0aGlzLmRiLmFkYXB0ZXIuZ2VuZXJhdGVBbHRlclRhYmxlUmVuYW1lQ29sdW1uUXVlcnkodGFibGUsIGNvbHVtbiwgbmV3Q29sdW1uKTtcblxuICB9XG5cbiAgcHVibGljIGNyZWF0ZUluZGV4KHRhYmxlOiBzdHJpbmcsIGNvbHVtbjogc3RyaW5nLCB0eXBlOiBEYXRhVHlwZSkge1xuXG4gICAgdGhpcy5zY2hlbWEuY3JlYXRlSW5kZXgodGFibGUsIGNvbHVtbiwgdHlwZSk7XG5cbiAgICByZXR1cm4gdGhpcy5kYi5hZGFwdGVyLmdlbmVyYXRlQ3JlYXRlSW5kZXhRdWVyeSh0YWJsZSwgY29sdW1uLCB0eXBlKTtcblxuICB9XG5cbiAgcHVibGljIGRyb3BJbmRleCh0YWJsZTogc3RyaW5nLCBjb2x1bW46IHN0cmluZykge1xuXG4gICAgdGhpcy5zY2hlbWEuZHJvcEluZGV4KHRhYmxlLCBjb2x1bW4pO1xuXG4gICAgcmV0dXJuIHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZURyb3BJbmRleFF1ZXJ5KHRhYmxlLCBjb2x1bW4pO1xuXG4gIH1cblxuICBwdWJsaWMgYWRkRm9yZWlnbktleSh0YWJsZTogc3RyaW5nLCByZWZlcmVuY2VUYWJsZTogc3RyaW5nKSB7XG5cbiAgICBpZiAodGhpcy5kYi5hZGFwdGVyLnN1cHBvcnRzRm9yZWlnbktleSkge1xuICAgICAgdGhpcy5zY2hlbWEuYWRkRm9yZWlnbktleSh0YWJsZSwgcmVmZXJlbmNlVGFibGUpO1xuICAgICAgcmV0dXJuIHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZVNpbXBsZUZvcmVpZ25LZXlRdWVyeSh0YWJsZSwgcmVmZXJlbmNlVGFibGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dGhpcy5kYi5hZGFwdGVyLmNvbnN0cnVjdG9yLm5hbWV9IGRvZXMgbm90IHN1cHBvcnQgZm9yZWlnbiBrZXlzYCk7XG4gICAgfVxuXG4gIH1cblxuICBwdWJsaWMgZHJvcEZvcmVpZ25LZXkodGFibGU6IHN0cmluZywgcmVmZXJlbmNlVGFibGU6IHN0cmluZykge1xuXG4gICAgaWYgKHRoaXMuZGIuYWRhcHRlci5zdXBwb3J0c0ZvcmVpZ25LZXkpIHtcbiAgICAgIHRoaXMuc2NoZW1hLmRyb3BGb3JlaWduS2V5KHRhYmxlLCByZWZlcmVuY2VUYWJsZSk7XG4gICAgICByZXR1cm4gdGhpcy5kYi5hZGFwdGVyLmdlbmVyYXRlRHJvcFNpbXBsZUZvcmVpZ25LZXlRdWVyeSh0YWJsZSwgcmVmZXJlbmNlVGFibGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dGhpcy5kYi5hZGFwdGVyLmNvbnN0cnVjdG9yLm5hbWV9IGRvZXMgbm90IHN1cHBvcnQgZm9yZWlnbiBrZXlzYCk7XG4gICAgfVxuICB9XG5cbn1cblxuZXhwb3J0IGRlZmF1bHQgTWlncmF0aW9uO1xuIl19
