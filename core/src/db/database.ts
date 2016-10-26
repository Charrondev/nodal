const colors = require('colors/safe');

const DEFAULT_ADAPTER = 'postgres';
const ADAPTERS: {
  [item: string]: string;
} = {
  postgres: './adapters/postgres.js'
};

import PostgresAdapter from './adapters/postgres';

class Database {

  public adapter: any;
  public __logColorFuncs: Function[];
  private _useLogColor: 0 | 1;

  constructor() {

    this.adapter = null;
    this._useLogColor = 0;

  }

  public connect(cfg: any) {

    if (typeof cfg === 'string') {
      cfg = {connectionString: cfg};
    }

    // const Adapter = require(ADAPTERS[cfg.adapter] || ADAPTERS[DEFAULT_ADAPTER]).default;
    this.adapter = new PostgresAdapter(this, cfg);

    return true;

  }

  public close(callback: Function) {

    this.adapter.close.apply(this, arguments);
    callback && callback.call(this);
    return true;

  }

  public log(sql: string, params?: any, time?: number) {

    const colorFunc = this.__logColorFuncs[this._useLogColor];

    console.log();
    console.log(colorFunc(sql));
    params && console.log(colorFunc(JSON.stringify(params)));
    time && console.log(colorFunc(time + 'ms'));
    console.log();

    this._useLogColor = <0 | 1>((this._useLogColor + 1) % this.__logColorFuncs.length);

    return true;

  }

  public info(message: string) {

    console.log(colors.green.bold('Database Info: ') + message);

  }

  public error(message: string) {

    console.log(colors.red.bold('Database Error: ') + message);
    return true;

  }

  public query(...args: any[]): void {

    this.adapter.query.apply(this.adapter, arguments);

  }

  public transaction(...args: any[]) {

    this.adapter.transaction.apply(this.adapter, args);

  }

  public drop() {

    this.adapter.drop.apply(this.adapter, arguments);

  }

  public create() {

    this.adapter.create.apply(this.adapter, arguments);

  }

}

Database.prototype.__logColorFuncs = [
  (str: string) => {
    return colors.yellow.bold(str);
  },
  (str: string) => {
    return colors.white(str);
  }
];

export default Database;
