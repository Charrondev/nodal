const inflect = require('i')();
import Model from './model';

interface IState {
  skip: boolean;
  terminate: boolean;
  next: string;
  func: (str: string, arr: any) => string;
}

interface IStates {
  [key: string]: IState;
}

/**
 * GraphQuery class that translates GraphQL to something digestible by the Composer
 * @class
 */
class GraphQuery {

  // Needed to type the constructor
  private 'constructor': typeof GraphQuery;
  public identifier: string;
  public name: string;
  public Model: typeof Model;
  public structure: any;
  public joins: any;

  /**
   * Create a GraphQuery object
   * @param {String} str The query to execute
   * @param {Number} maxDepth The maximum depth of graph to traverse
   * @param {Nodal.Model} [Model=null] The Model to base your query around (used for testing)
   */
  constructor(str: string, maxDepth: number, mModel?: typeof Model) {

    const parsed = this.constructor.parse(str, maxDepth);

    this.identifier = typeof parsed.structure === 'string' ?
      parsed.structure :
      Object.keys(parsed.structure)[0];
    this.name = inflect.singularize(this.identifier);

    try {
      this.Model = mModel || require(`${process.cwd()}/app/models/${this.name}.js`);
    } catch (e) {
      throw new Error(`Model ${this.name} does not exist.`);
    }

    this.structure = parsed.structure;
    this.joins = parsed.joins;

  }

  /**
   * Create and execute a GraphQuery object
   * @param {String} str The query to execute
   * @param {Number} maxDepth The maximum depth of graph to traverse
   * @param {Function} callback The function to execute upon completion
   */
  public static query(str: string, maxDepth: number, callback: Function) {

    let graphQuery: GraphQuery;

    try {
      graphQuery = new GraphQuery(str, maxDepth);
    } catch (err) {
      callback(err);
      return false;
    }

    graphQuery.query(callback);

    return true;

  }

  /**
   * Parse syntax tree of a GraphQL query 
   */
  // tslint:disable max-func-body-length
  public static parseSyntaxTree(str: string, state?: string, arr?: any[]): any {

    arr = arr || [];
    state = state || 'NAME';

    const nameRE = /[_A-Za-z][_0-9A-Za-z]*/;

    const STATES: IStates = {
      NAME: {
        skip: false,
        terminate: true,
        next: 'PROPERTYLIST',
        func: (str: string, arr: any[]) => {

          const match = str.match(nameRE);
          const name = match ? match[0] : null;

          arr.push({
            type: 'field',
            data: {
              name: name
            }
          });

          const len = name ? name.length : 0;
          return str.substr(len);

        }
      },
      PROPERTYNAME: {
        skip: false,
        terminate: true,
        next: 'PROPERTYVALUESTART',
        func: (str: string, arr: any) => {

          const match = str.match(nameRE);
          const name = match ? match[0] : null;

          arr.push({
            type: 'property',
            data: {
              name: name
            }
          });

          const len = name ? name.length : 0;
          return str.substr(len);

        }
      },
      PROPERTYVALUESTAR: {
        skip: false,
        terminate: false,
        next: 'PROPERTYVALUE',
        func: (str: string, arr: any) => {

          if (str[0] !== ':') {
            return str;
          }

          return str.substr(1);

        }
      },
      PROPERTYVALUE: {
        skip: false,
        terminate: false,
        next: 'PROPERTYVALUEEND',
        func: (str: string, arr: any) => {

          const cur = arr[arr.length - 1];

          if (str[0] !== '"') {

            const items = [
              {str: 'null', val: null},
              {str: 'true', val: true},
              {str: 'false', val: false}
            ];

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (str.substr(0, item.str.length) === item.str) {
                cur.data.value = item.val;
                return str.substr(item.str.length);
              }
            }

            let value: any = str.match(/^[\-\+]?\d+(\.\d+|e[\-\+]?\d+)?/i);

            if (!value) {
              return str;
            }

            value = value[0];
            cur.data.value = parseFloat(value);
            return str.substr(value.length);

          }

          let i = 1;
          while (str[i]) {

            if (str[i] === '"') {

              let n = 1;
              let c = 0;

              while (str[i - n] === '\\') {
                c++;
                n++;
              }

              if (!(c & 1)) {
                cur.data.value = str.substring(1, i);
                return str.substring(i + 1);
              }

            }

            i++;

          }

          return str;

        }
      },
      PROPERTYVALUEEND: {
        skip: false,
        terminate: true,
        next: 'PROPERTYNAME',
        func: (str: string, arr: any) => {

          if (str[0] !== ',') {
            return str;
          }

          return str.substr(1);

        }
      },
      PROPERTYLIST: {
        skip: true,
        terminate: true,
        func: (str: string, arr: any) => {

          if (str[0] !== '(') {
            return str;
          }

          const cur = arr[arr.length - 1];

          let count = 0;
          let i = 0;

          while (str[i]) {
            if (str[i] === '(') {
              count++;
            } else if (str[i] === ')') {
              count--;
            }
            if (!count) {
              break;
            }
            i++;
          }

          if (count) {
            return str;
          }

          cur.data.properties = this.parseSyntaxTree(str.substring(1, i), 'PROPERTYNAME');

          return str.substring(i + 1);

        },
        next: 'LIST'
      },
    LIS: {
        skip: true,
        terminate: true,
        next: 'NAMEEND',
        func: (str: string, arr: any[]) => {

          if (str[0] !== '{') {
            return str;
          }

          const cur = arr[arr.length - 1];

          let count = 0;
          let i = 0;

          while (str[i]) {
            if (str[i] === '{') {
              count++;
            } else if (str[i] === '}') {
              count--;
            }
            if (!count) {
              break;
            }
            i++;
          }

          if (count) {
            return str;
          }

          cur.data.children = this.parseSyntaxTree(str.substring(1, i), 'NAME');

          return str.substring(i + 1);

        }
      },
      NAMEEND: {
        skip: false,
        terminate: true,
        next: 'NAME',
        func: (str: string, arr: any[]) => {

          if (str[0] !== ',') {
            return str;
          }

          return str.substr(1);

        }
      }
    };

    /* State machine... */

    str = str.replace(/^\s*(.*)$/m, '$1');

    if (!str) {
      if (STATES[state].terminate) {
        return arr;
      } else {
        throw new Error('Unexpected termination');
      }
    }

    // Execute next step...
    const next = STATES[state].func(str, arr);

    if (!STATES[state].skip && (next === str)) {
      throw new Error(`Syntax Error at or near "${str.substr(0, 20)}"`);
    }

    if (!STATES[state].next) {
      return arr;
    }

    return this.parseSyntaxTree(next, STATES[state].next, arr);

  }

  // tslint:enable max-func-body-length

  /**
   * Fully parse a GraphQL query, get necessary joins to make in SQL
   */
  public static parse(str: string, max: number) {

    const joins = {};
    const tree = this.formatTree(
      this.parseSyntaxTree(str),
      max,
      joins
    );

    if (!tree.length) {
      throw new Error('Invalid query: List an object to query');
    }

    return {
      structure: tree[0],
      joins: joins
    };

  }

  /**
   * Format a parsed syntax tree in a way that the Composer expects
   */
  public static formatTree(tree: any[], max: number, joins: any, parents?: any) {

    max = Math.max(max | 0, 0);
    joins = joins || {};
    parents = parents || [];

    const depth = parents.length;

    return tree.map(item => {

      joins[parents.concat(item.data.name).join('__')] = (item.data.properties || [])
        .filter((p: any) => p.type === 'property')
        .reduce((obj: any, p: any) => {
          obj[p.data.name] = p.data.value;
          return obj;
        }, {});

      if (!item.data.children) {

        return item.data.name;

      }

      if (!max || depth < max) {

        const nameObj: any = {};
        nameObj[item.data.name] = this.formatTree(
          item.data.children || [],
          max,
          joins,
          parents.concat(item.data.name)
        );

        return nameObj;

      } else {

        return null;

      }

    }).filter(item => item);

  }

  /**
   * Query the GraphQuery object from the database
   * @param {Function} callback The function to execute upon completion
   */
  public query(callback: Function) {

    let query = this.Model.query().safeWhere(this.joins[this.identifier]);

    Object.keys(this.joins).forEach(joinName => {

      const joinNames = joinName.split('__');
      joinNames.shift();
      if (!joinNames.length) {
        return;
      }

      query = query.safeJoin(joinNames.join('__'), this.joins[joinName]);

    });

    query.end((err, models) => {

      callback(err, models, this.structure[this.identifier]);

    });

    return this;

  }

}

export default GraphQuery;
