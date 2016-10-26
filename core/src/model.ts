import Composer from './composer';
import DataTypes from './db/data_types';
import Database from './db/database';
import ModelArray from './model_array';
import RelationshipGraph, {RelationshipPath, RelationshipNode, RelationshipEdge} from './relationship_graph';
import utilities from './utilities';
import * as async from 'async';

const Relationships = new RelationshipGraph();
const deepEqual: any = require('deep-equal');
const inflect = require('i');
inflect();

import { IAnyObject, IColumn, IExtendedError } from './types';

export interface IErrorsObject {
  _query?: any;
  [field: string]: string[];
}

export interface ICalculation {
  fields: string[];
  calculate: Function;
}
export interface ICalculations {
  [calculations: string]: ICalculation;
}

type ModelOrArray = Model | ModelArray;

/*
* Basic Model implementation. Optionally interfaces with database.
* @class
*/
class Model {

  public 'constructor': typeof Model;

  // This could possibly be null. Fix that.
  public db: Database | any;
  public schema: {
    table: string,
    columns: IColumn[];
  };
  public data: any;
  public externalInterface: string[];
  public aggregateBy: {
    id: string;
    created_at: string;
    updated_at: string;
  };
  public formatters: IAnyObject;
  public _inStorage: boolean;
  private _isSeeding: boolean;
  private _changed: {
    [prop: string]: boolean;
  };
  private _errors: IErrorsObject;
  private _joinsList: string[];
  private _joinsCache: {
    [join: string]: Model | ModelArray;
  };
  private _data: IAnyObject;
  public _calculations: ICalculations;
  private static _relationshipCache: IAnyObject;

  public _validations: IAnyObject;
  public _validationsList: any[];
  public _calculationsList: string[];
  public _verificationsList: any;
  public _hides: IAnyObject;
  public _table: string;
  public _columnLookup: {
    [key: string]: any;
  };
  public _columnNames: string[];
  public _columns: IColumn[];
  public _relationshipCache: IAnyObject;

  /*
  * @param {Object} modelData Data to load into the object
  * @param {optional boolean} fromStorage Is this model being loaded from storage? Defaults to false.
  * @param {option boolean} fromSeed Is this model being seeded?
  */
  constructor(modelData: Object, fromStorage?: boolean, fromSeed?: boolean) {

    modelData = modelData || {};

    this.__initialize__();
    this.__load__(modelData, fromStorage, fromSeed);

  }

  /**
   * Indicates whethere or not the model is currently represented in hard storage (db).
   * @return {boolean}
   */
  public inStorage() {
    return this._inStorage;
  }

  /**
   * Indicates whethere or not the model is being generated from a seed.
   * @return {boolean}
   */
  public isSeeding() {
    return this._isSeeding;
  }

  /**
   * Tells us whether a model field has changed since we created it or loaded it from storage.
   * @param {string} field The model field
   * @return {boolean}
   */
  public hasChanged(field: string): boolean {
    return field === undefined ? this.changedFields().length > 0 : !!this._changed[field];
  }

  /**
   * Provides an array of all changed fields since model was created / loaded from storage
   * @return {Array}
   */
  public changedFields(): string[] {
    const changed = this._changed;
    return Object.keys(changed).filter(key => changed[key]);
  }

  /**
   * Creates an error object for the model if any validations have failed, returns null otherwise
   * @return {Error}
   */
  public errorObject(): IExtendedError | null {

    let error: IExtendedError | null = null;

    if (this.hasErrors()) {

      const errorObject: IErrorsObject = this.getErrors();
      const message = errorObject._query || 'Validation error';

      error = new Error(message);
      error.details = errorObject;

    }

    return error;

  }

  /**
   * Tells us whether or not the model has errors (failed validations)
   * @return {boolean}
   */
  public hasErrors(): boolean {

    return Object.keys(this._errors).length > 0;

  }

  /**
   * Gives us an error object with each errored field as a key, and each value
   * being an array of failure messages from the validators
   * @return {Object}
   */
  public getErrors(): IErrorsObject {
    return Object.assign({}, this._errors);
  }

  /**
   * Reads new data into the model.
   * @param {Object} data Data to inject into the model
   * @return {this}
   */
  public read(data: IAnyObject): this {

    this.fieldList()
      .concat(this._joinsList)
      .filter((key: string) => data.hasOwnProperty(key))
      .forEach((key: string) => this.set(key, data[key]));

    return this;

  }

  /**
   * Converts a value to its intended format based on its field. Returns null if field not found.
   * @param {string} field The field to use for conversion data
   * @param {any} value The value to convert
   */
  public convert(field: string, value: any) {

    if (!this.hasField(field) || value === null || value === undefined) {
      return null;
    }

    const dataType = this.getDataTypeOf(field);

    if (this.isFieldArray(field)) {
      return (value instanceof Array ? value : [value]).map(v => dataType.convert(v));
    }

    return dataType.convert(value);

  }

  /**
   * Grabs the path of the given relationship from the RelationshipGraph
   * @param {string} name the name of the relationship
   */
  public relationship(name: string) {
    return this.constructor.relationship(name);
  }

  /**
   * Sets specified field data for the model. Logs and validates the change.
   * @param {string} field Field to set
   * @param {any} value Value for the field
   */
  public set(field: string, value: any) {

    if (!this.hasField(field)) {

      throw new Error('Field ' + field + ' does not belong to model ' + this.constructor.name);

    }

    const curValue = this._data[field];
    let changed = false;
    value = this.convert(field, value);

    if (value !== curValue) {

      changed = true;

      if (
        value instanceof Array &&
        curValue instanceof Array &&
        value.length === curValue.length
      ) {

        changed = false;
        // If we have two equal length arrays, we must compare every value

        for (let i = 0; i < value.length; i++) {
          if (value[i] !== curValue[i]) {
            changed = true;
            break;
          }
        }
      }

      // If we have an object value (json), do a deterministic diff using
      // node-deep-equals
      // NOTE: Lets do an extra deep object test
      if (utilities.isObject(value)) {
        changed = !deepEqual(curValue, value, { strict: true });
      }

    }

    this._data[field] = value;
    this._changed[field] = changed;
    changed && this.__validate__([field]);

    return value;

  }

  /**
   * Set a joined object (Model or ModelArray)
   * @param {string} field The field (name of the join relationship)
   * @param {Model|ModelArray} value The joined model or array of models
   */
  public setJoined(field: string, value: ModelArray | Model) {

    const relationship = this.relationship(field);

    if (!relationship.multiple()) {

      if (!(value instanceof relationship.getModel())) {
        throw new Error(`${value} is not an instance of ${relationship.getModel().name}`);

      }

    } else {

      // TO ASK: What is ModelArray.Model here?
      if (!(value instanceof ModelArray && (<any>ModelArray).Model !== relationship.getModel())) {
        throw new Error(`${value} is not an instanceof ModelArray[${relationship.getModel().name}]`);

      }

    }

    if (!this._joinsCache[field]) {
      this._joinsList.push(field);
    }

    this._joinsCache[field] = value;

    return value;

  }

  /**
   * Calculate field from calculations (assumes it exists)
   *  @param {string} field Name of the calculated field
   */
  public calculate(field: string): void {
    const calc = this._calculations[field];
    return calc.calculate.apply(
      this,
      calc.fields.map((f: string) => this.get(f))
    );
  }

  /**
   * Retrieve field data for the model.
   * @param {string} field Field for which you'd like to retrieve data.
   */
  public get(field: string, ignoreFormat?: boolean) {

    if (this._calculations[field]) {
      return this.calculate(field);
    }

    const datum = this._data[field];
    return (!ignoreFormat && this.formatters[field]) ? this.formatters[field](datum) : datum;

  }

  /**
   * Retrieves joined Model or ModelArray
   * @param {String} joinName the name of the join (list of connectors separated by __)
   */
  public joined(joinName: string): Model | ModelArray {

    return this._joinsCache[joinName];

  }

  /**
   * Retrieve associated models joined this model from the database.
   * @param {function({Error} err, {Nodal.Model|Nodal.ModelArray} model_1, ... {Nodal.Model|Nodal.ModelArray} model_n)}
   *   Pass in a function with named parameters corresponding the relationships you'd like to retrieve.
   *   The first parameter is always an error callback.
   */

  public include(callback: (err: Error, ...models: (Model | ModelArray)[]) => void) {

    let db = this.db;

    // legacy support
    if (arguments.length === 2) {
      db = arguments[0];
      callback = arguments[1];
    }

    let joinNames = utilities.getFunctionParameters(callback);
    joinNames = joinNames.slice(1);

    if (!joinNames.length) {
      throw new Error('No valid relationships (1st parameter is error)');
    }

    const invalidJoinNames = joinNames.filter((r: string) => !this.relationship(r));

    if (invalidJoinNames.length) {
      throw new Error(`Joins "${invalidJoinNames.join('", "')}" for model "${this.constructor.name}" do not exist.`);
    }

    let query: Composer = (<any> this.constructor).query().where({ id: this.get('id') });

    joinNames.forEach((joinName: string) => query = query.join(joinName));

    query.end((err, models) => {

      if (err) {
        return callback(err);
      }

      if (!models || !models.length) {
        return callback(new Error('Could not fetch parent'));
      }

      const model = models[0];
      const joins = joinNames.map((joinName: string) => {
        const join = model.joined(joinName);
        join && this.setJoined(joinName, <ModelArray> join);
        return join;
      });

      return callback.apply(this, [null].concat(joins));

    });

  };

  /**
   * Creates a plain object from the Model, with properties matching an optional interface
   * @param {Array} arrInterface Interface to use for object creation
   */
  public toObject(arrInterface?: any[]) {

    const obj: any = {};

    arrInterface = arrInterface ||
      this.fieldList()
      .concat(this._calculationsList)
      .filter(key => !this._hides[key]);

    arrInterface.forEach(key => {

      if (this._hides[key]) {
        return;
      }

      let joinObject: ModelOrArray;

      if (typeof key === 'object' && key !== null) {
        const subInterface = key;
        key = Object.keys(key)[0];
        joinObject = this._joinsCache[key];
        const interfaceKey = subInterface[key];
        if (joinObject) {
          const thing = (<Model>joinObject).toObject(interfaceKey);
          obj[key] = thing;
        }
      } else if (this._data[key] !== undefined) {
        obj[key] = this._data[key];
      } else if (this._calculations[key] !== undefined) {
        obj[key] = this.calculate(key);
      } else if (joinObject = this._joinsCache[key]) {
        obj[key] = (<Model>joinObject).toObject();
      }

    });

    return obj;

  }

  /**
   * Get the table name for the model.
   * @return {string}
   */
  public tableName() {
    return this._table;
  }

  /**
   * Determine if the model has a specified field.
   * @param {string} field
   * @return {boolean}
   */
  public hasField(field: string) {
    return !!this._columnLookup[field];
  }

  /**
   * Retrieve the schema field data for the specified field
   * @param {string} field
   * @return {Object}
   */
  public getFieldData(field: string) {
    return this._columnLookup[field];
  }

  /**
   * Retrieve the schema data type for the specified field
   * @param {string} field
   * @return {string}
   */
  public getDataTypeOf(field: string): {
    convert: Function;
  } {
    const key: string = this._columnLookup[field].type;
    return DataTypes[key];
  }

  /**
   * Determine whether or not this field is an Array (PostgreSQL supports this)
   * @param {string} field
   * @return {boolean}
   */
  public isFieldArray(field: string) {
    const fieldData = this._columnLookup[field];
    return !!(fieldData && fieldData.properties && fieldData.properties.array);
  }

  /**
   * Determine whether or not this field is a primary key in our schema
   * @param {string} field
   * @return {boolean}
   */
  public isFieldPrimaryKey(field: string) {
    const fieldData = this._columnLookup[field];
    return !!(fieldData && fieldData.properties && fieldData.properties.primary_key);
  }

  /**
   * Retrieve the defaultValue for this field from our schema
   * @param {string} field
   * @return {any}
   */
  public fieldDefaultValue(field: string) {
    const fieldData = this._columnLookup[field];
    return fieldData && fieldData.properties ? fieldData.properties.defaultValue : null;
  }

  /**
   * Retrieve an array of fields for our model
   * @return {Array}
   */
  public fieldList() {
    return this._columnNames.slice();
  }

  /**
   * Retrieve our field schema definitions
   * @return {Array}
   */
  public fieldDefinitions() {
    return this._columns.slice();
  }

  /**
   * Set an error for a specified field (supports multiple errors)
   * @param {string} key The specified field for which to create the error (or '*' for generic)
   * @param {string} message The error message
   * @return {boolean}
   */
  public setError(key: string, message: string) {
    this._errors[key] = this._errors[key] || [];
    this._errors[key].push(message);
    return true;
  }

  /**
   * Clears all errors for a specified field
   * @param {string} key The specified field for which to create the error (or '*' for generic)
   * @return {boolean}
   */
  public clearError(key: string) {
    delete this._errors[key];
    return true;
  }

  public __generateSaveQuery__() {

    let query: any;
    let columns: any;
    const db = this.db;

    if (!this.inStorage()) {

      columns = this.fieldList().filter(v => !this.isFieldPrimaryKey(v) && this.get(v, true) !== null);
      query = db.adapter.generateInsertQuery(this.schema.table, columns);

    } else {

      columns = ['id'].concat(this.changedFields().filter(v => !this.isFieldPrimaryKey(v)));
      query = db.adapter.generateUpdateQuery(this.schema.table, columns);

    }

    return {
      sql: query,
      params: columns.map((v: any) => db.adapter.sanitize(this.getFieldData(v).type, this.get(v)))
    };

  }

  /**
   * Runs all verifications before saving
   * @param {function} callback Method to execute upon completion. Returns true if OK, false if failed
   * @private
   */
  public __verify__(callback: Function) {

    if (this.hasErrors()) {
      return callback.call(this, this.errorObject());
    }

    // Run through verifications in order they were added
    async.series(
      this._verificationsList.map((verification: any) => {
        return (callback: Function) => {
          verification.action.apply(
            this,
            verification.fields
              .map((field: string) => this.get(field))
              .concat((bool: boolean) => callback(bool ? null : new Error(verification.message)))
          );
        };
      }),
      (err) => {

        if (err) {
          return callback.call(this, err);
        }

        callback(null);

      }
    );

  }

  /**
   * Saves model to database
   * @param {function} callback Method to execute upon completion, returns error if failed (including validations didn't pass)
   * @private
   */
  private __save__(callback: Function) {

    let db = this.db;

    // Legacy --- FIXME: Deprecated. Can remove for 1.0
    if (arguments.length === 2) {
      db = arguments[0];
      callback = arguments[1];
    }

    if (typeof callback !== 'function') {
      callback = () => {};
    }

    if (this.fieldList().indexOf('updated_at') !== -1) {
      this.set('updated_at', new Date());
    }

    const query = this.__generateSaveQuery__();

    db.query(
      query.sql,
      query.params,
      (err: Error, result: any) => {

        if (err) {
          this.setError('_query', err.message);
        } else {
          result.rows.length && this.__load__(result.rows[0], true);
        }

        callback.call(this, this.errorObject());

      }
    );

  }

  /**
   * Destroys model and cascades all deletes.
   * @param {function} callback method to run upon completion
   */
  public destroyCascade(callback: Function) {

    ModelArray.from([this]).destroyCascade(callback);

  }

  /**
   * Logic to execute before a model gets destroyed. Intended to be overwritten when inherited.
   * @param {Function} callback Invoke with first argument as an error if failure.
   */
  public beforeDestroy(callback: Function) {

    callback(null, this);

  }

  /**
   * Logic to execute after a model is destroyed. Intended to be overwritten when inherited.
   * @param {Function} callback Invoke with first argument as an error if failure.
   */
  public afterDestroy(callback: Function) {

    callback(null, this);

  }

  /**
   * Destroys model reference in database.
   * @param {function({Error} err, {Nodal.Model} model)} callback
   *   Method to execute upon completion, returns error if failed
   */
  public destroy(callback: Function) {

    callback = callback || (() => {});

    async.series([
      this.beforeDestroy,
      this.__destroy__,
      this.afterDestroy
    ].map(f => f.bind(this)), (err) => {
      callback(err || null, this);
    });

  }

  /**
   * Logic to execute before a model saves. Intended to be overwritten when inherited.
   * @param {Function} callback Invoke with first argument as an error if failure.
   */
  public beforeSave(callback: Function) {

    callback(null, this);

  }

  /**
   * Logic to execute after a model saves. Intended to be overwritten when inherited.
   * @param {Function} callback Invoke with first argument as an error if failure.
   */
  public afterSave(callback: Function) {

    callback(null, this);

  }

  /**
   * Save a model (execute beforeSave and afterSave)
   * @param {Function} callback Callback to execute upon completion
   */
  public save(callback: Function) {

    callback = callback || (() => {});

    async.series([
      this.__verify__,
      this.beforeSave,
      this.__save__,
      this.afterSave
    ].map(f => f.bind(this)), (err) => {
      callback(err || null, this);
    });

  }

  /**
   * Runs an update query for this specific model instance
   * @param {Object} fields Key-value pairs of fields to update
   * @param {Function} callback Callback to execute upon completion
   */
  public update(fields: IAnyObject, callback: Function) {

    callback = callback || (() => { });

    // Slight workaround until Typescript constructor type is correct
    (<any> this.constructor).query()
      .where({ id: this.get('id') })
      .update(fields, (err: Error, models: any[]) => callback(err, models && models[0]));

  }

  /*
  * Finds a model with a provided id, otherwise returns a notFound error.
  * @param {number} id The id of the model you're looking for
  * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
  */
  public static find(id: number, callback: (err: IExtendedError, model?: Model) => void) {

    let db = this.prototype.db;

    // legacy support
    if (arguments.length === 3) {
      db = arguments[0];
      id = arguments[1];
      callback = arguments[2];
    }

    return new Composer(this)
      .where({ id: id })
      .end((err: Error, models: ModelArray) => {
        if (!err && !models.length) {

          const err: IExtendedError = new Error(`Could not find ${this.name} with id "${id}".`);
          err.notFound = true;
          return callback(err);
        }

        callback(err, models[0]);

      });

  }

  /*
  * Finds a model with a provided field, value pair. Returns the first found.
  * @param {string} field Name of the field
  * @param {any} value Value of the named field to compare against
  * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
  */
  public static findBy(field: string, value: any, callback: (err: IExtendedError, model?: Model) => void) {
    const query = {
      [field]: value
    };

    return new Composer(this)
      .where(query)
      .end((err: Error, models: ModelArray) => {

        if (!err && !models.length) {
          const err: IExtendedError = new Error(`Could not find ${this.name} with ${field} "${value}".`);
          err.notFound = true;
          return callback(err);
        }

        callback(err, models[0]);

      });

  }
  /**
   * Creates a new model instance using the provided data.
   * @param {object} data The data to load into the object.
   * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
   */
  public static create(data: IAnyObject, callback: (err: IExtendedError, model?: Model) => void) {

    const model = new this(data);
    model.save(callback);

  }

  /**
   * Finds a model with a provided field, value pair. Returns the first found.
   * @param {string} field Name of the field
   * @param {object} data Key-value pairs of Model creation data. Will use appropriate value to query for based on "field" parametere.
   * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
   */
  public static findOrCreateBy(field: string, data: IAnyObject, callback: (err: IExtendedError | null, model?: Model) => void) {

    this.findBy(field, data[field], (err: IExtendedError, model: Model) => {

      if (err) {
        if (err.notFound) {
          return this.create(data, callback);
        } else {
          return callback(err);
        }
      } else {
        return callback(null, model);
      }

    });

  }

  /**
   * Finds and updates a model with a specified id. Return a notFound error if model does not exist.
   * @param {number} id The id of the model you're looking for
   * @param {object} data The data to load into the object.
   * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
   */
  public static update(id: number, data: IAnyObject, callback: (err: IExtendedError, model?: Model) => void) {

    this.find(id, (err: IExtendedError, model: Model) => {

      if (err) {
        return callback(err);
      }

      model.read(data);
      model.save(callback);

    });

  }

  /**
   * Finds and destroys a model with a specified id. Return a notFound error if model does not exist.
   * @param {number} id The id of the model you're looking for
   * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
   */
  public static destroy(id: number, callback: (err: IExtendedError, model?: Model) => void) {
    this.find(id, (err: IExtendedError, model: Model) => {
      if (err) {
        return callback(err);
      }

      model.destroy(callback);

    });

  }

  /**
   * Creates a new Composer (ORM) instance to begin a new query.
   * @param {optional Nodal.Database} db Deprecated - provide a database to query from. Set the model's db in its constructor file, instead.
   * @return {Nodal.Composer}
   */
  public static query(db?: Database): Composer {

    db = db || this.prototype.db;
    return new Composer(this);

  }

  /**
   * Get the model's table name
   * @return {string}
   */
  public static table() {
    return this.prototype.schema.table;
  }

  /**
   * Get the model's column data
   * @return {Array}
   */
  public static columns() {
    return this.prototype.schema.columns;
  };

  /**
   * Get the model's column names (fields)
   * @return {Array}
   */
  public static columnNames() {
    return this.columns().map(v => v.name);
  }

  /**
   * Get the model's column lookup data
   * @return {Object}
   */
  public static columnLookup() {
    return this.columns().reduce((aggregatedColumns: IAnyObject, currentItem: IColumn) => {
      aggregatedColumns[currentItem.name] = currentItem;
      return aggregatedColumns;
    }, {});
  }

  /**
   * Check if the model has a column name in its schema
   * @param {string} columnName
   */
  public static hasColumn(columnName: string) {
    return !!this.column(columnName);
  }

  /**
   * Return the column schema data for a given name
   * @param {string} columnName
   */
  public static column(columnName: string) {
    return this.prototype._columnLookup[columnName];
  }

  // static toResource removed. It called functions that no longer exist and was Deprecated

  /**
   * Set the database to be used for this model
   * @param {Nodal.Database} db
   */
  public static setDatabase(db: Database) {

    this.prototype.db = db;

  }

  /**
   * Set the schema to be used for this model
   * @param {Object} schema
   */
  public static setSchema(schema: {
    table: string;
    columns: IColumn[]
  }) {

    if (!schema) {
      throw new Error([
        `Could not set Schema for ${this.name}.`,
        `Please make sure to run any outstanding migrations.`
      ].join('\n'));
    }

    this.prototype.schema = schema;

    this.prototype._table = this.table();
    this.prototype._columns = this.columns();
    this.prototype._columnNames = this.columnNames();
    this.prototype._columnLookup = this.columnLookup();

    this.prototype._data = this.columnNames()
      .reduce((aggregatedNames: IAnyObject, currentItem: string) => {
        aggregatedNames[currentItem] = null;
        return aggregatedNames;
      }, {});

    this.prototype._changed = this.columnNames()
      .reduce((aggregatedNames: IAnyObject, currentItem: string) => {
        aggregatedNames[currentItem] = false;
        return aggregatedNames;
      }, {});

  }

  /**
   * FIXME
   */
  public static relationships(): RelationshipNode {

    return Relationships.of(this);

  }

  /**`
   * FIXME
   */
  public static relationship(name: string): RelationshipPath {

    this._relationshipCache = this._relationshipCache || {};
    this._relationshipCache[name] = (this._relationshipCache[name] || this.relationships().findExplicit(name));
    return this._relationshipCache[name];

  }

  /**
   * Sets a joins relationship for the Model. Sets joinedBy relationship for parent.
   * @param {class Nodal.Model} Model The Model class which your current model belongs to
   * @param {Object} [options={}]
   *   "name": The string name of the parent in the relationship (default to camelCase of Model name)
   *   "via": Which field in current model represents this relationship, defaults to `${name}_id`
   *   "as": What to display the name of the child as when joined to the parent (default to camelCase of child name)
   *   "multiple": Whether the child exists in multiples for the parent (defaults to false)
   */
  public static joinsTo(modelClass: typeof Model, options: {
    name: string;
    via: string;
    as: string;
    multiple: boolean;
  }) {

    return this.relationships().joinsTo(modelClass, options);

  }

  /**
   * Create a validator. These run synchronously and check every time a field is set / cleared.
   * @param {string} field The field you'd like to validate
   * @param {string} message The error message shown if a validation fails.
   * @param {function({any} value)} fnAction the validation to run - first parameter is the value you're testing.
   */
  public static validates(field: string, message: string, fnAction: (value: any) => void) {

    if (!this.prototype.hasOwnProperty('_validations')) {
      this.prototype._validations = {};
      this.prototype._validationsList = [];
    }

    if (!this.prototype._validations[field]) {
      this.prototype._validationsList.push(field);
    }

    this.prototype._validations[field] = this.prototype._validations[field] || [];
    this.prototype._validations[field].push({ message: message, action: fnAction });

  }

  /**
   * Creates a verifier. These run asynchronously, support multiple fields, and check every time you try to save a Model.
   * @param {string} message The error message shown if a validation fails.
   * @param {function} fnAction The asynchronous verification method. The last argument passed is always a callback,
   * and field names are determined by the  argument names.
   */
  public static verifies(message: string, fnAction: Function) {

    if (!this.prototype.hasOwnProperty('_verificationsList')) {
      this.prototype._verificationsList = [];
    }

    this.prototype._verificationsList.push({
      message: message,
      action: fnAction,
      fields: utilities.getFunctionParameters(fnAction).slice(0, -1)
    });

  }

  /**
   * Create a calculated field (in JavaScript). Must be synchronous.
   * @param {string} calcField The name of the calculated field
   * @param {function} fnCalculate The synchronous method to perform a calculation for.
   *   Pass the names of the (non-computed) fields you'd like to use as parameters.
   */
  public static calculates(calcField: string, fnCompute: Function) {

    if (!this.prototype.hasOwnProperty('_calculations')) {
      this.prototype._calculations = {};
      this.prototype._calculationsList = [];
    }

    if (this.prototype._calculations[calcField]) {
      throw new Error(`Calculated field "${calcField}" for "${this.name}" already exists!`);
    }

    const columnLookup = this.columnLookup();

    if (columnLookup[calcField]) {
      throw new Error(`Cannot create calculated field "${calcField}" for "${this.name}", field already exists.`);
    }

    const fields: string[] = utilities.getFunctionParameters(fnCompute);

    fields.forEach(f => {
      if (!columnLookup[f]) {
        throw new Error(`Calculation function error: "${calcField} for "${this.name}" using field "${f}", "${f}" does not exist.`);
      }
    });

    this.prototype._calculations[calcField] = {
      calculate: fnCompute,
      fields: fields
    };

    this.prototype._calculationsList.push(calcField);

  }

  /**
   * Hides fields from being output in .toObject() (i.e. API responses), even if asked for
   * @param {String} field
   */
  public static hides(field: string) {

    if (!this.prototype.hasOwnProperty('_hides')) {
      this.prototype._hides = {};
    }

    this.prototype._hides[field] = true;
    return true;

  }

  /**
   * Tells us if a field is hidden (i.e. from API queries)
   * @param {String} field
   */
  public static isHidden(field: string) {

    return this.prototype._hides[field] || false;

  }

  /**
   * Prepare model for use
   * @private
   */
  private __initialize__() {

    this._relationshipCache = {};

    this._joinsCache = {};
    this._joinsList = [];

    this._data = Object.create(this._data); // Inherit from prototype
    this._changed = Object.create(this._changed); // Inherit from prototype
    this._errors = {};

    return true;

  }

  /*
  * Loads data into the model
  * @private
  * @param {Object} data Data to load into the model
  * @param {optional boolean} fromStorage Specify if the model was loaded from storage. Defaults to false.
  * @param {optional boolean} fromSeed Specify if the model was generated from a seed. Defaults to false.
  */
  public __load__(data: any, fromStorage?: boolean, fromSeed?: boolean) {

    data = data || {};

    this._inStorage = !!fromStorage;
    this._isSeeding = !!fromSeed;

    if (!fromStorage) {
      data.created_at = new Date();
      data.updated_at = new Date();
    }

    const keys = Object.keys(data);

    keys.forEach(key => {
      this.__safeSet__(key, data[key]);
      this._changed[key] = !fromStorage;
    });

    this.__validate__();

    return this;

  }

  /**
   * Validates provided fieldList (or all fields if not provided)
   * @private
   * @param {optional Array} fieldList fields to validate
   */
  private __validate__(field?: any) {

    if (!field) {

      let valid = true;
      this._validationsList
        .forEach((field: any[]) => {
          valid = (this.__validate__(field) && valid);
        });
      return valid;

    } else if (!this._validations[field]) {

      return true;

    }

    this.clearError(field);
    const value = this._data[field];

    return this._validations[field].filter((validation: any) => {
      const valid = validation.action.call(null, value);
      !valid && this.setError(field, validation.message);
      return valid;
    }).length === 0;

  }

  /**
   * Sets specified field data for the model, assuming data is safe and does not log changes
   * @param {string} field Field to set
   * @param {any} value Value for the field
   */
  private __safeSet__(field: string, value: any) {

    if (this.relationship(field)) {

      return this.setJoined(field, value);

    }

    if (!this.hasField(field)) {

      return;

    }

    this._data[field] = this.convert(field, value);

  }

  /**
   * Destroys model reference in database
   * @param {function} callback Method to execute upon completion, returns error if failed
   * @private
   */
  private __destroy__(callback: Function) {

    let db = this.db;

    // Legacy
    if (arguments.length === 2) {
      db = arguments[0];
      callback = arguments[1];
    }

    if (!(db instanceof Database)) {
      throw new Error('Must provide a valid Database to save to');
    }

    if (typeof callback !== 'function') {
      callback = () => { };
    }

    if (!this.inStorage()) {

      setTimeout(callback.bind(this, { _query: 'Model has not been saved' }, this), 1);
      return;

    }

    const columns = this.fieldList().filter((v) => {
      return this.isFieldPrimaryKey(v);
    });

    const query = db.adapter.generateDeleteQuery(this.schema.table, columns);

    db.query(
      query,
      columns.map((v) => {
        return db.adapter.sanitize(this.getFieldData(v).type, this.get(v, true));
      }),
      (err: Error, result: any) => {

        if (err) {
          this.setError('_query', err.message);
        } else {
          this._inStorage = false;
        }

        callback.call(this, err, this);

      }
    );

  }

}

Model.prototype.schema = {
  table: '',
  columns: []
};

Model.prototype._validations = {};
Model.prototype._validationsList = [];

Model.prototype._calculations = {};
Model.prototype._calculationsList = [];

Model.prototype._verificationsList = [];

Model.prototype._hides = {};

Model.prototype.formatters = {};

Model.prototype.data = null;

Model.prototype.db = null;

Model.prototype.externalInterface = [
  'id',
  'created_at',
  'updated_at'
];

Model.prototype.aggregateBy = {
  id: 'count',
  created_at: 'min',
  updated_at: 'min'
};

export default Model;
