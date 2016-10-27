import SQLAdapter, { IWhereObject } from '../sql_adapter.js';
import Database from '../database';
import { IColumnProperties } from '../../types';
export interface IConfig {
    connectionString?: string;
    host?: string;
    database?: string;
    user?: string;
    password?: string;
    port?: number;
    ssl?: boolean;
}
declare class PostgresAdapter extends SQLAdapter {
    db: Database;
    private _config;
    constructor(db: Database, cfg: IConfig);
    close(): void;
    query(query: string, params: any, callback: Function): boolean;
    transaction(preparedArray: any, callback: Function): void;
    drop(databaseName: string, callback: Function): void;
    create(databaseName: string, callback: Function): void;
    generateArray(arr: any[]): string;
    generateConnectionString(host: string, port: number, database: string, user: string, password: string): string;
    parseConnectionString(str: string): IConfig;
    generateClearDatabaseQuery(): string;
    generateCreateDatabaseQuery(name: string): string;
    generateDropDatabaseQuery(name: string): string;
    generateColumn(columnName: string, columnType: string, columnProperties: IColumnProperties): string;
    generateAlterColumn(columnName: string, columnType: string, columnProperties: IColumnProperties): string;
    generateAlterColumnSetNull(columnName: string, columnType: string, columnProperties: IColumnProperties): string;
    generateAlterColumnDropDefault(columnName: string, columnType?: string, columnProperties?: IColumnProperties): string;
    generateAlterColumnSetDefaultSeq(columnName: string, seqName: string): string;
    generateIndex(table: string, columnName: string): string;
    generateConstraint(table: string, columnName: string, suffix: string): string;
    generatePrimaryKey(table: string, columnName: string): string;
    generateUniqueKey(table: string, columnName: string): string;
    generateAlterTableRename(table: string, newTableName: string, columns: any): string;
    generateAlterTableColumnType(table: string, columnName: string, columnType: string, columnProperties: IColumnProperties): string;
    generateAlterTableAddPrimaryKey(table: string, columnName: string): string;
    generateAlterTableDropPrimaryKey(table: string, columnName: string): string;
    generateAlterTableAddUniqueKey(table: string, columnName: string): string;
    generateAlterTableDropUniqueKey(table: string, columnName: string): string;
    generateAlterTableAddColumn(table: string, columnName: string, columnType: string, columnProperties: IColumnProperties): string;
    generateAlterTableDropColumn(table: string, columnName: string): string;
    generateAlterTableRenameColumn(table: string, columnName: string, newColumnName: string): string;
    generateCreateIndex(table: string, columnName: string, indexType: any): string;
    generateDropIndex(table: string, columnName: string): string;
    generateSequence(table: string, columnName: string): string;
    generateCreateSequenceQuery(table: string, columnName: string): string;
    generateSimpleForeignKeyQuery(table: string, referenceTable: string): string;
    generateDropSimpleForeignKeyQuery(table: string, referenceTable: string): string;
    generateRenameSequenceQuery(table: string, columnName: string, newTable: string, newColumnName: string): string;
    generateDropSequenceQuery(table: string, columnName: string): string;
    generateCreateTableQuery(table: string, columns: any): string;
    generateLimitClause(limitObj: {
        count?: number;
        offset?: number;
    }): string;
    preprocessWhereObj(table: string, whereObj: IWhereObject[]): IWhereObject[];
}
export default PostgresAdapter;
