"use strict";
const composer_1 = require('./composer');
const data_types_1 = require('./db/data_types');
const database_1 = require('./db/database');
const model_array_1 = require('./model_array');
const relationship_graph_1 = require('./relationship_graph');
const utilities_1 = require('./utilities');
const async = require('async');
const Relationships = new relationship_graph_1.default();
const deepEqual = require('deep-equal');
const inflect = require('i');
inflect();
/*
* Basic Model implementation. Optionally interfaces with database.
* @class
*/
class Model {
    /*
    * @param {Object} modelData Data to load into the object
    * @param {optional boolean} fromStorage Is this model being loaded from storage? Defaults to false.
    * @param {option boolean} fromSeed Is this model being seeded?
    */
    constructor(modelData, fromStorage, fromSeed) {
        modelData = modelData || {};
        this.__initialize__();
        this.__load__(modelData, fromStorage, fromSeed);
    }
    /**
     * Indicates whethere or not the model is currently represented in hard storage (db).
     * @return {boolean}
     */
    inStorage() {
        return this._inStorage;
    }
    /**
     * Indicates whethere or not the model is being generated from a seed.
     * @return {boolean}
     */
    isSeeding() {
        return this._isSeeding;
    }
    /**
     * Tells us whether a model field has changed since we created it or loaded it from storage.
     * @param {string} field The model field
     * @return {boolean}
     */
    hasChanged(field) {
        return field === undefined ? this.changedFields().length > 0 : !!this._changed[field];
    }
    /**
     * Provides an array of all changed fields since model was created / loaded from storage
     * @return {Array}
     */
    changedFields() {
        const changed = this._changed;
        return Object.keys(changed).filter(key => changed[key]);
    }
    /**
     * Creates an error object for the model if any validations have failed, returns null otherwise
     * @return {Error}
     */
    errorObject() {
        let error = null;
        if (this.hasErrors()) {
            const errorObject = this.getErrors();
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
    hasErrors() {
        return Object.keys(this._errors).length > 0;
    }
    /**
     * Gives us an error object with each errored field as a key, and each value
     * being an array of failure messages from the validators
     * @return {Object}
     */
    getErrors() {
        return Object.assign({}, this._errors);
    }
    /**
     * Reads new data into the model.
     * @param {Object} data Data to inject into the model
     * @return {this}
     */
    read(data) {
        this.fieldList()
            .concat(this._joinsList)
            .filter((key) => data.hasOwnProperty(key))
            .forEach((key) => this.set(key, data[key]));
        return this;
    }
    /**
     * Converts a value to its intended format based on its field. Returns null if field not found.
     * @param {string} field The field to use for conversion data
     * @param {any} value The value to convert
     */
    convert(field, value) {
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
    relationship(name) {
        return this.constructor.relationship(name);
    }
    /**
     * Sets specified field data for the model. Logs and validates the change.
     * @param {string} field Field to set
     * @param {any} value Value for the field
     */
    set(field, value) {
        if (!this.hasField(field)) {
            throw new Error('Field ' + field + ' does not belong to model ' + this.constructor.name);
        }
        const curValue = this._data[field];
        let changed = false;
        value = this.convert(field, value);
        if (value !== curValue) {
            changed = true;
            if (value instanceof Array &&
                curValue instanceof Array &&
                value.length === curValue.length) {
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
            if (utilities_1.default.isObject(value)) {
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
    setJoined(field, value) {
        const relationship = this.relationship(field);
        if (!relationship.multiple()) {
            if (!(value instanceof relationship.getModel())) {
                throw new Error(`${value} is not an instance of ${relationship.getModel().name}`);
            }
        }
        else {
            // TO ASK: What is ModelArray.Model here?
            if (!(value instanceof model_array_1.default && model_array_1.default.Model !== relationship.getModel())) {
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
    calculate(field) {
        const calc = this._calculations[field];
        return calc.calculate.apply(this, calc.fields.map((f) => this.get(f)));
    }
    /**
     * Retrieve field data for the model.
     * @param {string} field Field for which you'd like to retrieve data.
     */
    get(field, ignoreFormat) {
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
    joined(joinName) {
        return this._joinsCache[joinName];
    }
    /**
     * Retrieve associated models joined this model from the database.
     * @param {function({Error} err, {Nodal.Model|Nodal.ModelArray} model_1, ... {Nodal.Model|Nodal.ModelArray} model_n)}
     *   Pass in a function with named parameters corresponding the relationships you'd like to retrieve.
     *   The first parameter is always an error callback.
     */
    include(callback) {
        let db = this.db;
        // legacy support
        if (arguments.length === 2) {
            db = arguments[0];
            callback = arguments[1];
        }
        let joinNames = utilities_1.default.getFunctionParameters(callback);
        joinNames = joinNames.slice(1);
        if (!joinNames.length) {
            throw new Error('No valid relationships (1st parameter is error)');
        }
        const invalidJoinNames = joinNames.filter((r) => !this.relationship(r));
        if (invalidJoinNames.length) {
            throw new Error(`Joins "${invalidJoinNames.join('", "')}" for model "${this.constructor.name}" do not exist.`);
        }
        let query = this.constructor.query().where({ id: this.get('id') });
        joinNames.forEach((joinName) => query = query.join(joinName));
        query.end((err, models) => {
            if (err) {
                return callback(err);
            }
            if (!models || !models.length) {
                return callback(new Error('Could not fetch parent'));
            }
            const model = models[0];
            const joins = joinNames.map((joinName) => {
                const join = model.joined(joinName);
                join && this.setJoined(joinName, join);
                return join;
            });
            return callback.apply(this, [null].concat(joins));
        });
    }
    ;
    /**
     * Creates a plain object from the Model, with properties matching an optional interface
     * @param {Array} arrInterface Interface to use for object creation
     */
    toObject(arrInterface) {
        const obj = {};
        arrInterface = arrInterface ||
            this.fieldList()
                .concat(this._calculationsList)
                .filter(key => !this._hides[key]);
        arrInterface.forEach(key => {
            if (this._hides[key]) {
                return;
            }
            let joinObject;
            if (typeof key === 'object' && key !== null) {
                const subInterface = key;
                key = Object.keys(key)[0];
                joinObject = this._joinsCache[key];
                const interfaceKey = subInterface[key];
                if (joinObject) {
                    const thing = joinObject.toObject(interfaceKey);
                    obj[key] = thing;
                }
            }
            else if (this._data[key] !== undefined) {
                obj[key] = this._data[key];
            }
            else if (this._calculations[key] !== undefined) {
                obj[key] = this.calculate(key);
            }
            else if (joinObject = this._joinsCache[key]) {
                obj[key] = joinObject.toObject();
            }
        });
        return obj;
    }
    /**
     * Get the table name for the model.
     * @return {string}
     */
    tableName() {
        return this._table;
    }
    /**
     * Determine if the model has a specified field.
     * @param {string} field
     * @return {boolean}
     */
    hasField(field) {
        return !!this._columnLookup[field];
    }
    /**
     * Retrieve the schema field data for the specified field
     * @param {string} field
     * @return {Object}
     */
    getFieldData(field) {
        return this._columnLookup[field];
    }
    /**
     * Retrieve the schema data type for the specified field
     * @param {string} field
     * @return {string}
     */
    getDataTypeOf(field) {
        const key = this._columnLookup[field].type;
        return data_types_1.default[key];
    }
    /**
     * Determine whether or not this field is an Array (PostgreSQL supports this)
     * @param {string} field
     * @return {boolean}
     */
    isFieldArray(field) {
        const fieldData = this._columnLookup[field];
        return !!(fieldData && fieldData.properties && fieldData.properties.array);
    }
    /**
     * Determine whether or not this field is a primary key in our schema
     * @param {string} field
     * @return {boolean}
     */
    isFieldPrimaryKey(field) {
        const fieldData = this._columnLookup[field];
        return !!(fieldData && fieldData.properties && fieldData.properties.primary_key);
    }
    /**
     * Retrieve the defaultValue for this field from our schema
     * @param {string} field
     * @return {any}
     */
    fieldDefaultValue(field) {
        const fieldData = this._columnLookup[field];
        return fieldData && fieldData.properties ? fieldData.properties.defaultValue : null;
    }
    /**
     * Retrieve an array of fields for our model
     * @return {Array}
     */
    fieldList() {
        return this._columnNames.slice();
    }
    /**
     * Retrieve our field schema definitions
     * @return {Array}
     */
    fieldDefinitions() {
        return this._columns.slice();
    }
    /**
     * Set an error for a specified field (supports multiple errors)
     * @param {string} key The specified field for which to create the error (or '*' for generic)
     * @param {string} message The error message
     * @return {boolean}
     */
    setError(key, message) {
        this._errors[key] = this._errors[key] || [];
        this._errors[key].push(message);
        return true;
    }
    /**
     * Clears all errors for a specified field
     * @param {string} key The specified field for which to create the error (or '*' for generic)
     * @return {boolean}
     */
    clearError(key) {
        delete this._errors[key];
        return true;
    }
    __generateSaveQuery__() {
        let query;
        let columns;
        const db = this.db;
        if (!this.inStorage()) {
            columns = this.fieldList().filter(v => !this.isFieldPrimaryKey(v) && this.get(v, true) !== null);
            query = db.adapter.generateInsertQuery(this.schema.table, columns);
        }
        else {
            columns = ['id'].concat(this.changedFields().filter(v => !this.isFieldPrimaryKey(v)));
            query = db.adapter.generateUpdateQuery(this.schema.table, columns);
        }
        return {
            sql: query,
            params: columns.map((v) => db.adapter.sanitize(this.getFieldData(v).type, this.get(v)))
        };
    }
    /**
     * Runs all verifications before saving
     * @param {function} callback Method to execute upon completion. Returns true if OK, false if failed
     * @private
     */
    __verify__(callback) {
        if (this.hasErrors()) {
            return callback.call(this, this.errorObject());
        }
        // Run through verifications in order they were added
        async.series(this._verificationsList.map((verification) => {
            return (callback) => {
                verification.action.apply(this, verification.fields
                    .map((field) => this.get(field))
                    .concat((bool) => callback(bool ? null : new Error(verification.message))));
            };
        }), (err) => {
            if (err) {
                return callback.call(this, err);
            }
            callback(null);
        });
    }
    /**
     * Saves model to database
     * @param {function} callback Method to execute upon completion, returns error if failed (including validations didn't pass)
     * @private
     */
    __save__(callback) {
        let db = this.db;
        // Legacy --- FIXME: Deprecated. Can remove for 1.0
        if (arguments.length === 2) {
            db = arguments[0];
            callback = arguments[1];
        }
        if (typeof callback !== 'function') {
            callback = () => { };
        }
        if (this.fieldList().indexOf('updated_at') !== -1) {
            this.set('updated_at', new Date());
        }
        const query = this.__generateSaveQuery__();
        db.query(query.sql, query.params, (err, result) => {
            if (err) {
                this.setError('_query', err.message);
            }
            else {
                result.rows.length && this.__load__(result.rows[0], true);
            }
            callback.call(this, this.errorObject());
        });
    }
    /**
     * Destroys model and cascades all deletes.
     * @param {function} callback method to run upon completion
     */
    destroyCascade(callback) {
        model_array_1.default.from([this]).destroyCascade(callback);
    }
    /**
     * Logic to execute before a model gets destroyed. Intended to be overwritten when inherited.
     * @param {Function} callback Invoke with first argument as an error if failure.
     */
    beforeDestroy(callback) {
        callback(null, this);
    }
    /**
     * Logic to execute after a model is destroyed. Intended to be overwritten when inherited.
     * @param {Function} callback Invoke with first argument as an error if failure.
     */
    afterDestroy(callback) {
        callback(null, this);
    }
    /**
     * Destroys model reference in database.
     * @param {function({Error} err, {Nodal.Model} model)} callback
     *   Method to execute upon completion, returns error if failed
     */
    destroy(callback) {
        callback = callback || (() => { });
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
    beforeSave(callback) {
        callback(null, this);
    }
    /**
     * Logic to execute after a model saves. Intended to be overwritten when inherited.
     * @param {Function} callback Invoke with first argument as an error if failure.
     */
    afterSave(callback) {
        callback(null, this);
    }
    /**
     * Save a model (execute beforeSave and afterSave)
     * @param {Function} callback Callback to execute upon completion
     */
    save(callback) {
        callback = callback || (() => { });
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
    update(fields, callback) {
        callback = callback || (() => { });
        // Slight workaround until Typescript constructor type is correct
        this.constructor.query()
            .where({ id: this.get('id') })
            .update(fields, (err, models) => callback(err, models && models[0]));
    }
    /*
    * Finds a model with a provided id, otherwise returns a notFound error.
    * @param {number} id The id of the model you're looking for
    * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
    */
    static find(id, callback) {
        let db = this.prototype.db;
        // legacy support
        if (arguments.length === 3) {
            db = arguments[0];
            id = arguments[1];
            callback = arguments[2];
        }
        return new composer_1.default(this)
            .where({ id: id })
            .end((err, models) => {
            if (!err && !models.length) {
                const err = new Error(`Could not find ${this.name} with id "${id}".`);
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
    static findBy(field, value, callback) {
        const query = {
            [field]: value
        };
        return new composer_1.default(this)
            .where(query)
            .end((err, models) => {
            if (!err && !models.length) {
                const err = new Error(`Could not find ${this.name} with ${field} "${value}".`);
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
    static create(data, callback) {
        const model = new this(data);
        model.save(callback);
    }
    /**
     * Finds a model with a provided field, value pair. Returns the first found.
     * @param {string} field Name of the field
     * @param {object} data Key-value pairs of Model creation data. Will use appropriate value to query for based on "field" parametere.
     * @param {function({Error} err, {Nodal.Model} model)} callback The callback to execute upon completion
     */
    static findOrCreateBy(field, data, callback) {
        this.findBy(field, data[field], (err, model) => {
            if (err) {
                if (err.notFound) {
                    return this.create(data, callback);
                }
                else {
                    return callback(err);
                }
            }
            else {
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
    static update(id, data, callback) {
        this.find(id, (err, model) => {
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
    static destroy(id, callback) {
        this.find(id, (err, model) => {
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
    static query(db) {
        db = db || this.prototype.db;
        return new composer_1.default(this);
    }
    /**
     * Get the model's table name
     * @return {string}
     */
    static table() {
        return this.prototype.schema.table;
    }
    /**
     * Get the model's column data
     * @return {Array}
     */
    static columns() {
        return this.prototype.schema.columns;
    }
    ;
    /**
     * Get the model's column names (fields)
     * @return {Array}
     */
    static columnNames() {
        return this.columns().map(v => v.name);
    }
    /**
     * Get the model's column lookup data
     * @return {Object}
     */
    static columnLookup() {
        return this.columns().reduce((aggregatedColumns, currentItem) => {
            aggregatedColumns[currentItem.name] = currentItem;
            return aggregatedColumns;
        }, {});
    }
    /**
     * Check if the model has a column name in its schema
     * @param {string} columnName
     */
    static hasColumn(columnName) {
        return !!this.column(columnName);
    }
    /**
     * Return the column schema data for a given name
     * @param {string} columnName
     */
    static column(columnName) {
        return this.prototype._columnLookup[columnName];
    }
    // static toResource removed. It called functions that no longer exist and was Deprecated
    /**
     * Set the database to be used for this model
     * @param {Nodal.Database} db
     */
    static setDatabase(db) {
        this.prototype.db = db;
    }
    /**
     * Set the schema to be used for this model
     * @param {Object} schema
     */
    static setSchema(schema) {
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
            .reduce((aggregatedNames, currentItem) => {
            aggregatedNames[currentItem] = null;
            return aggregatedNames;
        }, {});
        this.prototype._changed = this.columnNames()
            .reduce((aggregatedNames, currentItem) => {
            aggregatedNames[currentItem] = false;
            return aggregatedNames;
        }, {});
    }
    /**
     * FIXME
     */
    static relationships() {
        return Relationships.of(this);
    }
    /**`
     * FIXME
     */
    static relationship(name) {
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
    static joinsTo(modelClass, options) {
        return this.relationships().joinsTo(modelClass, options);
    }
    /**
     * Create a validator. These run synchronously and check every time a field is set / cleared.
     * @param {string} field The field you'd like to validate
     * @param {string} message The error message shown if a validation fails.
     * @param {function({any} value)} fnAction the validation to run - first parameter is the value you're testing.
     */
    static validates(field, message, fnAction) {
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
    static verifies(message, fnAction) {
        if (!this.prototype.hasOwnProperty('_verificationsList')) {
            this.prototype._verificationsList = [];
        }
        this.prototype._verificationsList.push({
            message: message,
            action: fnAction,
            fields: utilities_1.default.getFunctionParameters(fnAction).slice(0, -1)
        });
    }
    /**
     * Create a calculated field (in JavaScript). Must be synchronous.
     * @param {string} calcField The name of the calculated field
     * @param {function} fnCalculate The synchronous method to perform a calculation for.
     *   Pass the names of the (non-computed) fields you'd like to use as parameters.
     */
    static calculates(calcField, fnCompute) {
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
        const fields = utilities_1.default.getFunctionParameters(fnCompute);
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
    static hides(field) {
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
    static isHidden(field) {
        return this.prototype._hides[field] || false;
    }
    /**
     * Prepare model for use
     * @private
     */
    __initialize__() {
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
    __load__(data, fromStorage, fromSeed) {
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
    __validate__(field) {
        if (!field) {
            let valid = true;
            this._validationsList
                .forEach((field) => {
                valid = (this.__validate__(field) && valid);
            });
            return valid;
        }
        else if (!this._validations[field]) {
            return true;
        }
        this.clearError(field);
        const value = this._data[field];
        return this._validations[field].filter((validation) => {
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
    __safeSet__(field, value) {
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
    __destroy__(callback) {
        let db = this.db;
        // Legacy
        if (arguments.length === 2) {
            db = arguments[0];
            callback = arguments[1];
        }
        if (!(db instanceof database_1.default)) {
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
        db.query(query, columns.map((v) => {
            return db.adapter.sanitize(this.getFieldData(v).type, this.get(v, true));
        }), (err, result) => {
            if (err) {
                this.setError('_query', err.message);
            }
            else {
                this._inStorage = false;
            }
            callback.call(this, err, this);
        });
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Model;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUssQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO0FBRXRDLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztBQUNuQyxLQUFLLENBQUMsU0FBUyxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztBQUV2QyxLQUFLLENBQUMsU0FBUyxDQUFDLGtCQUFrQixHQUFHLEVBQUUsQ0FBQztBQUV4QyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFFNUIsS0FBSyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO0FBRWhDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUU1QixLQUFLLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFFMUIsS0FBSyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsR0FBRztJQUNsQyxJQUFJO0lBQ0osWUFBWTtJQUNaLFlBQVk7Q0FDYixDQUFDO0FBRUYsS0FBSyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUc7SUFDNUIsRUFBRSxFQUFFLE9BQU87SUFDWCxVQUFVLEVBQUUsS0FBSztJQUNqQixVQUFVLEVBQUUsS0FBSztDQUNsQixDQUFDO0FBRUY7a0JBQWUsS0FBSyxDQUFDIiwiZmlsZSI6Im1vZGVsLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IENvbXBvc2VyIGZyb20gJy4vY29tcG9zZXInO1xuaW1wb3J0IERhdGFUeXBlcyBmcm9tICcuL2RiL2RhdGFfdHlwZXMnO1xuaW1wb3J0IERhdGFiYXNlIGZyb20gJy4vZGIvZGF0YWJhc2UnO1xuaW1wb3J0IE1vZGVsQXJyYXkgZnJvbSAnLi9tb2RlbF9hcnJheSc7XG5pbXBvcnQgUmVsYXRpb25zaGlwR3JhcGgsIHtSZWxhdGlvbnNoaXBQYXRoLCBSZWxhdGlvbnNoaXBOb2RlLCBSZWxhdGlvbnNoaXBFZGdlfSBmcm9tICcuL3JlbGF0aW9uc2hpcF9ncmFwaCc7XG5pbXBvcnQgdXRpbGl0aWVzIGZyb20gJy4vdXRpbGl0aWVzJztcbmltcG9ydCAqIGFzIGFzeW5jIGZyb20gJ2FzeW5jJztcblxuY29uc3QgUmVsYXRpb25zaGlwcyA9IG5ldyBSZWxhdGlvbnNoaXBHcmFwaCgpO1xuY29uc3QgZGVlcEVxdWFsOiBhbnkgPSByZXF1aXJlKCdkZWVwLWVxdWFsJyk7XG5jb25zdCBpbmZsZWN0ID0gcmVxdWlyZSgnaScpO1xuaW5mbGVjdCgpO1xuXG5pbXBvcnQgeyBJQW55T2JqZWN0LCBJQ29sdW1uLCBJRXh0ZW5kZWRFcnJvciB9IGZyb20gJy4vdHlwZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFcnJvcnNPYmplY3Qge1xuICBfcXVlcnk/OiBhbnk7XG4gIFtmaWVsZDogc3RyaW5nXTogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNhbGN1bGF0aW9uIHtcbiAgZmllbGRzOiBzdHJpbmdbXTtcbiAgY2FsY3VsYXRlOiBGdW5jdGlvbjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSUNhbGN1bGF0aW9ucyB7XG4gIFtjYWxjdWxhdGlvbnM6IHN0cmluZ106IElDYWxjdWxhdGlvbjtcbn1cblxudHlwZSBNb2RlbE9yQXJyYXkgPSBNb2RlbCB8IE1vZGVsQXJyYXk7XG5cbi8qXG4qIEJhc2ljIE1vZGVsIGltcGxlbWVudGF0aW9uLiBPcHRpb25hbGx5IGludGVyZmFjZXMgd2l0aCBkYXRhYmFzZS5cbiogQGNsYXNzXG4qL1xuY2xhc3MgTW9kZWwge1xuXG4gIHB1YmxpYyAnY29uc3RydWN0b3InOiB0eXBlb2YgTW9kZWw7XG5cbiAgLy8gVGhpcyBjb3VsZCBwb3NzaWJseSBiZSBudWxsLiBGaXggdGhhdC5cbiAgcHVibGljIGRiOiBEYXRhYmFzZSB8IGFueTtcbiAgcHVibGljIHNjaGVtYToge1xuICAgIHRhYmxlOiBzdHJpbmcsXG4gICAgY29sdW1uczogSUNvbHVtbltdO1xuICB9O1xuICBwdWJsaWMgZGF0YTogYW55O1xuICBwdWJsaWMgZXh0ZXJuYWxJbnRlcmZhY2U6IHN0cmluZ1tdO1xuICBwdWJsaWMgYWdncmVnYXRlQnk6IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIGNyZWF0ZWRfYXQ6IHN0cmluZztcbiAgICB1cGRhdGVkX2F0OiBzdHJpbmc7XG4gIH07XG4gIHB1YmxpYyBmb3JtYXR0ZXJzOiBJQW55T2JqZWN0O1xuICBwdWJsaWMgX2luU3RvcmFnZTogYm9vbGVhbjtcbiAgcHJpdmF0ZSBfaXNTZWVkaW5nOiBib29sZWFuO1xuICBwcml2YXRlIF9jaGFuZ2VkOiB7XG4gICAgW3Byb3A6IHN0cmluZ106IGJvb2xlYW47XG4gIH07XG4gIHByaXZhdGUgX2Vycm9yczogSUVycm9yc09iamVjdDtcbiAgcHJpdmF0ZSBfam9pbnNMaXN0OiBzdHJpbmdbXTtcbiAgcHJpdmF0ZSBfam9pbnNDYWNoZToge1xuICAgIFtqb2luOiBzdHJpbmddOiBNb2RlbCB8IE1vZGVsQXJyYXk7XG4gIH07XG4gIHByaXZhdGUgX2RhdGE6IElBbnlPYmplY3Q7XG4gIHB1YmxpYyBfY2FsY3VsYXRpb25zOiBJQ2FsY3VsYXRpb25zO1xuICBwcml2YXRlIHN0YXRpYyBfcmVsYXRpb25zaGlwQ2FjaGU6IElBbnlPYmplY3Q7XG5cbiAgcHVibGljIF92YWxpZGF0aW9uczogSUFueU9iamVjdDtcbiAgcHVibGljIF92YWxpZGF0aW9uc0xpc3Q6IGFueVtdO1xuICBwdWJsaWMgX2NhbGN1bGF0aW9uc0xpc3Q6IHN0cmluZ1tdO1xuICBwdWJsaWMgX3ZlcmlmaWNhdGlvbnNMaXN0OiBhbnk7XG4gIHB1YmxpYyBfaGlkZXM6IElBbnlPYmplY3Q7XG4gIHB1YmxpYyBfdGFibGU6IHN0cmluZztcbiAgcHVibGljIF9jb2x1bW5Mb29rdXA6IHtcbiAgICBba2V5OiBzdHJpbmddOiBhbnk7XG4gIH07XG4gIHB1YmxpYyBfY29sdW1uTmFtZXM6IHN0cmluZ1tdO1xuICBwdWJsaWMgX2NvbHVtbnM6IElDb2x1bW5bXTtcbiAgcHVibGljIF9yZWxhdGlvbnNoaXBDYWNoZTogSUFueU9iamVjdDtcblxuICAvKlxuICAqIEBwYXJhbSB7T2JqZWN0fSBtb2RlbERhdGEgRGF0YSB0byBsb2FkIGludG8gdGhlIG9iamVjdFxuICAqIEBwYXJhbSB7b3B0aW9uYWwgYm9vbGVhbn0gZnJvbVN0b3JhZ2UgSXMgdGhpcyBtb2RlbCBiZWluZyBsb2FkZWQgZnJvbSBzdG9yYWdlPyBEZWZhdWx0cyB0byBmYWxzZS5cbiAgKiBAcGFyYW0ge29wdGlvbiBib29sZWFufSBmcm9tU2VlZCBJcyB0aGlzIG1vZGVsIGJlaW5nIHNlZWRlZD9cbiAgKi9cbiAgY29uc3RydWN0b3IobW9kZWxEYXRhOiBPYmplY3QsIGZyb21TdG9yYWdlPzogYm9vbGVhbiwgZnJvbVNlZWQ/OiBib29sZWFuKSB7XG5cbiAgICBtb2RlbERhdGEgPSBtb2RlbERhdGEgfHwge307XG5cbiAgICB0aGlzLl9faW5pdGlhbGl6ZV9fKCk7XG4gICAgdGhpcy5fX2xvYWRfXyhtb2RlbERhdGEsIGZyb21TdG9yYWdlLCBmcm9tU2VlZCk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgd2hldGhlcmUgb3Igbm90IHRoZSBtb2RlbCBpcyBjdXJyZW50bHkgcmVwcmVzZW50ZWQgaW4gaGFyZCBzdG9yYWdlIChkYikuXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgaW5TdG9yYWdlKCkge1xuICAgIHJldHVybiB0aGlzLl9pblN0b3JhZ2U7XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIHdoZXRoZXJlIG9yIG5vdCB0aGUgbW9kZWwgaXMgYmVpbmcgZ2VuZXJhdGVkIGZyb20gYSBzZWVkLlxuICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgKi9cbiAgcHVibGljIGlzU2VlZGluZygpIHtcbiAgICByZXR1cm4gdGhpcy5faXNTZWVkaW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlbGxzIHVzIHdoZXRoZXIgYSBtb2RlbCBmaWVsZCBoYXMgY2hhbmdlZCBzaW5jZSB3ZSBjcmVhdGVkIGl0IG9yIGxvYWRlZCBpdCBmcm9tIHN0b3JhZ2UuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBUaGUgbW9kZWwgZmllbGRcbiAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICovXG4gIHB1YmxpYyBoYXNDaGFuZ2VkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09IHVuZGVmaW5lZCA/IHRoaXMuY2hhbmdlZEZpZWxkcygpLmxlbmd0aCA+IDAgOiAhIXRoaXMuX2NoYW5nZWRbZmllbGRdO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb3ZpZGVzIGFuIGFycmF5IG9mIGFsbCBjaGFuZ2VkIGZpZWxkcyBzaW5jZSBtb2RlbCB3YXMgY3JlYXRlZCAvIGxvYWRlZCBmcm9tIHN0b3JhZ2VcbiAgICogQHJldHVybiB7QXJyYXl9XG4gICAqL1xuICBwdWJsaWMgY2hhbmdlZEZpZWxkcygpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgY2hhbmdlZCA9IHRoaXMuX2NoYW5nZWQ7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKGNoYW5nZWQpLmZpbHRlcihrZXkgPT4gY2hhbmdlZFtrZXldKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuIGVycm9yIG9iamVjdCBmb3IgdGhlIG1vZGVsIGlmIGFueSB2YWxpZGF0aW9ucyBoYXZlIGZhaWxlZCwgcmV0dXJucyBudWxsIG90aGVyd2lzZVxuICAgKiBAcmV0dXJuIHtFcnJvcn1cbiAgICovXG4gIHB1YmxpYyBlcnJvck9iamVjdCgpOiBJRXh0ZW5kZWRFcnJvciB8IG51bGwge1xuXG4gICAgbGV0IGVycm9yOiBJRXh0ZW5kZWRFcnJvciB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKHRoaXMuaGFzRXJyb3JzKCkpIHtcblxuICAgICAgY29uc3QgZXJyb3JPYmplY3Q6IElFcnJvcnNPYmplY3QgPSB0aGlzLmdldEVycm9ycygpO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yT2JqZWN0Ll9xdWVyeSB8fCAnVmFsaWRhdGlvbiBlcnJvcic7XG5cbiAgICAgIGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgZXJyb3IuZGV0YWlscyA9IGVycm9yT2JqZWN0O1xuXG4gICAgfVxuXG4gICAgcmV0dXJuIGVycm9yO1xuXG4gIH1cblxuICAvKipcbiAgICogVGVsbHMgdXMgd2hldGhlciBvciBub3QgdGhlIG1vZGVsIGhhcyBlcnJvcnMgKGZhaWxlZCB2YWxpZGF0aW9ucylcbiAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICovXG4gIHB1YmxpYyBoYXNFcnJvcnMoKTogYm9vbGVhbiB7XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5fZXJyb3JzKS5sZW5ndGggPiAwO1xuXG4gIH1cblxuICAvKipcbiAgICogR2l2ZXMgdXMgYW4gZXJyb3Igb2JqZWN0IHdpdGggZWFjaCBlcnJvcmVkIGZpZWxkIGFzIGEga2V5LCBhbmQgZWFjaCB2YWx1ZVxuICAgKiBiZWluZyBhbiBhcnJheSBvZiBmYWlsdXJlIG1lc3NhZ2VzIGZyb20gdGhlIHZhbGlkYXRvcnNcbiAgICogQHJldHVybiB7T2JqZWN0fVxuICAgKi9cbiAgcHVibGljIGdldEVycm9ycygpOiBJRXJyb3JzT2JqZWN0IHtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fZXJyb3JzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyBuZXcgZGF0YSBpbnRvIHRoZSBtb2RlbC5cbiAgICogQHBhcmFtIHtPYmplY3R9IGRhdGEgRGF0YSB0byBpbmplY3QgaW50byB0aGUgbW9kZWxcbiAgICogQHJldHVybiB7dGhpc31cbiAgICovXG4gIHB1YmxpYyByZWFkKGRhdGE6IElBbnlPYmplY3QpOiB0aGlzIHtcblxuICAgIHRoaXMuZmllbGRMaXN0KClcbiAgICAgIC5jb25jYXQodGhpcy5fam9pbnNMaXN0KVxuICAgICAgLmZpbHRlcigoa2V5OiBzdHJpbmcpID0+IGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSlcbiAgICAgIC5mb3JFYWNoKChrZXk6IHN0cmluZykgPT4gdGhpcy5zZXQoa2V5LCBkYXRhW2tleV0pKTtcblxuICAgIHJldHVybiB0aGlzO1xuXG4gIH1cblxuICAvKipcbiAgICogQ29udmVydHMgYSB2YWx1ZSB0byBpdHMgaW50ZW5kZWQgZm9ybWF0IGJhc2VkIG9uIGl0cyBmaWVsZC4gUmV0dXJucyBudWxsIGlmIGZpZWxkIG5vdCBmb3VuZC5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkIFRoZSBmaWVsZCB0byB1c2UgZm9yIGNvbnZlcnNpb24gZGF0YVxuICAgKiBAcGFyYW0ge2FueX0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbnZlcnRcbiAgICovXG4gIHB1YmxpYyBjb252ZXJ0KGZpZWxkOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcblxuICAgIGlmICghdGhpcy5oYXNGaWVsZChmaWVsZCkgfHwgdmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0YVR5cGUgPSB0aGlzLmdldERhdGFUeXBlT2YoZmllbGQpO1xuXG4gICAgaWYgKHRoaXMuaXNGaWVsZEFycmF5KGZpZWxkKSkge1xuICAgICAgcmV0dXJuICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5ID8gdmFsdWUgOiBbdmFsdWVdKS5tYXAodiA9PiBkYXRhVHlwZS5jb252ZXJ0KHYpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YVR5cGUuY29udmVydCh2YWx1ZSk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFicyB0aGUgcGF0aCBvZiB0aGUgZ2l2ZW4gcmVsYXRpb25zaGlwIGZyb20gdGhlIFJlbGF0aW9uc2hpcEdyYXBoXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIHRoZSBuYW1lIG9mIHRoZSByZWxhdGlvbnNoaXBcbiAgICovXG4gIHB1YmxpYyByZWxhdGlvbnNoaXAobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uc3RydWN0b3IucmVsYXRpb25zaGlwKG5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgc3BlY2lmaWVkIGZpZWxkIGRhdGEgZm9yIHRoZSBtb2RlbC4gTG9ncyBhbmQgdmFsaWRhdGVzIHRoZSBjaGFuZ2UuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBGaWVsZCB0byBzZXRcbiAgICogQHBhcmFtIHthbnl9IHZhbHVlIFZhbHVlIGZvciB0aGUgZmllbGRcbiAgICovXG4gIHB1YmxpYyBzZXQoZmllbGQ6IHN0cmluZywgdmFsdWU6IGFueSkge1xuXG4gICAgaWYgKCF0aGlzLmhhc0ZpZWxkKGZpZWxkKSkge1xuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpZWxkICcgKyBmaWVsZCArICcgZG9lcyBub3QgYmVsb25nIHRvIG1vZGVsICcgKyB0aGlzLmNvbnN0cnVjdG9yLm5hbWUpO1xuXG4gICAgfVxuXG4gICAgY29uc3QgY3VyVmFsdWUgPSB0aGlzLl9kYXRhW2ZpZWxkXTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgIHZhbHVlID0gdGhpcy5jb252ZXJ0KGZpZWxkLCB2YWx1ZSk7XG5cbiAgICBpZiAodmFsdWUgIT09IGN1clZhbHVlKSB7XG5cbiAgICAgIGNoYW5nZWQgPSB0cnVlO1xuXG4gICAgICBpZiAoXG4gICAgICAgIHZhbHVlIGluc3RhbmNlb2YgQXJyYXkgJiZcbiAgICAgICAgY3VyVmFsdWUgaW5zdGFuY2VvZiBBcnJheSAmJlxuICAgICAgICB2YWx1ZS5sZW5ndGggPT09IGN1clZhbHVlLmxlbmd0aFxuICAgICAgKSB7XG5cbiAgICAgICAgY2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIHR3byBlcXVhbCBsZW5ndGggYXJyYXlzLCB3ZSBtdXN0IGNvbXBhcmUgZXZlcnkgdmFsdWVcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKHZhbHVlW2ldICE9PSBjdXJWYWx1ZVtpXSkge1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSWYgd2UgaGF2ZSBhbiBvYmplY3QgdmFsdWUgKGpzb24pLCBkbyBhIGRldGVybWluaXN0aWMgZGlmZiB1c2luZ1xuICAgICAgLy8gbm9kZS1kZWVwLWVxdWFsc1xuICAgICAgLy8gTk9URTogTGV0cyBkbyBhbiBleHRyYSBkZWVwIG9iamVjdCB0ZXN0XG4gICAgICBpZiAodXRpbGl0aWVzLmlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICBjaGFuZ2VkID0gIWRlZXBFcXVhbChjdXJWYWx1ZSwgdmFsdWUsIHsgc3RyaWN0OiB0cnVlIH0pO1xuICAgICAgfVxuXG4gICAgfVxuXG4gICAgdGhpcy5fZGF0YVtmaWVsZF0gPSB2YWx1ZTtcbiAgICB0aGlzLl9jaGFuZ2VkW2ZpZWxkXSA9IGNoYW5nZWQ7XG4gICAgY2hhbmdlZCAmJiB0aGlzLl9fdmFsaWRhdGVfXyhbZmllbGRdKTtcblxuICAgIHJldHVybiB2YWx1ZTtcblxuICB9XG5cbiAgLyoqXG4gICAqIFNldCBhIGpvaW5lZCBvYmplY3QgKE1vZGVsIG9yIE1vZGVsQXJyYXkpXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBUaGUgZmllbGQgKG5hbWUgb2YgdGhlIGpvaW4gcmVsYXRpb25zaGlwKVxuICAgKiBAcGFyYW0ge01vZGVsfE1vZGVsQXJyYXl9IHZhbHVlIFRoZSBqb2luZWQgbW9kZWwgb3IgYXJyYXkgb2YgbW9kZWxzXG4gICAqL1xuICBwdWJsaWMgc2V0Sm9pbmVkKGZpZWxkOiBzdHJpbmcsIHZhbHVlOiBNb2RlbEFycmF5IHwgTW9kZWwpIHtcblxuICAgIGNvbnN0IHJlbGF0aW9uc2hpcCA9IHRoaXMucmVsYXRpb25zaGlwKGZpZWxkKTtcblxuICAgIGlmICghcmVsYXRpb25zaGlwLm11bHRpcGxlKCkpIHtcblxuICAgICAgaWYgKCEodmFsdWUgaW5zdGFuY2VvZiByZWxhdGlvbnNoaXAuZ2V0TW9kZWwoKSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3ZhbHVlfSBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgJHtyZWxhdGlvbnNoaXAuZ2V0TW9kZWwoKS5uYW1lfWApO1xuXG4gICAgICB9XG5cbiAgICB9IGVsc2Uge1xuXG4gICAgICAvLyBUTyBBU0s6IFdoYXQgaXMgTW9kZWxBcnJheS5Nb2RlbCBoZXJlP1xuICAgICAgaWYgKCEodmFsdWUgaW5zdGFuY2VvZiBNb2RlbEFycmF5ICYmICg8YW55Pk1vZGVsQXJyYXkpLk1vZGVsICE9PSByZWxhdGlvbnNoaXAuZ2V0TW9kZWwoKSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3ZhbHVlfSBpcyBub3QgYW4gaW5zdGFuY2VvZiBNb2RlbEFycmF5WyR7cmVsYXRpb25zaGlwLmdldE1vZGVsKCkubmFtZX1dYCk7XG5cbiAgICAgIH1cblxuICAgIH1cblxuICAgIGlmICghdGhpcy5fam9pbnNDYWNoZVtmaWVsZF0pIHtcbiAgICAgIHRoaXMuX2pvaW5zTGlzdC5wdXNoKGZpZWxkKTtcbiAgICB9XG5cbiAgICB0aGlzLl9qb2luc0NhY2hlW2ZpZWxkXSA9IHZhbHVlO1xuXG4gICAgcmV0dXJuIHZhbHVlO1xuXG4gIH1cblxuICAvKipcbiAgICogQ2FsY3VsYXRlIGZpZWxkIGZyb20gY2FsY3VsYXRpb25zIChhc3N1bWVzIGl0IGV4aXN0cylcbiAgICogIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBOYW1lIG9mIHRoZSBjYWxjdWxhdGVkIGZpZWxkXG4gICAqL1xuICBwdWJsaWMgY2FsY3VsYXRlKGZpZWxkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBjYWxjID0gdGhpcy5fY2FsY3VsYXRpb25zW2ZpZWxkXTtcbiAgICByZXR1cm4gY2FsYy5jYWxjdWxhdGUuYXBwbHkoXG4gICAgICB0aGlzLFxuICAgICAgY2FsYy5maWVsZHMubWFwKChmOiBzdHJpbmcpID0+IHRoaXMuZ2V0KGYpKVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmUgZmllbGQgZGF0YSBmb3IgdGhlIG1vZGVsLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmllbGQgRmllbGQgZm9yIHdoaWNoIHlvdSdkIGxpa2UgdG8gcmV0cmlldmUgZGF0YS5cbiAgICovXG4gIHB1YmxpYyBnZXQoZmllbGQ6IHN0cmluZywgaWdub3JlRm9ybWF0PzogYm9vbGVhbikge1xuXG4gICAgaWYgKHRoaXMuX2NhbGN1bGF0aW9uc1tmaWVsZF0pIHtcbiAgICAgIHJldHVybiB0aGlzLmNhbGN1bGF0ZShmaWVsZCk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0dW0gPSB0aGlzLl9kYXRhW2ZpZWxkXTtcbiAgICByZXR1cm4gKCFpZ25vcmVGb3JtYXQgJiYgdGhpcy5mb3JtYXR0ZXJzW2ZpZWxkXSkgPyB0aGlzLmZvcm1hdHRlcnNbZmllbGRdKGRhdHVtKSA6IGRhdHVtO1xuXG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmVzIGpvaW5lZCBNb2RlbCBvciBNb2RlbEFycmF5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBqb2luTmFtZSB0aGUgbmFtZSBvZiB0aGUgam9pbiAobGlzdCBvZiBjb25uZWN0b3JzIHNlcGFyYXRlZCBieSBfXylcbiAgICovXG4gIHB1YmxpYyBqb2luZWQoam9pbk5hbWU6IHN0cmluZyk6IE1vZGVsIHwgTW9kZWxBcnJheSB7XG5cbiAgICByZXR1cm4gdGhpcy5fam9pbnNDYWNoZVtqb2luTmFtZV07XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSBhc3NvY2lhdGVkIG1vZGVscyBqb2luZWQgdGhpcyBtb2RlbCBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgICogQHBhcmFtIHtmdW5jdGlvbih7RXJyb3J9IGVyciwge05vZGFsLk1vZGVsfE5vZGFsLk1vZGVsQXJyYXl9IG1vZGVsXzEsIC4uLiB7Tm9kYWwuTW9kZWx8Tm9kYWwuTW9kZWxBcnJheX0gbW9kZWxfbil9XG4gICAqICAgUGFzcyBpbiBhIGZ1bmN0aW9uIHdpdGggbmFtZWQgcGFyYW1ldGVycyBjb3JyZXNwb25kaW5nIHRoZSByZWxhdGlvbnNoaXBzIHlvdSdkIGxpa2UgdG8gcmV0cmlldmUuXG4gICAqICAgVGhlIGZpcnN0IHBhcmFtZXRlciBpcyBhbHdheXMgYW4gZXJyb3IgY2FsbGJhY2suXG4gICAqL1xuXG4gIHB1YmxpYyBpbmNsdWRlKGNhbGxiYWNrOiAoZXJyOiBFcnJvciwgLi4ubW9kZWxzOiAoTW9kZWwgfCBNb2RlbEFycmF5KVtdKSA9PiB2b2lkKSB7XG5cbiAgICBsZXQgZGIgPSB0aGlzLmRiO1xuXG4gICAgLy8gbGVnYWN5IHN1cHBvcnRcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgZGIgPSBhcmd1bWVudHNbMF07XG4gICAgICBjYWxsYmFjayA9IGFyZ3VtZW50c1sxXTtcbiAgICB9XG5cbiAgICBsZXQgam9pbk5hbWVzID0gdXRpbGl0aWVzLmdldEZ1bmN0aW9uUGFyYW1ldGVycyhjYWxsYmFjayk7XG4gICAgam9pbk5hbWVzID0gam9pbk5hbWVzLnNsaWNlKDEpO1xuXG4gICAgaWYgKCFqb2luTmFtZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHZhbGlkIHJlbGF0aW9uc2hpcHMgKDFzdCBwYXJhbWV0ZXIgaXMgZXJyb3IpJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaW52YWxpZEpvaW5OYW1lcyA9IGpvaW5OYW1lcy5maWx0ZXIoKHI6IHN0cmluZykgPT4gIXRoaXMucmVsYXRpb25zaGlwKHIpKTtcblxuICAgIGlmIChpbnZhbGlkSm9pbk5hbWVzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBKb2lucyBcIiR7aW52YWxpZEpvaW5OYW1lcy5qb2luKCdcIiwgXCInKX1cIiBmb3IgbW9kZWwgXCIke3RoaXMuY29uc3RydWN0b3IubmFtZX1cIiBkbyBub3QgZXhpc3QuYCk7XG4gICAgfVxuXG4gICAgbGV0IHF1ZXJ5OiBDb21wb3NlciA9ICg8YW55PiB0aGlzLmNvbnN0cnVjdG9yKS5xdWVyeSgpLndoZXJlKHsgaWQ6IHRoaXMuZ2V0KCdpZCcpIH0pO1xuXG4gICAgam9pbk5hbWVzLmZvckVhY2goKGpvaW5OYW1lOiBzdHJpbmcpID0+IHF1ZXJ5ID0gcXVlcnkuam9pbihqb2luTmFtZSkpO1xuXG4gICAgcXVlcnkuZW5kKChlcnIsIG1vZGVscykgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1vZGVscyB8fCAhbW9kZWxzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdDb3VsZCBub3QgZmV0Y2ggcGFyZW50JykpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtb2RlbCA9IG1vZGVsc1swXTtcbiAgICAgIGNvbnN0IGpvaW5zID0gam9pbk5hbWVzLm1hcCgoam9pbk5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBqb2luID0gbW9kZWwuam9pbmVkKGpvaW5OYW1lKTtcbiAgICAgICAgam9pbiAmJiB0aGlzLnNldEpvaW5lZChqb2luTmFtZSwgPE1vZGVsQXJyYXk+IGpvaW4pO1xuICAgICAgICByZXR1cm4gam9pbjtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkodGhpcywgW251bGxdLmNvbmNhdChqb2lucykpO1xuXG4gICAgfSk7XG5cbiAgfTtcblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHBsYWluIG9iamVjdCBmcm9tIHRoZSBNb2RlbCwgd2l0aCBwcm9wZXJ0aWVzIG1hdGNoaW5nIGFuIG9wdGlvbmFsIGludGVyZmFjZVxuICAgKiBAcGFyYW0ge0FycmF5fSBhcnJJbnRlcmZhY2UgSW50ZXJmYWNlIHRvIHVzZSBmb3Igb2JqZWN0IGNyZWF0aW9uXG4gICAqL1xuICBwdWJsaWMgdG9PYmplY3QoYXJySW50ZXJmYWNlPzogYW55W10pIHtcblxuICAgIGNvbnN0IG9iajogYW55ID0ge307XG5cbiAgICBhcnJJbnRlcmZhY2UgPSBhcnJJbnRlcmZhY2UgfHxcbiAgICAgIHRoaXMuZmllbGRMaXN0KClcbiAgICAgIC5jb25jYXQodGhpcy5fY2FsY3VsYXRpb25zTGlzdClcbiAgICAgIC5maWx0ZXIoa2V5ID0+ICF0aGlzLl9oaWRlc1trZXldKTtcblxuICAgIGFyckludGVyZmFjZS5mb3JFYWNoKGtleSA9PiB7XG5cbiAgICAgIGlmICh0aGlzLl9oaWRlc1trZXldKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGpvaW5PYmplY3Q6IE1vZGVsT3JBcnJheTtcblxuICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdvYmplY3QnICYmIGtleSAhPT0gbnVsbCkge1xuICAgICAgICBjb25zdCBzdWJJbnRlcmZhY2UgPSBrZXk7XG4gICAgICAgIGtleSA9IE9iamVjdC5rZXlzKGtleSlbMF07XG4gICAgICAgIGpvaW5PYmplY3QgPSB0aGlzLl9qb2luc0NhY2hlW2tleV07XG4gICAgICAgIGNvbnN0IGludGVyZmFjZUtleSA9IHN1YkludGVyZmFjZVtrZXldO1xuICAgICAgICBpZiAoam9pbk9iamVjdCkge1xuICAgICAgICAgIGNvbnN0IHRoaW5nID0gKDxNb2RlbD5qb2luT2JqZWN0KS50b09iamVjdChpbnRlcmZhY2VLZXkpO1xuICAgICAgICAgIG9ialtrZXldID0gdGhpbmc7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fZGF0YVtrZXldICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgb2JqW2tleV0gPSB0aGlzLl9kYXRhW2tleV07XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX2NhbGN1bGF0aW9uc1trZXldICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgb2JqW2tleV0gPSB0aGlzLmNhbGN1bGF0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmIChqb2luT2JqZWN0ID0gdGhpcy5fam9pbnNDYWNoZVtrZXldKSB7XG4gICAgICAgIG9ialtrZXldID0gKDxNb2RlbD5qb2luT2JqZWN0KS50b09iamVjdCgpO1xuICAgICAgfVxuXG4gICAgfSk7XG5cbiAgICByZXR1cm4gb2JqO1xuXG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSB0YWJsZSBuYW1lIGZvciB0aGUgbW9kZWwuXG4gICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICovXG4gIHB1YmxpYyB0YWJsZU5hbWUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3RhYmxlO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZSBpZiB0aGUgbW9kZWwgaGFzIGEgc3BlY2lmaWVkIGZpZWxkLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmllbGRcbiAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICovXG4gIHB1YmxpYyBoYXNGaWVsZChmaWVsZDogc3RyaW5nKSB7XG4gICAgcmV0dXJuICEhdGhpcy5fY29sdW1uTG9va3VwW2ZpZWxkXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSB0aGUgc2NoZW1hIGZpZWxkIGRhdGEgZm9yIHRoZSBzcGVjaWZpZWQgZmllbGRcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkXG4gICAqIEByZXR1cm4ge09iamVjdH1cbiAgICovXG4gIHB1YmxpYyBnZXRGaWVsZERhdGEoZmllbGQ6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2x1bW5Mb29rdXBbZmllbGRdO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHJpZXZlIHRoZSBzY2hlbWEgZGF0YSB0eXBlIGZvciB0aGUgc3BlY2lmaWVkIGZpZWxkXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZFxuICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAqL1xuICBwdWJsaWMgZ2V0RGF0YVR5cGVPZihmaWVsZDogc3RyaW5nKToge1xuICAgIGNvbnZlcnQ6IEZ1bmN0aW9uO1xuICB9IHtcbiAgICBjb25zdCBrZXk6IHN0cmluZyA9IHRoaXMuX2NvbHVtbkxvb2t1cFtmaWVsZF0udHlwZTtcbiAgICByZXR1cm4gRGF0YVR5cGVzW2tleV07XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIHdoZXRoZXIgb3Igbm90IHRoaXMgZmllbGQgaXMgYW4gQXJyYXkgKFBvc3RncmVTUUwgc3VwcG9ydHMgdGhpcylcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgaXNGaWVsZEFycmF5KGZpZWxkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWVsZERhdGEgPSB0aGlzLl9jb2x1bW5Mb29rdXBbZmllbGRdO1xuICAgIHJldHVybiAhIShmaWVsZERhdGEgJiYgZmllbGREYXRhLnByb3BlcnRpZXMgJiYgZmllbGREYXRhLnByb3BlcnRpZXMuYXJyYXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZSB3aGV0aGVyIG9yIG5vdCB0aGlzIGZpZWxkIGlzIGEgcHJpbWFyeSBrZXkgaW4gb3VyIHNjaGVtYVxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmllbGRcbiAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICovXG4gIHB1YmxpYyBpc0ZpZWxkUHJpbWFyeUtleShmaWVsZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZmllbGREYXRhID0gdGhpcy5fY29sdW1uTG9va3VwW2ZpZWxkXTtcbiAgICByZXR1cm4gISEoZmllbGREYXRhICYmIGZpZWxkRGF0YS5wcm9wZXJ0aWVzICYmIGZpZWxkRGF0YS5wcm9wZXJ0aWVzLnByaW1hcnlfa2V5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSB0aGUgZGVmYXVsdFZhbHVlIGZvciB0aGlzIGZpZWxkIGZyb20gb3VyIHNjaGVtYVxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmllbGRcbiAgICogQHJldHVybiB7YW55fVxuICAgKi9cbiAgcHVibGljIGZpZWxkRGVmYXVsdFZhbHVlKGZpZWxkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWVsZERhdGEgPSB0aGlzLl9jb2x1bW5Mb29rdXBbZmllbGRdO1xuICAgIHJldHVybiBmaWVsZERhdGEgJiYgZmllbGREYXRhLnByb3BlcnRpZXMgPyBmaWVsZERhdGEucHJvcGVydGllcy5kZWZhdWx0VmFsdWUgOiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHJpZXZlIGFuIGFycmF5IG9mIGZpZWxkcyBmb3Igb3VyIG1vZGVsXG4gICAqIEByZXR1cm4ge0FycmF5fVxuICAgKi9cbiAgcHVibGljIGZpZWxkTGlzdCgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sdW1uTmFtZXMuc2xpY2UoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSBvdXIgZmllbGQgc2NoZW1hIGRlZmluaXRpb25zXG4gICAqIEByZXR1cm4ge0FycmF5fVxuICAgKi9cbiAgcHVibGljIGZpZWxkRGVmaW5pdGlvbnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbHVtbnMuc2xpY2UoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgYW4gZXJyb3IgZm9yIGEgc3BlY2lmaWVkIGZpZWxkIChzdXBwb3J0cyBtdWx0aXBsZSBlcnJvcnMpXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIHNwZWNpZmllZCBmaWVsZCBmb3Igd2hpY2ggdG8gY3JlYXRlIHRoZSBlcnJvciAob3IgJyonIGZvciBnZW5lcmljKVxuICAgKiBAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSBUaGUgZXJyb3IgbWVzc2FnZVxuICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgKi9cbiAgcHVibGljIHNldEVycm9yKGtleTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9lcnJvcnNba2V5XSA9IHRoaXMuX2Vycm9yc1trZXldIHx8IFtdO1xuICAgIHRoaXMuX2Vycm9yc1trZXldLnB1c2gobWVzc2FnZSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIGFsbCBlcnJvcnMgZm9yIGEgc3BlY2lmaWVkIGZpZWxkXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIHNwZWNpZmllZCBmaWVsZCBmb3Igd2hpY2ggdG8gY3JlYXRlIHRoZSBlcnJvciAob3IgJyonIGZvciBnZW5lcmljKVxuICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgKi9cbiAgcHVibGljIGNsZWFyRXJyb3Ioa2V5OiBzdHJpbmcpIHtcbiAgICBkZWxldGUgdGhpcy5fZXJyb3JzW2tleV07XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwdWJsaWMgX19nZW5lcmF0ZVNhdmVRdWVyeV9fKCkge1xuXG4gICAgbGV0IHF1ZXJ5OiBhbnk7XG4gICAgbGV0IGNvbHVtbnM6IGFueTtcbiAgICBjb25zdCBkYiA9IHRoaXMuZGI7XG5cbiAgICBpZiAoIXRoaXMuaW5TdG9yYWdlKCkpIHtcblxuICAgICAgY29sdW1ucyA9IHRoaXMuZmllbGRMaXN0KCkuZmlsdGVyKHYgPT4gIXRoaXMuaXNGaWVsZFByaW1hcnlLZXkodikgJiYgdGhpcy5nZXQodiwgdHJ1ZSkgIT09IG51bGwpO1xuICAgICAgcXVlcnkgPSBkYi5hZGFwdGVyLmdlbmVyYXRlSW5zZXJ0UXVlcnkodGhpcy5zY2hlbWEudGFibGUsIGNvbHVtbnMpO1xuXG4gICAgfSBlbHNlIHtcblxuICAgICAgY29sdW1ucyA9IFsnaWQnXS5jb25jYXQodGhpcy5jaGFuZ2VkRmllbGRzKCkuZmlsdGVyKHYgPT4gIXRoaXMuaXNGaWVsZFByaW1hcnlLZXkodikpKTtcbiAgICAgIHF1ZXJ5ID0gZGIuYWRhcHRlci5nZW5lcmF0ZVVwZGF0ZVF1ZXJ5KHRoaXMuc2NoZW1hLnRhYmxlLCBjb2x1bW5zKTtcblxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzcWw6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBjb2x1bW5zLm1hcCgodjogYW55KSA9PiBkYi5hZGFwdGVyLnNhbml0aXplKHRoaXMuZ2V0RmllbGREYXRhKHYpLnR5cGUsIHRoaXMuZ2V0KHYpKSlcbiAgICB9O1xuXG4gIH1cblxuICAvKipcbiAgICogUnVucyBhbGwgdmVyaWZpY2F0aW9ucyBiZWZvcmUgc2F2aW5nXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIE1ldGhvZCB0byBleGVjdXRlIHVwb24gY29tcGxldGlvbi4gUmV0dXJucyB0cnVlIGlmIE9LLCBmYWxzZSBpZiBmYWlsZWRcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHB1YmxpYyBfX3ZlcmlmeV9fKGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgaWYgKHRoaXMuaGFzRXJyb3JzKCkpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXMsIHRoaXMuZXJyb3JPYmplY3QoKSk7XG4gICAgfVxuXG4gICAgLy8gUnVuIHRocm91Z2ggdmVyaWZpY2F0aW9ucyBpbiBvcmRlciB0aGV5IHdlcmUgYWRkZWRcbiAgICBhc3luYy5zZXJpZXMoXG4gICAgICB0aGlzLl92ZXJpZmljYXRpb25zTGlzdC5tYXAoKHZlcmlmaWNhdGlvbjogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiAoY2FsbGJhY2s6IEZ1bmN0aW9uKSA9PiB7XG4gICAgICAgICAgdmVyaWZpY2F0aW9uLmFjdGlvbi5hcHBseShcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICB2ZXJpZmljYXRpb24uZmllbGRzXG4gICAgICAgICAgICAgIC5tYXAoKGZpZWxkOiBzdHJpbmcpID0+IHRoaXMuZ2V0KGZpZWxkKSlcbiAgICAgICAgICAgICAgLmNvbmNhdCgoYm9vbDogYm9vbGVhbikgPT4gY2FsbGJhY2soYm9vbCA/IG51bGwgOiBuZXcgRXJyb3IodmVyaWZpY2F0aW9uLm1lc3NhZ2UpKSlcbiAgICAgICAgICApO1xuICAgICAgICB9O1xuICAgICAgfSksXG4gICAgICAoZXJyKSA9PiB7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXMsIGVycik7XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhudWxsKTtcblxuICAgICAgfVxuICAgICk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBTYXZlcyBtb2RlbCB0byBkYXRhYmFzZVxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBNZXRob2QgdG8gZXhlY3V0ZSB1cG9uIGNvbXBsZXRpb24sIHJldHVybnMgZXJyb3IgaWYgZmFpbGVkIChpbmNsdWRpbmcgdmFsaWRhdGlvbnMgZGlkbid0IHBhc3MpXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIF9fc2F2ZV9fKGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgbGV0IGRiID0gdGhpcy5kYjtcblxuICAgIC8vIExlZ2FjeSAtLS0gRklYTUU6IERlcHJlY2F0ZWQuIENhbiByZW1vdmUgZm9yIDEuMFxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgICBkYiA9IGFyZ3VtZW50c1swXTtcbiAgICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gKCkgPT4ge307XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZmllbGRMaXN0KCkuaW5kZXhPZigndXBkYXRlZF9hdCcpICE9PSAtMSkge1xuICAgICAgdGhpcy5zZXQoJ3VwZGF0ZWRfYXQnLCBuZXcgRGF0ZSgpKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHRoaXMuX19nZW5lcmF0ZVNhdmVRdWVyeV9fKCk7XG5cbiAgICBkYi5xdWVyeShcbiAgICAgIHF1ZXJ5LnNxbCxcbiAgICAgIHF1ZXJ5LnBhcmFtcyxcbiAgICAgIChlcnI6IEVycm9yLCByZXN1bHQ6IGFueSkgPT4ge1xuXG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB0aGlzLnNldEVycm9yKCdfcXVlcnknLCBlcnIubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0LnJvd3MubGVuZ3RoICYmIHRoaXMuX19sb2FkX18ocmVzdWx0LnJvd3NbMF0sIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCB0aGlzLmVycm9yT2JqZWN0KCkpO1xuXG4gICAgICB9XG4gICAgKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIERlc3Ryb3lzIG1vZGVsIGFuZCBjYXNjYWRlcyBhbGwgZGVsZXRlcy5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgbWV0aG9kIHRvIHJ1biB1cG9uIGNvbXBsZXRpb25cbiAgICovXG4gIHB1YmxpYyBkZXN0cm95Q2FzY2FkZShjYWxsYmFjazogRnVuY3Rpb24pIHtcblxuICAgIE1vZGVsQXJyYXkuZnJvbShbdGhpc10pLmRlc3Ryb3lDYXNjYWRlKGNhbGxiYWNrKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIExvZ2ljIHRvIGV4ZWN1dGUgYmVmb3JlIGEgbW9kZWwgZ2V0cyBkZXN0cm95ZWQuIEludGVuZGVkIHRvIGJlIG92ZXJ3cml0dGVuIHdoZW4gaW5oZXJpdGVkLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBJbnZva2Ugd2l0aCBmaXJzdCBhcmd1bWVudCBhcyBhbiBlcnJvciBpZiBmYWlsdXJlLlxuICAgKi9cbiAgcHVibGljIGJlZm9yZURlc3Ryb3koY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cbiAgICBjYWxsYmFjayhudWxsLCB0aGlzKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIExvZ2ljIHRvIGV4ZWN1dGUgYWZ0ZXIgYSBtb2RlbCBpcyBkZXN0cm95ZWQuIEludGVuZGVkIHRvIGJlIG92ZXJ3cml0dGVuIHdoZW4gaW5oZXJpdGVkLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBJbnZva2Ugd2l0aCBmaXJzdCBhcmd1bWVudCBhcyBhbiBlcnJvciBpZiBmYWlsdXJlLlxuICAgKi9cbiAgcHVibGljIGFmdGVyRGVzdHJveShjYWxsYmFjazogRnVuY3Rpb24pIHtcblxuICAgIGNhbGxiYWNrKG51bGwsIHRoaXMpO1xuXG4gIH1cblxuICAvKipcbiAgICogRGVzdHJveXMgbW9kZWwgcmVmZXJlbmNlIGluIGRhdGFiYXNlLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0gZXJyLCB7Tm9kYWwuTW9kZWx9IG1vZGVsKX0gY2FsbGJhY2tcbiAgICogICBNZXRob2QgdG8gZXhlY3V0ZSB1cG9uIGNvbXBsZXRpb24sIHJldHVybnMgZXJyb3IgaWYgZmFpbGVkXG4gICAqL1xuICBwdWJsaWMgZGVzdHJveShjYWxsYmFjazogRnVuY3Rpb24pIHtcblxuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgKCgpID0+IHt9KTtcblxuICAgIGFzeW5jLnNlcmllcyhbXG4gICAgICB0aGlzLmJlZm9yZURlc3Ryb3ksXG4gICAgICB0aGlzLl9fZGVzdHJveV9fLFxuICAgICAgdGhpcy5hZnRlckRlc3Ryb3lcbiAgICBdLm1hcChmID0+IGYuYmluZCh0aGlzKSksIChlcnIpID0+IHtcbiAgICAgIGNhbGxiYWNrKGVyciB8fCBudWxsLCB0aGlzKTtcbiAgICB9KTtcblxuICB9XG5cbiAgLyoqXG4gICAqIExvZ2ljIHRvIGV4ZWN1dGUgYmVmb3JlIGEgbW9kZWwgc2F2ZXMuIEludGVuZGVkIHRvIGJlIG92ZXJ3cml0dGVuIHdoZW4gaW5oZXJpdGVkLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBJbnZva2Ugd2l0aCBmaXJzdCBhcmd1bWVudCBhcyBhbiBlcnJvciBpZiBmYWlsdXJlLlxuICAgKi9cbiAgcHVibGljIGJlZm9yZVNhdmUoY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cbiAgICBjYWxsYmFjayhudWxsLCB0aGlzKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIExvZ2ljIHRvIGV4ZWN1dGUgYWZ0ZXIgYSBtb2RlbCBzYXZlcy4gSW50ZW5kZWQgdG8gYmUgb3ZlcndyaXR0ZW4gd2hlbiBpbmhlcml0ZWQuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEludm9rZSB3aXRoIGZpcnN0IGFyZ3VtZW50IGFzIGFuIGVycm9yIGlmIGZhaWx1cmUuXG4gICAqL1xuICBwdWJsaWMgYWZ0ZXJTYXZlKGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgY2FsbGJhY2sobnVsbCwgdGhpcyk7XG5cbiAgfVxuXG4gIC8qKlxuICDCoCogU2F2ZSBhIG1vZGVsIChleGVjdXRlIGJlZm9yZVNhdmUgYW5kIGFmdGVyU2F2ZSlcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgdG8gZXhlY3V0ZSB1cG9uIGNvbXBsZXRpb25cbiAgICovXG4gIHB1YmxpYyBzYXZlKGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCAoKCkgPT4ge30pO1xuXG4gICAgYXN5bmMuc2VyaWVzKFtcbiAgICAgIHRoaXMuX192ZXJpZnlfXyxcbiAgICAgIHRoaXMuYmVmb3JlU2F2ZSxcbiAgICAgIHRoaXMuX19zYXZlX18sXG4gICAgICB0aGlzLmFmdGVyU2F2ZVxuICAgIF0ubWFwKGYgPT4gZi5iaW5kKHRoaXMpKSwgKGVycikgPT4ge1xuICAgICAgY2FsbGJhY2soZXJyIHx8IG51bGwsIHRoaXMpO1xuICAgIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogUnVucyBhbiB1cGRhdGUgcXVlcnkgZm9yIHRoaXMgc3BlY2lmaWMgbW9kZWwgaW5zdGFuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IGZpZWxkcyBLZXktdmFsdWUgcGFpcnMgb2YgZmllbGRzIHRvIHVwZGF0ZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayB0byBleGVjdXRlIHVwb24gY29tcGxldGlvblxuICAgKi9cbiAgcHVibGljIHVwZGF0ZShmaWVsZHM6IElBbnlPYmplY3QsIGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCAoKCkgPT4geyB9KTtcblxuICAgIC8vIFNsaWdodCB3b3JrYXJvdW5kIHVudGlsIFR5cGVzY3JpcHQgY29uc3RydWN0b3IgdHlwZSBpcyBjb3JyZWN0XG4gICAgKDxhbnk+IHRoaXMuY29uc3RydWN0b3IpLnF1ZXJ5KClcbiAgICAgIC53aGVyZSh7IGlkOiB0aGlzLmdldCgnaWQnKSB9KVxuICAgICAgLnVwZGF0ZShmaWVsZHMsIChlcnI6IEVycm9yLCBtb2RlbHM6IGFueVtdKSA9PiBjYWxsYmFjayhlcnIsIG1vZGVscyAmJiBtb2RlbHNbMF0pKTtcblxuICB9XG5cbiAgLypcbiAgKiBGaW5kcyBhIG1vZGVsIHdpdGggYSBwcm92aWRlZCBpZCwgb3RoZXJ3aXNlIHJldHVybnMgYSBub3RGb3VuZCBlcnJvci5cbiAgKiBAcGFyYW0ge251bWJlcn0gaWQgVGhlIGlkIG9mIHRoZSBtb2RlbCB5b3UncmUgbG9va2luZyBmb3JcbiAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0gZXJyLCB7Tm9kYWwuTW9kZWx9IG1vZGVsKX0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGV4ZWN1dGUgdXBvbiBjb21wbGV0aW9uXG4gICovXG4gIHB1YmxpYyBzdGF0aWMgZmluZChpZDogbnVtYmVyLCBjYWxsYmFjazogKGVycjogSUV4dGVuZGVkRXJyb3IsIG1vZGVsPzogTW9kZWwpID0+IHZvaWQpIHtcblxuICAgIGxldCBkYiA9IHRoaXMucHJvdG90eXBlLmRiO1xuXG4gICAgLy8gbGVnYWN5IHN1cHBvcnRcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgZGIgPSBhcmd1bWVudHNbMF07XG4gICAgICBpZCA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzJdO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgQ29tcG9zZXIodGhpcylcbiAgICAgIC53aGVyZSh7IGlkOiBpZCB9KVxuICAgICAgLmVuZCgoZXJyOiBFcnJvciwgbW9kZWxzOiBNb2RlbEFycmF5KSA9PiB7XG4gICAgICAgIGlmICghZXJyICYmICFtb2RlbHMubGVuZ3RoKSB7XG5cbiAgICAgICAgICBjb25zdCBlcnI6IElFeHRlbmRlZEVycm9yID0gbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCAke3RoaXMubmFtZX0gd2l0aCBpZCBcIiR7aWR9XCIuYCk7XG4gICAgICAgICAgZXJyLm5vdEZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrKGVyciwgbW9kZWxzWzBdKTtcblxuICAgICAgfSk7XG5cbiAgfVxuXG4gIC8qXG4gICogRmluZHMgYSBtb2RlbCB3aXRoIGEgcHJvdmlkZWQgZmllbGQsIHZhbHVlIHBhaXIuIFJldHVybnMgdGhlIGZpcnN0IGZvdW5kLlxuICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBOYW1lIG9mIHRoZSBmaWVsZFxuICAqIEBwYXJhbSB7YW55fSB2YWx1ZSBWYWx1ZSBvZiB0aGUgbmFtZWQgZmllbGQgdG8gY29tcGFyZSBhZ2FpbnN0XG4gICogQHBhcmFtIHtmdW5jdGlvbih7RXJyb3J9IGVyciwge05vZGFsLk1vZGVsfSBtb2RlbCl9IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBleGVjdXRlIHVwb24gY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgc3RhdGljIGZpbmRCeShmaWVsZDogc3RyaW5nLCB2YWx1ZTogYW55LCBjYWxsYmFjazogKGVycjogSUV4dGVuZGVkRXJyb3IsIG1vZGVsPzogTW9kZWwpID0+IHZvaWQpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIFtmaWVsZF06IHZhbHVlXG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgQ29tcG9zZXIodGhpcylcbiAgICAgIC53aGVyZShxdWVyeSlcbiAgICAgIC5lbmQoKGVycjogRXJyb3IsIG1vZGVsczogTW9kZWxBcnJheSkgPT4ge1xuXG4gICAgICAgIGlmICghZXJyICYmICFtb2RlbHMubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgZXJyOiBJRXh0ZW5kZWRFcnJvciA9IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgJHt0aGlzLm5hbWV9IHdpdGggJHtmaWVsZH0gXCIke3ZhbHVlfVwiLmApO1xuICAgICAgICAgIGVyci5ub3RGb3VuZCA9IHRydWU7XG4gICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnIsIG1vZGVsc1swXSk7XG5cbiAgICAgIH0pO1xuXG4gIH1cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgbW9kZWwgaW5zdGFuY2UgdXNpbmcgdGhlIHByb3ZpZGVkIGRhdGEuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIFRoZSBkYXRhIHRvIGxvYWQgaW50byB0aGUgb2JqZWN0LlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0gZXJyLCB7Tm9kYWwuTW9kZWx9IG1vZGVsKX0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGV4ZWN1dGUgdXBvbiBjb21wbGV0aW9uXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGNyZWF0ZShkYXRhOiBJQW55T2JqZWN0LCBjYWxsYmFjazogKGVycjogSUV4dGVuZGVkRXJyb3IsIG1vZGVsPzogTW9kZWwpID0+IHZvaWQpIHtcblxuICAgIGNvbnN0IG1vZGVsID0gbmV3IHRoaXMoZGF0YSk7XG4gICAgbW9kZWwuc2F2ZShjYWxsYmFjayk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBGaW5kcyBhIG1vZGVsIHdpdGggYSBwcm92aWRlZCBmaWVsZCwgdmFsdWUgcGFpci4gUmV0dXJucyB0aGUgZmlyc3QgZm91bmQuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBOYW1lIG9mIHRoZSBmaWVsZFxuICAgKiBAcGFyYW0ge29iamVjdH0gZGF0YSBLZXktdmFsdWUgcGFpcnMgb2YgTW9kZWwgY3JlYXRpb24gZGF0YS4gV2lsbCB1c2UgYXBwcm9wcmlhdGUgdmFsdWUgdG8gcXVlcnkgZm9yIGJhc2VkIG9uIFwiZmllbGRcIiBwYXJhbWV0ZXJlLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0gZXJyLCB7Tm9kYWwuTW9kZWx9IG1vZGVsKX0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGV4ZWN1dGUgdXBvbiBjb21wbGV0aW9uXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGZpbmRPckNyZWF0ZUJ5KGZpZWxkOiBzdHJpbmcsIGRhdGE6IElBbnlPYmplY3QsIGNhbGxiYWNrOiAoZXJyOiBJRXh0ZW5kZWRFcnJvciB8IG51bGwsIG1vZGVsPzogTW9kZWwpID0+IHZvaWQpIHtcblxuICAgIHRoaXMuZmluZEJ5KGZpZWxkLCBkYXRhW2ZpZWxkXSwgKGVycjogSUV4dGVuZGVkRXJyb3IsIG1vZGVsOiBNb2RlbCkgPT4ge1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGlmIChlcnIubm90Rm91bmQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGUoZGF0YSwgY2FsbGJhY2spO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgbW9kZWwpO1xuICAgICAgfVxuXG4gICAgfSk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBGaW5kcyBhbmQgdXBkYXRlcyBhIG1vZGVsIHdpdGggYSBzcGVjaWZpZWQgaWQuIFJldHVybiBhIG5vdEZvdW5kIGVycm9yIGlmIG1vZGVsIGRvZXMgbm90IGV4aXN0LlxuICAgKiBAcGFyYW0ge251bWJlcn0gaWQgVGhlIGlkIG9mIHRoZSBtb2RlbCB5b3UncmUgbG9va2luZyBmb3JcbiAgICogQHBhcmFtIHtvYmplY3R9IGRhdGEgVGhlIGRhdGEgdG8gbG9hZCBpbnRvIHRoZSBvYmplY3QuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb24oe0Vycm9yfSBlcnIsIHtOb2RhbC5Nb2RlbH0gbW9kZWwpfSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gZXhlY3V0ZSB1cG9uIGNvbXBsZXRpb25cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgdXBkYXRlKGlkOiBudW1iZXIsIGRhdGE6IElBbnlPYmplY3QsIGNhbGxiYWNrOiAoZXJyOiBJRXh0ZW5kZWRFcnJvciwgbW9kZWw/OiBNb2RlbCkgPT4gdm9pZCkge1xuXG4gICAgdGhpcy5maW5kKGlkLCAoZXJyOiBJRXh0ZW5kZWRFcnJvciwgbW9kZWw6IE1vZGVsKSA9PiB7XG5cbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG5cbiAgICAgIG1vZGVsLnJlYWQoZGF0YSk7XG4gICAgICBtb2RlbC5zYXZlKGNhbGxiYWNrKTtcblxuICAgIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogRmluZHMgYW5kIGRlc3Ryb3lzIGEgbW9kZWwgd2l0aCBhIHNwZWNpZmllZCBpZC4gUmV0dXJuIGEgbm90Rm91bmQgZXJyb3IgaWYgbW9kZWwgZG9lcyBub3QgZXhpc3QuXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBpZCBUaGUgaWQgb2YgdGhlIG1vZGVsIHlvdSdyZSBsb29raW5nIGZvclxuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0gZXJyLCB7Tm9kYWwuTW9kZWx9IG1vZGVsKX0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGV4ZWN1dGUgdXBvbiBjb21wbGV0aW9uXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGRlc3Ryb3koaWQ6IG51bWJlciwgY2FsbGJhY2s6IChlcnI6IElFeHRlbmRlZEVycm9yLCBtb2RlbD86IE1vZGVsKSA9PiB2b2lkKSB7XG4gICAgdGhpcy5maW5kKGlkLCAoZXJyOiBJRXh0ZW5kZWRFcnJvciwgbW9kZWw6IE1vZGVsKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBtb2RlbC5kZXN0cm95KGNhbGxiYWNrKTtcblxuICAgIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBDb21wb3NlciAoT1JNKSBpbnN0YW5jZSB0byBiZWdpbiBhIG5ldyBxdWVyeS5cbiAgICogQHBhcmFtIHtvcHRpb25hbCBOb2RhbC5EYXRhYmFzZX0gZGIgRGVwcmVjYXRlZCAtIHByb3ZpZGUgYSBkYXRhYmFzZSB0byBxdWVyeSBmcm9tLiBTZXQgdGhlIG1vZGVsJ3MgZGIgaW4gaXRzIGNvbnN0cnVjdG9yIGZpbGUsIGluc3RlYWQuXG4gICAqIEByZXR1cm4ge05vZGFsLkNvbXBvc2VyfVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBxdWVyeShkYj86IERhdGFiYXNlKTogQ29tcG9zZXIge1xuXG4gICAgZGIgPSBkYiB8fCB0aGlzLnByb3RvdHlwZS5kYjtcbiAgICByZXR1cm4gbmV3IENvbXBvc2VyKHRoaXMpO1xuXG4gIH1cblxuICAvKipcbiAgwqAqIEdldCB0aGUgbW9kZWwncyB0YWJsZSBuYW1lXG4gIMKgKiBAcmV0dXJuIHtzdHJpbmd9XG4gIMKgKi9cbiAgcHVibGljIHN0YXRpYyB0YWJsZSgpIHtcbiAgICByZXR1cm4gdGhpcy5wcm90b3R5cGUuc2NoZW1hLnRhYmxlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgbW9kZWwncyBjb2x1bW4gZGF0YVxuICAgKiBAcmV0dXJuIHtBcnJheX1cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgY29sdW1ucygpIHtcbiAgICByZXR1cm4gdGhpcy5wcm90b3R5cGUuc2NoZW1hLmNvbHVtbnM7XG4gIH07XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgbW9kZWwncyBjb2x1bW4gbmFtZXMgKGZpZWxkcylcbiAgICogQHJldHVybiB7QXJyYXl9XG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGNvbHVtbk5hbWVzKCkge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbnMoKS5tYXAodiA9PiB2Lm5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgbW9kZWwncyBjb2x1bW4gbG9va3VwIGRhdGFcbiAgICogQHJldHVybiB7T2JqZWN0fVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBjb2x1bW5Mb29rdXAoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1ucygpLnJlZHVjZSgoYWdncmVnYXRlZENvbHVtbnM6IElBbnlPYmplY3QsIGN1cnJlbnRJdGVtOiBJQ29sdW1uKSA9PiB7XG4gICAgICBhZ2dyZWdhdGVkQ29sdW1uc1tjdXJyZW50SXRlbS5uYW1lXSA9IGN1cnJlbnRJdGVtO1xuICAgICAgcmV0dXJuIGFnZ3JlZ2F0ZWRDb2x1bW5zO1xuICAgIH0sIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiB0aGUgbW9kZWwgaGFzIGEgY29sdW1uIG5hbWUgaW4gaXRzIHNjaGVtYVxuICAgKiBAcGFyYW0ge3N0cmluZ30gY29sdW1uTmFtZVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBoYXNDb2x1bW4oY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuICEhdGhpcy5jb2x1bW4oY29sdW1uTmFtZSk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIHRoZSBjb2x1bW4gc2NoZW1hIGRhdGEgZm9yIGEgZ2l2ZW4gbmFtZVxuICAgKiBAcGFyYW0ge3N0cmluZ30gY29sdW1uTmFtZVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBjb2x1bW4oY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMucHJvdG90eXBlLl9jb2x1bW5Mb29rdXBbY29sdW1uTmFtZV07XG4gIH1cblxuICAvLyBzdGF0aWMgdG9SZXNvdXJjZSByZW1vdmVkLiBJdCBjYWxsZWQgZnVuY3Rpb25zIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IGFuZCB3YXMgRGVwcmVjYXRlZFxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIGRhdGFiYXNlIHRvIGJlIHVzZWQgZm9yIHRoaXMgbW9kZWxcbiAgICogQHBhcmFtIHtOb2RhbC5EYXRhYmFzZX0gZGJcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgc2V0RGF0YWJhc2UoZGI6IERhdGFiYXNlKSB7XG5cbiAgICB0aGlzLnByb3RvdHlwZS5kYiA9IGRiO1xuXG4gIH1cblxuICAvKipcbiAgICogU2V0IHRoZSBzY2hlbWEgdG8gYmUgdXNlZCBmb3IgdGhpcyBtb2RlbFxuICAgKiBAcGFyYW0ge09iamVjdH0gc2NoZW1hXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHNldFNjaGVtYShzY2hlbWE6IHtcbiAgICB0YWJsZTogc3RyaW5nO1xuICAgIGNvbHVtbnM6IElDb2x1bW5bXVxuICB9KSB7XG5cbiAgICBpZiAoIXNjaGVtYSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFtcbiAgICAgICAgYENvdWxkIG5vdCBzZXQgU2NoZW1hIGZvciAke3RoaXMubmFtZX0uYCxcbiAgICAgICAgYFBsZWFzZSBtYWtlIHN1cmUgdG8gcnVuIGFueSBvdXRzdGFuZGluZyBtaWdyYXRpb25zLmBcbiAgICAgIF0uam9pbignXFxuJykpO1xuICAgIH1cblxuICAgIHRoaXMucHJvdG90eXBlLnNjaGVtYSA9IHNjaGVtYTtcblxuICAgIHRoaXMucHJvdG90eXBlLl90YWJsZSA9IHRoaXMudGFibGUoKTtcbiAgICB0aGlzLnByb3RvdHlwZS5fY29sdW1ucyA9IHRoaXMuY29sdW1ucygpO1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2x1bW5OYW1lcyA9IHRoaXMuY29sdW1uTmFtZXMoKTtcbiAgICB0aGlzLnByb3RvdHlwZS5fY29sdW1uTG9va3VwID0gdGhpcy5jb2x1bW5Mb29rdXAoKTtcblxuICAgIHRoaXMucHJvdG90eXBlLl9kYXRhID0gdGhpcy5jb2x1bW5OYW1lcygpXG4gICAgICAucmVkdWNlKChhZ2dyZWdhdGVkTmFtZXM6IElBbnlPYmplY3QsIGN1cnJlbnRJdGVtOiBzdHJpbmcpID0+IHtcbiAgICAgICAgYWdncmVnYXRlZE5hbWVzW2N1cnJlbnRJdGVtXSA9IG51bGw7XG4gICAgICAgIHJldHVybiBhZ2dyZWdhdGVkTmFtZXM7XG4gICAgICB9LCB7fSk7XG5cbiAgICB0aGlzLnByb3RvdHlwZS5fY2hhbmdlZCA9IHRoaXMuY29sdW1uTmFtZXMoKVxuICAgICAgLnJlZHVjZSgoYWdncmVnYXRlZE5hbWVzOiBJQW55T2JqZWN0LCBjdXJyZW50SXRlbTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGFnZ3JlZ2F0ZWROYW1lc1tjdXJyZW50SXRlbV0gPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIGFnZ3JlZ2F0ZWROYW1lcztcbiAgICAgIH0sIHt9KTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEZJWE1FXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHJlbGF0aW9uc2hpcHMoKTogUmVsYXRpb25zaGlwTm9kZSB7XG5cbiAgICByZXR1cm4gUmVsYXRpb25zaGlwcy5vZih0aGlzKTtcblxuICB9XG5cbiAgLyoqYFxuICAgKiBGSVhNRVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyByZWxhdGlvbnNoaXAobmFtZTogc3RyaW5nKTogUmVsYXRpb25zaGlwUGF0aCB7XG5cbiAgICB0aGlzLl9yZWxhdGlvbnNoaXBDYWNoZSA9IHRoaXMuX3JlbGF0aW9uc2hpcENhY2hlIHx8IHt9O1xuICAgIHRoaXMuX3JlbGF0aW9uc2hpcENhY2hlW25hbWVdID0gKHRoaXMuX3JlbGF0aW9uc2hpcENhY2hlW25hbWVdIHx8IHRoaXMucmVsYXRpb25zaGlwcygpLmZpbmRFeHBsaWNpdChuYW1lKSk7XG4gICAgcmV0dXJuIHRoaXMuX3JlbGF0aW9uc2hpcENhY2hlW25hbWVdO1xuXG4gIH1cblxuICAvKipcbiAgICogU2V0cyBhIGpvaW5zIHJlbGF0aW9uc2hpcCBmb3IgdGhlIE1vZGVsLiBTZXRzIGpvaW5lZEJ5IHJlbGF0aW9uc2hpcCBmb3IgcGFyZW50LlxuICAgKiBAcGFyYW0ge2NsYXNzIE5vZGFsLk1vZGVsfSBNb2RlbCBUaGUgTW9kZWwgY2xhc3Mgd2hpY2ggeW91ciBjdXJyZW50IG1vZGVsIGJlbG9uZ3MgdG9cbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgKiAgIFwibmFtZVwiOiBUaGUgc3RyaW5nIG5hbWUgb2YgdGhlIHBhcmVudCBpbiB0aGUgcmVsYXRpb25zaGlwIChkZWZhdWx0IHRvIGNhbWVsQ2FzZSBvZiBNb2RlbCBuYW1lKVxuICAgKiAgIFwidmlhXCI6IFdoaWNoIGZpZWxkIGluIGN1cnJlbnQgbW9kZWwgcmVwcmVzZW50cyB0aGlzIHJlbGF0aW9uc2hpcCwgZGVmYXVsdHMgdG8gYCR7bmFtZX1faWRgXG4gICAqICAgXCJhc1wiOiBXaGF0IHRvIGRpc3BsYXkgdGhlIG5hbWUgb2YgdGhlIGNoaWxkIGFzIHdoZW4gam9pbmVkIHRvIHRoZSBwYXJlbnQgKGRlZmF1bHQgdG8gY2FtZWxDYXNlIG9mIGNoaWxkIG5hbWUpXG4gICAqICAgXCJtdWx0aXBsZVwiOiBXaGV0aGVyIHRoZSBjaGlsZCBleGlzdHMgaW4gbXVsdGlwbGVzIGZvciB0aGUgcGFyZW50IChkZWZhdWx0cyB0byBmYWxzZSlcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgam9pbnNUbyhtb2RlbENsYXNzOiB0eXBlb2YgTW9kZWwsIG9wdGlvbnM6IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgdmlhOiBzdHJpbmc7XG4gICAgYXM6IHN0cmluZztcbiAgICBtdWx0aXBsZTogYm9vbGVhbjtcbiAgfSkge1xuXG4gICAgcmV0dXJuIHRoaXMucmVsYXRpb25zaGlwcygpLmpvaW5zVG8obW9kZWxDbGFzcywgb3B0aW9ucyk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSB2YWxpZGF0b3IuIFRoZXNlIHJ1biBzeW5jaHJvbm91c2x5IGFuZCBjaGVjayBldmVyeSB0aW1lIGEgZmllbGQgaXMgc2V0IC8gY2xlYXJlZC5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkIFRoZSBmaWVsZCB5b3UnZCBsaWtlIHRvIHZhbGlkYXRlXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlIHNob3duIGlmIGEgdmFsaWRhdGlvbiBmYWlscy5cbiAgICogQHBhcmFtIHtmdW5jdGlvbih7YW55fSB2YWx1ZSl9IGZuQWN0aW9uIHRoZSB2YWxpZGF0aW9uIHRvIHJ1biAtIGZpcnN0IHBhcmFtZXRlciBpcyB0aGUgdmFsdWUgeW91J3JlIHRlc3RpbmcuXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHZhbGlkYXRlcyhmaWVsZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIGZuQWN0aW9uOiAodmFsdWU6IGFueSkgPT4gdm9pZCkge1xuXG4gICAgaWYgKCF0aGlzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSgnX3ZhbGlkYXRpb25zJykpIHtcbiAgICAgIHRoaXMucHJvdG90eXBlLl92YWxpZGF0aW9ucyA9IHt9O1xuICAgICAgdGhpcy5wcm90b3R5cGUuX3ZhbGlkYXRpb25zTGlzdCA9IFtdO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5wcm90b3R5cGUuX3ZhbGlkYXRpb25zW2ZpZWxkXSkge1xuICAgICAgdGhpcy5wcm90b3R5cGUuX3ZhbGlkYXRpb25zTGlzdC5wdXNoKGZpZWxkKTtcbiAgICB9XG5cbiAgICB0aGlzLnByb3RvdHlwZS5fdmFsaWRhdGlvbnNbZmllbGRdID0gdGhpcy5wcm90b3R5cGUuX3ZhbGlkYXRpb25zW2ZpZWxkXSB8fCBbXTtcbiAgICB0aGlzLnByb3RvdHlwZS5fdmFsaWRhdGlvbnNbZmllbGRdLnB1c2goeyBtZXNzYWdlOiBtZXNzYWdlLCBhY3Rpb246IGZuQWN0aW9uIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHZlcmlmaWVyLiBUaGVzZSBydW4gYXN5bmNocm9ub3VzbHksIHN1cHBvcnQgbXVsdGlwbGUgZmllbGRzLCBhbmQgY2hlY2sgZXZlcnkgdGltZSB5b3UgdHJ5IHRvIHNhdmUgYSBNb2RlbC5cbiAgICogQHBhcmFtIHtzdHJpbmd9IG1lc3NhZ2UgVGhlIGVycm9yIG1lc3NhZ2Ugc2hvd24gaWYgYSB2YWxpZGF0aW9uIGZhaWxzLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBmbkFjdGlvbiBUaGUgYXN5bmNocm9ub3VzIHZlcmlmaWNhdGlvbiBtZXRob2QuIFRoZSBsYXN0IGFyZ3VtZW50IHBhc3NlZCBpcyBhbHdheXMgYSBjYWxsYmFjayxcbiAgICogYW5kIGZpZWxkIG5hbWVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSAgYXJndW1lbnQgbmFtZXMuXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHZlcmlmaWVzKG1lc3NhZ2U6IHN0cmluZywgZm5BY3Rpb246IEZ1bmN0aW9uKSB7XG5cbiAgICBpZiAoIXRoaXMucHJvdG90eXBlLmhhc093blByb3BlcnR5KCdfdmVyaWZpY2F0aW9uc0xpc3QnKSkge1xuICAgICAgdGhpcy5wcm90b3R5cGUuX3ZlcmlmaWNhdGlvbnNMaXN0ID0gW107XG4gICAgfVxuXG4gICAgdGhpcy5wcm90b3R5cGUuX3ZlcmlmaWNhdGlvbnNMaXN0LnB1c2goe1xuICAgICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICAgIGFjdGlvbjogZm5BY3Rpb24sXG4gICAgICBmaWVsZHM6IHV0aWxpdGllcy5nZXRGdW5jdGlvblBhcmFtZXRlcnMoZm5BY3Rpb24pLnNsaWNlKDAsIC0xKVxuICAgIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgY2FsY3VsYXRlZCBmaWVsZCAoaW4gSmF2YVNjcmlwdCkuIE11c3QgYmUgc3luY2hyb25vdXMuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBjYWxjRmllbGQgVGhlIG5hbWUgb2YgdGhlIGNhbGN1bGF0ZWQgZmllbGRcbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gZm5DYWxjdWxhdGUgVGhlIHN5bmNocm9ub3VzIG1ldGhvZCB0byBwZXJmb3JtIGEgY2FsY3VsYXRpb24gZm9yLlxuICAgKiAgIFBhc3MgdGhlIG5hbWVzIG9mIHRoZSAobm9uLWNvbXB1dGVkKSBmaWVsZHMgeW91J2QgbGlrZSB0byB1c2UgYXMgcGFyYW1ldGVycy5cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgY2FsY3VsYXRlcyhjYWxjRmllbGQ6IHN0cmluZywgZm5Db21wdXRlOiBGdW5jdGlvbikge1xuXG4gICAgaWYgKCF0aGlzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSgnX2NhbGN1bGF0aW9ucycpKSB7XG4gICAgICB0aGlzLnByb3RvdHlwZS5fY2FsY3VsYXRpb25zID0ge307XG4gICAgICB0aGlzLnByb3RvdHlwZS5fY2FsY3VsYXRpb25zTGlzdCA9IFtdO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnByb3RvdHlwZS5fY2FsY3VsYXRpb25zW2NhbGNGaWVsZF0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FsY3VsYXRlZCBmaWVsZCBcIiR7Y2FsY0ZpZWxkfVwiIGZvciBcIiR7dGhpcy5uYW1lfVwiIGFscmVhZHkgZXhpc3RzIWApO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbkxvb2t1cCA9IHRoaXMuY29sdW1uTG9va3VwKCk7XG5cbiAgICBpZiAoY29sdW1uTG9va3VwW2NhbGNGaWVsZF0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNyZWF0ZSBjYWxjdWxhdGVkIGZpZWxkIFwiJHtjYWxjRmllbGR9XCIgZm9yIFwiJHt0aGlzLm5hbWV9XCIsIGZpZWxkIGFscmVhZHkgZXhpc3RzLmApO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkczogc3RyaW5nW10gPSB1dGlsaXRpZXMuZ2V0RnVuY3Rpb25QYXJhbWV0ZXJzKGZuQ29tcHV0ZSk7XG5cbiAgICBmaWVsZHMuZm9yRWFjaChmID0+IHtcbiAgICAgIGlmICghY29sdW1uTG9va3VwW2ZdKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FsY3VsYXRpb24gZnVuY3Rpb24gZXJyb3I6IFwiJHtjYWxjRmllbGR9IGZvciBcIiR7dGhpcy5uYW1lfVwiIHVzaW5nIGZpZWxkIFwiJHtmfVwiLCBcIiR7Zn1cIiBkb2VzIG5vdCBleGlzdC5gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMucHJvdG90eXBlLl9jYWxjdWxhdGlvbnNbY2FsY0ZpZWxkXSA9IHtcbiAgICAgIGNhbGN1bGF0ZTogZm5Db21wdXRlLFxuICAgICAgZmllbGRzOiBmaWVsZHNcbiAgICB9O1xuXG4gICAgdGhpcy5wcm90b3R5cGUuX2NhbGN1bGF0aW9uc0xpc3QucHVzaChjYWxjRmllbGQpO1xuXG4gIH1cblxuICAvKipcbiAgICogSGlkZXMgZmllbGRzIGZyb20gYmVpbmcgb3V0cHV0IGluIC50b09iamVjdCgpIChpLmUuIEFQSSByZXNwb25zZXMpLCBldmVuIGlmIGFza2VkIGZvclxuICAgKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgaGlkZXMoZmllbGQ6IHN0cmluZykge1xuXG4gICAgaWYgKCF0aGlzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSgnX2hpZGVzJykpIHtcbiAgICAgIHRoaXMucHJvdG90eXBlLl9oaWRlcyA9IHt9O1xuICAgIH1cblxuICAgIHRoaXMucHJvdG90eXBlLl9oaWRlc1tmaWVsZF0gPSB0cnVlO1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH1cblxuICAvKipcbiAgICogVGVsbHMgdXMgaWYgYSBmaWVsZCBpcyBoaWRkZW4gKGkuZS4gZnJvbSBBUEkgcXVlcmllcylcbiAgICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGlzSGlkZGVuKGZpZWxkOiBzdHJpbmcpIHtcblxuICAgIHJldHVybiB0aGlzLnByb3RvdHlwZS5faGlkZXNbZmllbGRdIHx8IGZhbHNlO1xuXG4gIH1cblxuICAvKipcbiAgICogUHJlcGFyZSBtb2RlbCBmb3IgdXNlXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIF9faW5pdGlhbGl6ZV9fKCkge1xuXG4gICAgdGhpcy5fcmVsYXRpb25zaGlwQ2FjaGUgPSB7fTtcblxuICAgIHRoaXMuX2pvaW5zQ2FjaGUgPSB7fTtcbiAgICB0aGlzLl9qb2luc0xpc3QgPSBbXTtcblxuICAgIHRoaXMuX2RhdGEgPSBPYmplY3QuY3JlYXRlKHRoaXMuX2RhdGEpOyAvLyBJbmhlcml0IGZyb20gcHJvdG90eXBlXG4gICAgdGhpcy5fY2hhbmdlZCA9IE9iamVjdC5jcmVhdGUodGhpcy5fY2hhbmdlZCk7IC8vIEluaGVyaXQgZnJvbSBwcm90b3R5cGVcbiAgICB0aGlzLl9lcnJvcnMgPSB7fTtcblxuICAgIHJldHVybiB0cnVlO1xuXG4gIH1cblxuICAvKlxuICAqIExvYWRzIGRhdGEgaW50byB0aGUgbW9kZWxcbiAgKiBAcHJpdmF0ZVxuICAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIERhdGEgdG8gbG9hZCBpbnRvIHRoZSBtb2RlbFxuICAqIEBwYXJhbSB7b3B0aW9uYWwgYm9vbGVhbn0gZnJvbVN0b3JhZ2UgU3BlY2lmeSBpZiB0aGUgbW9kZWwgd2FzIGxvYWRlZCBmcm9tIHN0b3JhZ2UuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAqIEBwYXJhbSB7b3B0aW9uYWwgYm9vbGVhbn0gZnJvbVNlZWQgU3BlY2lmeSBpZiB0aGUgbW9kZWwgd2FzIGdlbmVyYXRlZCBmcm9tIGEgc2VlZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICovXG4gIHB1YmxpYyBfX2xvYWRfXyhkYXRhOiBhbnksIGZyb21TdG9yYWdlPzogYm9vbGVhbiwgZnJvbVNlZWQ/OiBib29sZWFuKSB7XG5cbiAgICBkYXRhID0gZGF0YSB8fCB7fTtcblxuICAgIHRoaXMuX2luU3RvcmFnZSA9ICEhZnJvbVN0b3JhZ2U7XG4gICAgdGhpcy5faXNTZWVkaW5nID0gISFmcm9tU2VlZDtcblxuICAgIGlmICghZnJvbVN0b3JhZ2UpIHtcbiAgICAgIGRhdGEuY3JlYXRlZF9hdCA9IG5ldyBEYXRlKCk7XG4gICAgICBkYXRhLnVwZGF0ZWRfYXQgPSBuZXcgRGF0ZSgpO1xuICAgIH1cblxuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhkYXRhKTtcblxuICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgdGhpcy5fX3NhZmVTZXRfXyhrZXksIGRhdGFba2V5XSk7XG4gICAgICB0aGlzLl9jaGFuZ2VkW2tleV0gPSAhZnJvbVN0b3JhZ2U7XG4gICAgfSk7XG5cbiAgICB0aGlzLl9fdmFsaWRhdGVfXygpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgcHJvdmlkZWQgZmllbGRMaXN0IChvciBhbGwgZmllbGRzIGlmIG5vdCBwcm92aWRlZClcbiAgICogQHByaXZhdGVcbiAgICogQHBhcmFtIHtvcHRpb25hbCBBcnJheX0gZmllbGRMaXN0IGZpZWxkcyB0byB2YWxpZGF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfX3ZhbGlkYXRlX18oZmllbGQ/OiBhbnkpIHtcblxuICAgIGlmICghZmllbGQpIHtcblxuICAgICAgbGV0IHZhbGlkID0gdHJ1ZTtcbiAgICAgIHRoaXMuX3ZhbGlkYXRpb25zTGlzdFxuICAgICAgICAuZm9yRWFjaCgoZmllbGQ6IGFueVtdKSA9PiB7XG4gICAgICAgICAgdmFsaWQgPSAodGhpcy5fX3ZhbGlkYXRlX18oZmllbGQpICYmIHZhbGlkKTtcbiAgICAgICAgfSk7XG4gICAgICByZXR1cm4gdmFsaWQ7XG5cbiAgICB9IGVsc2UgaWYgKCF0aGlzLl92YWxpZGF0aW9uc1tmaWVsZF0pIHtcblxuICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyRXJyb3IoZmllbGQpO1xuICAgIGNvbnN0IHZhbHVlID0gdGhpcy5fZGF0YVtmaWVsZF07XG5cbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGlvbnNbZmllbGRdLmZpbHRlcigodmFsaWRhdGlvbjogYW55KSA9PiB7XG4gICAgICBjb25zdCB2YWxpZCA9IHZhbGlkYXRpb24uYWN0aW9uLmNhbGwobnVsbCwgdmFsdWUpO1xuICAgICAgIXZhbGlkICYmIHRoaXMuc2V0RXJyb3IoZmllbGQsIHZhbGlkYXRpb24ubWVzc2FnZSk7XG4gICAgICByZXR1cm4gdmFsaWQ7XG4gICAgfSkubGVuZ3RoID09PSAwO1xuXG4gIH1cblxuICAvKipcbiAgICogU2V0cyBzcGVjaWZpZWQgZmllbGQgZGF0YSBmb3IgdGhlIG1vZGVsLCBhc3N1bWluZyBkYXRhIGlzIHNhZmUgYW5kIGRvZXMgbm90IGxvZyBjaGFuZ2VzXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZCBGaWVsZCB0byBzZXRcbiAgICogQHBhcmFtIHthbnl9IHZhbHVlIFZhbHVlIGZvciB0aGUgZmllbGRcbiAgICovXG4gIHByaXZhdGUgX19zYWZlU2V0X18oZmllbGQ6IHN0cmluZywgdmFsdWU6IGFueSkge1xuXG4gICAgaWYgKHRoaXMucmVsYXRpb25zaGlwKGZpZWxkKSkge1xuXG4gICAgICByZXR1cm4gdGhpcy5zZXRKb2luZWQoZmllbGQsIHZhbHVlKTtcblxuICAgIH1cblxuICAgIGlmICghdGhpcy5oYXNGaWVsZChmaWVsZCkpIHtcblxuICAgICAgcmV0dXJuO1xuXG4gICAgfVxuXG4gICAgdGhpcy5fZGF0YVtmaWVsZF0gPSB0aGlzLmNvbnZlcnQoZmllbGQsIHZhbHVlKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIERlc3Ryb3lzIG1vZGVsIHJlZmVyZW5jZSBpbiBkYXRhYmFzZVxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBNZXRob2QgdG8gZXhlY3V0ZSB1cG9uIGNvbXBsZXRpb24sIHJldHVybnMgZXJyb3IgaWYgZmFpbGVkXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIF9fZGVzdHJveV9fKGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgbGV0IGRiID0gdGhpcy5kYjtcblxuICAgIC8vIExlZ2FjeVxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgICBkYiA9IGFyZ3VtZW50c1swXTtcbiAgICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICAgIH1cblxuICAgIGlmICghKGRiIGluc3RhbmNlb2YgRGF0YWJhc2UpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3QgcHJvdmlkZSBhIHZhbGlkIERhdGFiYXNlIHRvIHNhdmUgdG8nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9ICgpID0+IHsgfTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuaW5TdG9yYWdlKCkpIHtcblxuICAgICAgc2V0VGltZW91dChjYWxsYmFjay5iaW5kKHRoaXMsIHsgX3F1ZXJ5OiAnTW9kZWwgaGFzIG5vdCBiZWVuIHNhdmVkJyB9LCB0aGlzKSwgMSk7XG4gICAgICByZXR1cm47XG5cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gdGhpcy5maWVsZExpc3QoKS5maWx0ZXIoKHYpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmlzRmllbGRQcmltYXJ5S2V5KHYpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgcXVlcnkgPSBkYi5hZGFwdGVyLmdlbmVyYXRlRGVsZXRlUXVlcnkodGhpcy5zY2hlbWEudGFibGUsIGNvbHVtbnMpO1xuXG4gICAgZGIucXVlcnkoXG4gICAgICBxdWVyeSxcbiAgICAgIGNvbHVtbnMubWFwKCh2KSA9PiB7XG4gICAgICAgIHJldHVybiBkYi5hZGFwdGVyLnNhbml0aXplKHRoaXMuZ2V0RmllbGREYXRhKHYpLnR5cGUsIHRoaXMuZ2V0KHYsIHRydWUpKTtcbiAgICAgIH0pLFxuICAgICAgKGVycjogRXJyb3IsIHJlc3VsdDogYW55KSA9PiB7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHRoaXMuc2V0RXJyb3IoJ19xdWVyeScsIGVyci5tZXNzYWdlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl9pblN0b3JhZ2UgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgZXJyLCB0aGlzKTtcblxuICAgICAgfVxuICAgICk7XG5cbiAgfVxuXG59XG5cbk1vZGVsLnByb3RvdHlwZS5zY2hlbWEgPSB7XG4gIHRhYmxlOiAnJyxcbiAgY29sdW1uczogW11cbn07XG5cbk1vZGVsLnByb3RvdHlwZS5fdmFsaWRhdGlvbnMgPSB7fTtcbk1vZGVsLnByb3RvdHlwZS5fdmFsaWRhdGlvbnNMaXN0ID0gW107XG5cbk1vZGVsLnByb3RvdHlwZS5fY2FsY3VsYXRpb25zID0ge307XG5Nb2RlbC5wcm90b3R5cGUuX2NhbGN1bGF0aW9uc0xpc3QgPSBbXTtcblxuTW9kZWwucHJvdG90eXBlLl92ZXJpZmljYXRpb25zTGlzdCA9IFtdO1xuXG5Nb2RlbC5wcm90b3R5cGUuX2hpZGVzID0ge307XG5cbk1vZGVsLnByb3RvdHlwZS5mb3JtYXR0ZXJzID0ge307XG5cbk1vZGVsLnByb3RvdHlwZS5kYXRhID0gbnVsbDtcblxuTW9kZWwucHJvdG90eXBlLmRiID0gbnVsbDtcblxuTW9kZWwucHJvdG90eXBlLmV4dGVybmFsSW50ZXJmYWNlID0gW1xuICAnaWQnLFxuICAnY3JlYXRlZF9hdCcsXG4gICd1cGRhdGVkX2F0J1xuXTtcblxuTW9kZWwucHJvdG90eXBlLmFnZ3JlZ2F0ZUJ5ID0ge1xuICBpZDogJ2NvdW50JyxcbiAgY3JlYXRlZF9hdDogJ21pbicsXG4gIHVwZGF0ZWRfYXQ6ICdtaW4nXG59O1xuXG5leHBvcnQgZGVmYXVsdCBNb2RlbDtcbiJdfQ==
