"use strict";
const item_array_1 = require('./item_array');
const model_array_1 = require('./model_array');
const utilities_1 = require('./utilities');
/**
 * The query composer (ORM)
 * @class
 */
class Composer {
    /**
     * Created by Model#query, used for composing SQL queries based on Models
     * @param {Nodal.Model} Model The model class the composer is querying from
     * @param {Nodal.Composer} [parent=null] The composer's parent (another composer instance)
     */
    constructor(modelConstructor, parent) {
        this.db = modelConstructor.prototype.db;
        this.Model = modelConstructor;
        this._parent = parent || null;
        this._command = null;
    }
    /**
     * Given rows with repeated data (due to joining in multiple children),
     * return only parent models (but include references to their children)
     * @param {Array} rows Rows from sql result
     * @param {Boolean} grouped Are these models grouped, if so, different procedure
     * @return {Nodal.ModelArray}
     * @private
     */
    __parseModelsFromRows__(rows, grouped) {
        if (grouped) {
            return item_array_1.default.from(rows);
        }
        if (!rows.length) {
            return new model_array_1.default(this.Model);
        }
        const keys = Object.keys(rows[0]);
        const cache = {};
        const mainCache = {};
        cache[this.Model.name] = mainCache;
        const columns = keys
            .filter(key => key[0] !== '$');
        const columnsObject = columns
            .reduce((aggregatedColumns, currentItem) => {
            aggregatedColumns[currentItem] = null;
            return columns;
        }, {});
        const joinsObject = keys
            .filter(key => key[0] === '$')
            .reduce((aggregatedJoins, currentItem) => {
            const middle = currentItem.indexOf('$', 1);
            const name = currentItem.substring(1, middle);
            const field = currentItem.substring(middle + 1);
            const relationship = this.Model.relationship(name);
            aggregatedJoins[name] = aggregatedJoins[name] || {};
            // Type any needed until Typescript gives constructors better typing
            const rModel = relationship.getModel();
            aggregatedJoins[name].Model = rModel;
            cache[rModel.name] = {};
            aggregatedJoins[name].name = name;
            aggregatedJoins[name].key = currentItem;
            aggregatedJoins[name].multiple = relationship.immediateMultiple();
            aggregatedJoins[name].columns = aggregatedJoins[name].columns || [];
            aggregatedJoins[name].columns.push(field);
            aggregatedJoins[name].columnsObject = aggregatedJoins[name].columnsObject || {};
            aggregatedJoins[name].columnsObject[field] = null;
            aggregatedJoins[name].cachedModel = null;
            return aggregatedJoins;
        }, {});
        const joins = Object
            .keys(joinsObject)
            .sort((a, b) => a.length > b.length ? 1 : -1)
            .map((k) => joinsObject[k]);
        const models = new model_array_1.default(this.Model);
        rows.forEach(row => {
            let model = mainCache[row.id];
            if (!model) {
                model = mainCache[row.id] = new this.Model(columns.reduce((obj, k) => {
                    obj[k] = row[k];
                    return obj;
                }, columnsObject), true);
                models.push(model);
            }
            joins.forEach(join => {
                const id = row[`\$${join.name}\$id`];
                const name = join.name;
                const names = name.split('__');
                const joinName = names.pop();
                const parentName = names.join('__');
                const parentModel = parentName ? joinsObject[parentName].cachedModel : model;
                if (join.multiple) {
                    parentModel && (parentModel.joined(joinName) || parentModel.setJoined(joinName, new model_array_1.default(join.Model)));
                }
                if (!id) {
                    return;
                }
                const joinCache = cache[join.Model.name];
                let joinModel = join.cachedModel = joinCache[id];
                if (!joinModel) {
                    joinModel = join.cachedModel
                        = joinCache[id]
                            = new join.Model(join.columns.reduce((reducedColumns, column) => {
                                reducedColumns[column] = row[`\$${join.name}\$${column}`];
                                return reducedColumns;
                            }, join.columnsObject), true);
                }
                if (join.multiple) {
                    const modelArray = parentModel.joined(joinName);
                    (modelArray instanceof model_array_1.default) && !modelArray.has(joinModel) && modelArray.push(joinModel);
                }
                else {
                    parentModel.joined(joinName) || parentModel.setJoined(joinName, joinModel);
                }
            });
        });
        return models;
    }
    /**
     * Collapses linked list of queries into an array (for .reduce, .map etc)
     * @return {Array}
     * @private
     */
    __collapse__() {
        const composerArray = [];
        // tslint:disable-next-line:no-var-self
        let composer = this;
        while (composer) {
            composerArray.unshift(composer);
            composer = composer._parent;
        }
        return composerArray;
    }
    /**
     * Removes last limit command from a collapsed array of composer commands
     * @param {Array} [composerArray] Array of composer commands
     * @return {Array}
     * @private
     */
    __removeLastLimitCommand__(composerArray) {
        const found = composerArray.map(c => c._command && c._command.type).lastIndexOf('limit');
        (found !== -1) && composerArray.splice(found, 1);
        return composerArray;
    }
    /**
     * Gets last limit command from a collapsed array of composer commands
     * @param {Array} [composerArray] Array of composer commands
     * @return {Array}
     * @private
     */
    __getLastLimitCommand__(composerArray) {
        const found = composerArray.map(c => c._command && c._command.type).lastIndexOf('limit');
        return found >= 0 ? composerArray.splice(found, 1)[0] : null;
    }
    /**
     * Determines whether this composer query represents a grouped query or not
     * @return {Boolean}
     * @private
     */
    __isGrouped__() {
        return this.__collapse__().filter(c => c._command && c._command.type === 'groupBy').length > 0;
    }
    /**
     * Reduces an array of composer queries to a single query information object
     * @param {Array} [composerArray]
     * @return {Object} Looks like {commands: [], joins: []}
     * @private
     */
    __reduceToQueryInformation__(composerArray) {
        // TODO outline what the shape of this object is.
        const joins = {};
        // Todo Cleanup this implementation
        const commands = composerArray.reduce((reducedCommands, currentCommand) => {
            const composerCommand = currentCommand._command || { type: 'where', data: { comparisons: [] } };
            if (composerCommand.type === 'join' && composerCommand.data) {
                const curJoinName = composerCommand.data.name;
                const curJoinData = composerCommand.data.joinData;
                joins[curJoinName] = curJoinData;
                Object.keys(joins)
                    .filter(joinName => joinName !== curJoinName)
                    .forEach(joinName => {
                    if (curJoinName.indexOf(joinName) === 0) {
                        joins[curJoinName] = joins[joinName].concat(curJoinData.slice(joins[joinName].length));
                        delete joins[joinName];
                    }
                    else if (joinName.indexOf(curJoinName) === 0) {
                        joins[joinName][curJoinData.length - 1] = curJoinData[curJoinData.length - 1];
                        delete joins[curJoinName];
                    }
                });
                return reducedCommands;
            }
            const lastCommand = reducedCommands[reducedCommands.length - 1];
            let command = {
                type: '',
                where: null,
                limit: null,
                orderBy: [],
                groupBy: [],
                aggregate: []
            };
            reducedCommands.push(command);
            if (lastCommand && (!lastCommand[composerCommand.type] ||
                lastCommand[composerCommand.type] instanceof Array)) {
                command = lastCommand;
                reducedCommands.pop();
            }
            if (command[composerCommand.type] instanceof Array) {
                command[composerCommand.type].push(Object.keys(composerCommand.data).reduce((p, c) => {
                    return (p[c] = composerCommand.data[c], p);
                }, {}));
            }
            else {
                command[composerCommand.type] = Object.keys(composerCommand.data).reduce((p, c) => {
                    return (p[c] = composerCommand.data[c], p);
                }, {});
            }
            return reducedCommands;
        }, []);
        return {
            commands: commands,
            joins: joins
        };
    }
    /**
     * Reduces an array of commands from query informtion to a SQL query
     * @param {Array} [commandArray]
     * @param {Array} [includeColumns=*] Which columns to include, includes all by default
     * @return {Object} Looks like {sql: [], params: []}
     * @private
     */
    __reduceCommandsToQuery__(commandArray, includeColumns) {
        let lastAggregate = null;
        return commandArray.reduce((prev, command, i) => {
            if (command.aggregate && command.aggregate.length &&
                command.groupBy && command.groupBy.length) {
                lastAggregate = command.aggregate;
            }
            const table = `t${i}`;
            const multiFilter = this.db.adapter.createMultiFilter(table, command.where ? command.where.comparisons : []);
            const params = this.db.adapter.getParamsFromMultiFilter(multiFilter);
            const joins = null;
            let columns = includeColumns || lastAggregate || this.Model.columnNames();
            columns = columns
                .map((c) => typeof c !== 'string' ? c : { columnNames: [c], alias: c, transformation: (v) => v })
                .map((c) => Object.keys(c).reduce((p, k) => { return (p[k] = c[k], p); }, {}));
            command.groupBy && !command.groupBy.length && columns.forEach((c) => {
                c.transformation = (v) => v;
                c.columnNames = [c.alias];
            });
            return {
                sql: this.db.adapter.generateSelectQuery(prev.sql || { table: this.Model.table() }, table, columns, multiFilter, joins, command.groupBy, command.orderBy, command.limit, prev.params.length),
                params: prev.params.concat(params)
            };
        }, { sql: '', params: [] });
    }
    /**
     * Retrieve all joined column data for a given join
     * @param {string} joinName The name of the join relationship
     * @private
     */
    __joinedColumns__(joinName) {
        const relationship = this.Model.relationships().findExplicit(joinName);
        return relationship.getModel().columnNames().map((columnName) => {
            return {
                name: joinName,
                table: relationship.getModel().table(),
                columnNames: [columnName],
                alias: `\$${joinName}\$${columnName}`,
                transformation: (v) => v
            };
        });
    }
    /**
     * Generate a SQL query and its associated parameters from the current composer instance
     * @param {Array} [includeColumns=*] Which columns to include, includes all by default
     * @param {boolean} [disableJoins=false] Disable joins if you just want a subset of data
     * @return {Object} Has "params" and "sql" properties.
     * @private
     */
    __generateQuery__(includeColumns, disableJoins) {
        disableJoins = disableJoins || this.__isGrouped__();
        const queryInfo = this.__reduceToQueryInformation__(this.__collapse__());
        const query = this.__reduceCommandsToQuery__(queryInfo.commands, includeColumns);
        return disableJoins ? query : this.__addJoinsToQuery__(query, queryInfo, includeColumns);
    }
    /**
     * Generate a SQL count query
     * @param {boolean} [useLimit=false] Generates COUNT using limit command as well
     * @return {Object} Has "params" and "sql" properties.
     * @private
     */
    __generateCountQuery__(useLimit) {
        let collapsed = this.__collapse__();
        collapsed = useLimit ? collapsed : this.__removeLastLimitCommand__(collapsed);
        const queryInfo = this.__reduceToQueryInformation__(collapsed);
        const query = this.__reduceCommandsToQuery__(queryInfo.commands);
        query.sql = this.db.adapter.generateCountQuery(query.sql, 'c');
        return query;
    }
    /**
     * Add Joins to a query from queryInfo
     * @param {Object} query Must be format {sql: '', params: []}
     * @param {Object} queryInfo Must be format {commands: [], joins: []}
     * @param {Array} [includeColumns=*] Which columns to include, includes all by default
     * @return {Object} Has "params" and "sql" properties.
     * @private
     */
    __addJoinsToQuery__(query, queryInfo, includeColumns) {
        let columns = includeColumns || this.Model.columnNames();
        const joins = queryInfo.joins;
        Object.keys(joins).forEach(joinName => {
            joins[joinName].forEach(j => {
                columns = columns.concat(this.__joinedColumns__(j.joinAlias));
            });
        });
        const joinsArray = Object.keys(joins).map(k => joins[k]);
        let params = query.params.slice();
        joinsArray.forEach((join) => {
            join.forEach((j) => {
                params = params.concat(this.db.adapter.getParamsFromMultiFilter(j.multiFilter));
            });
        });
        // Set join OrderBys... in reverse order
        const orderBy = queryInfo.commands.reduce((arr, command) => {
            command.orderBy && (arr = command.orderBy.concat(arr));
            return arr;
        }, []);
        // When doing joins, we count paramOffset as the last where parameter length
        // Because we add in a bunch of parameters at the end.
        return {
            sql: this.db.adapter.generateSelectQuery(query.sql, 'j', columns, null, joins, null, orderBy, null, query.params.length),
            params: params
        };
    }
    /**
     * When using Composer#where, format all provided comparisons
     * @param {Object} comparisons Comparisons object. {age__lte: 27}, for example.
     * @param {Nodal.Model} Model the model to use as the basis for comparison. Default to current model.
     * @return {Array}
     * @private
     */
    __parseComparisons__(comparisons, model) {
        const modelConstructor = model || this.Model;
        const comparators = this.db.adapter.comparators;
        const columnLookup = modelConstructor.columnLookup();
        return Object.keys(comparisons)
            .map(comparison => {
            let column = comparison.split('__');
            let rel = null;
            let joinName;
            let comparator = column.pop();
            if (!comparators[comparator]) {
                column.push(comparator);
                comparator = 'is';
            }
            if (column.length > 1) {
                joinName = column.slice(0, column.length - 1).join('__');
                rel = modelConstructor.relationship(joinName);
                column = column.slice(column.length - 1);
            }
            let table = null;
            let joined = false;
            let joins = null;
            if (rel) {
                // if it's not found, return null...
                if (!rel.getModel().hasColumn(column[0])) {
                    return null;
                }
                table = rel.getModel().table();
                joined = true;
                joins = rel.joins('w');
            }
            const columnName = column[0];
            // block out bad column names
            if (!rel && !modelConstructor.hasColumn(columnName)) {
                return null;
            }
            return {
                table: table,
                columnName: columnName,
                comparator: comparator,
                value: comparisons[comparison],
                joined: joined,
                joins: joins
            };
        });
    }
    __filterHidden__(modelConstructor, comparisonsArray) {
        comparisonsArray = (comparisonsArray || []).filter(c => c);
        const comparators = this.db.adapter.comparators;
        return comparisonsArray.map((comparisons) => {
            Object.keys(comparisons).forEach(comparison => {
                let cModel = modelConstructor;
                const column = comparison.split('__');
                const comparator = column.pop();
                comparator && !comparators[comparator] && column.push(comparator);
                const field = column.pop();
                const relName = column.join('__');
                if (relName) {
                    const rel = cModel.relationship(relName);
                    if (!rel) {
                        return;
                    }
                    cModel = rel.getModel();
                }
                if (field && cModel.isHidden(field)) {
                    comparison && delete comparisons[comparison];
                }
            });
            if (Object.keys(comparisons).length === 0) {
                return null;
            }
            return comparisons;
        }).filter(comparisons => comparisons);
    }
    /**
     * Add comparisons to SQL WHERE clause. Does not allow filtering if Model.hides() has been called.
     * @param {Object} comparisons Comparisons object. {age__lte: 27}, for example.
     * @return {Nodal.Composer} new Composer instance
     */
    safeWhere(...comparisonsArray) {
        if (!(comparisonsArray instanceof Array)) {
            comparisonsArray = [].slice.call(comparisonsArray);
        }
        return this.where(this.__filterHidden__(this.Model, comparisonsArray));
    }
    /**
     * Join in a relationship. Filters out hidden fields from comparisons.
     * @param {string} joinName The name of the joined relationship
     * @param {array} comparisonsArray comparisons to perform on this join (can be overloaded)
     */
    safeJoin(joinName, ...comparisonsArray) {
        if (!(comparisonsArray instanceof Array)) {
            comparisonsArray = [].slice.call(comparisonsArray, 1);
        }
        const relationship = this.Model.relationship(joinName);
        if (!relationship) {
            return this;
        }
        return this.join(joinName, this.__filterHidden__(relationship.getModel(), comparisonsArray));
    }
    // Smelly
    /**
     * Add comparisons to SQL WHERE clause.
     * @param {Object} comparisons Comparisons object. {age__lte: 27}, for example.
     * @return {Nodal.Composer} new Composer instance
     */
    where(...comparisonsArray) {
        if (!(comparisonsArray instanceof Array)) {
            comparisonsArray = [].slice.call(comparisonsArray);
        }
        comparisonsArray = comparisonsArray.map(comparisons => {
            return Object.keys(comparisons).reduce((p, c) => { return (p[c] = comparisons[c], p); }, {});
        });
        let order;
        let offset = undefined;
        let count = undefined;
        comparisonsArray.forEach(comparisons => {
            if ('__order' in comparisons) {
                order = comparisons.__order.split(' ');
                delete comparisons.__order;
            }
            if ('__offset' in comparisons || '__count' in comparisons) {
                offset = comparisons.__offset;
                count = comparisons.__count;
                delete comparisons.__offset;
                delete comparisons.__count;
            }
        });
        if (order || offset || count) {
            let composer = (order && order.length >= 1) ? this.orderBy(order[0], order[1]) : this;
            (offset || count) && (composer = composer.limit(offset || 0, count || 0));
            return composer.where(comparisonsArray);
        }
        this._command = {
            type: 'where',
            data: {
                comparisons: comparisonsArray
                    .map(comparisons => this.__parseComparisons__(comparisons))
                    .filter(f => f.length)
            }
        };
        return new Composer(this.Model, this);
    }
    /**
     * Order by field belonging to the current Composer instance's model.
     * @param {string} field Field to order by
     * @param {string} direction Must be 'ASC' or 'DESC'
     * @return {Nodal.Composer} new Composer instance
     */
    orderBy(field, direction = 'ASC') {
        let transformation;
        let fields = [];
        if (typeof field === 'function') {
            fields = utilities_1.default.getFunctionParameters(field);
            transformation = field;
        }
        else {
            fields = [field];
            transformation = (v) => `${v}`;
        }
        fields.forEach(field => {
            if (!this.Model.hasColumn(field)) {
                throw new Error(`Cannot order by ${field}, it does not belong to ${this.Model.name}`);
            }
        });
        this._command = {
            type: 'orderBy',
            data: {
                columnNames: fields,
                transformation: transformation,
                direction
            }
        };
        return new Composer(this.Model, this);
    }
    /**
     * Limit to an offset and count
     * @param {number} offset The offset at which to set the limit. If this is the only argument provided, it will be the count instead.
     * @param {number} count The number of results to be returned. Can be omitted, and if omitted, first argument is used for count.
     * @return {Nodal.Composer} new Composer instance
     */
    limit(offset, count) {
        if (this._command) {
            return new Composer(this.Model, this).limit(offset, count);
        }
        if (count === undefined) {
            count = offset;
            offset = 0;
        }
        count = parseInt(count, 10);
        offset = parseInt(offset, 10);
        this._command = {
            type: 'limit',
            data: {
                count: count,
                offset: offset
            }
        };
        return new Composer(this.Model, this);
    }
    /**
     * Join in a relationship.
     * @param {string} joinName The name of the joined relationship
     * @param {array} comparisonsArray comparisons to perform on this join (can be overloaded)
     */
    join(joinName, comparisonsArray, orderBy = 'ASC', count, offset) {
        // FIXME: validate orderBy
        orderBy = orderBy || '';
        count = Math.max(0, count | 0);
        offset = Math.max(0, offset | 0);
        if (!(comparisonsArray instanceof Array)) {
            comparisonsArray = [].slice.call(arguments, 1);
        }
        const relationship = this.Model.relationships().findExplicit(joinName);
        if (!relationship) {
            throw new Error(`Model ${this.Model.name} does not have relationship "${joinName}".`);
        }
        // tslint:disable-next-line:no-var-self
        let composer = this;
        while (composer) {
            if (composer._command && composer._command.type === 'join' && composer._command.data.name === joinName) {
                return this;
            }
            composer = composer._parent;
        }
        const joinData = relationship.joins();
        joinData[joinData.length - 1].joinAlias = joinName;
        joinData[joinData.length - 1].prevAlias = joinName.split('__').slice(0, -1).join('__');
        joinData[joinData.length - 1].multiFilter = this.db.adapter.createMultiFilter(joinName, comparisonsArray && comparisonsArray
            .map(comparisons => this.__parseComparisons__(comparisons, relationship.getModel()))
            .filter(f => f.length));
        // FIXME: implement properly
        joinData[joinData.length - 1].orderBy = orderBy;
        joinData[joinData.length - 1].offset = offset;
        joinData[joinData.length - 1].count = count;
        this._command = {
            type: 'join',
            data: {
                name: joinName,
                joinData: joinData
            }
        };
        return new Composer(this.Model, this);
    }
    /**
     * Groups by a specific field, or a transformation on a field
     * @param {String} column The column to group by
     */
    groupBy(column) {
        let columns;
        let transformation;
        // TODO: Make this function overloading more clear
        if (typeof column === 'function') {
            columns = utilities_1.default.getFunctionParameters(column);
            transformation = column;
        }
        else {
            columns = [column];
            transformation = (v) => `${v}`;
        }
        this._command = {
            type: 'groupBy',
            data: {
                columnNames: columns,
                transformation: transformation
            }
        };
        return new Composer(this.Model, this).aggregate(column);
    }
    /**
     * Aggregates a field
     * @param {String} alias The alias for the new aggregate field
     * @param {Function} transformation The transformation to apply to create the aggregate
     */
    aggregate(alias, transformation) {
        let columns;
        // TODO: Make this function overloading more clear
        if (typeof alias === 'function') {
            columns = utilities_1.default.getFunctionParameters(alias);
            transformation = alias;
            alias = columns.join('___');
        }
        else if (typeof transformation === 'function') {
            columns = utilities_1.default.getFunctionParameters(transformation);
        }
        else {
            columns = [alias];
            transformation = (v) => v;
        }
        this._command = {
            type: 'aggregate',
            data: {
                alias: alias,
                columnNames: columns,
                transformation: transformation
            }
        };
        return new Composer(this.Model, this);
    }
    /**
     * Counts the results in the query
     * @param {function} callback Supplied with an error and the integer value of the count
     */
    count(callback) {
        const countQuery = this.__generateCountQuery__(true);
        this.db.query(countQuery.sql, countQuery.params, (err, result) => {
            callback(err, (((result && result.rows) || [])[0] || {}).__total__ || 0);
        });
    }
    /**
     * Execute the query you've been composing.
     * @param {function({Error}, {Nodal.ModelArray})} callback The method to execute when the query is complete
     */
    end(callback) {
        const query = this.__generateQuery__();
        const countQuery = this.__generateCountQuery__();
        const grouped = this.__isGrouped__();
        const limitCommand = this.__getLastLimitCommand__(this.__collapse__());
        const offset = limitCommand && limitCommand._command ? limitCommand._command.data.offset : 0;
        this.db.query(countQuery.sql, countQuery.params, (err, result) => {
            const total = (((result && result.rows) || [])[0] || {}).__total__ || 0;
            if (!total) {
                const models = this.__parseModelsFromRows__([], grouped);
                models.setMeta({ offset: offset, total: total });
                return callback.call(this, err, models);
            }
            this.db.query(query.sql, query.params, (err, result) => {
                const rows = result ? (result.rows || []).slice() : [];
                const models = this.__parseModelsFromRows__(rows, grouped);
                models.setMeta({ offset: offset, total: total });
                callback.call(this, err, models);
            });
        });
    }
    /**
     * Shortcut for .limit(1).end(callback) that only returns a model object or error if not found
     * @param {Function} callback Callback to execute, provides an error and model parameter
     */
    first(callback) {
        return this.limit(1).end((err, models) => {
            if (!err && !models.length) {
                err = new Error(`No records for ${this.Model.name} found in your query`);
            }
            callback(err, models[0]);
        });
    }
    /**
     * Execute query as an update query, changed all fields specified.
     * @param {Object} fields The object containing columns (keys) and associated values you'd like to update
     * @param {function({Error}, {Nodal.ModelArray})} callback The callback for the update query
     */
    update(fields, callback) {
        if (this.__isGrouped__()) {
            throw new Error('Cannot update grouped queries');
        }
        const query = this.__generateQuery__(['id'], true);
        const columns = Object.keys(fields);
        let params = columns.map((c) => fields[c]);
        const columnNames = columns.filter((v, i) => typeof params[i] !== 'function');
        const columnFunctions = columns
            .map((v, i) => [v, params[i]])
            .filter((v, i) => typeof params[i] === 'function');
        params = params.filter(v => typeof v !== 'function');
        query.sql = this.db.adapter.generateUpdateAllQuery(this.Model.table(), 'id', columnNames, columnFunctions, query.params.length, query.sql);
        query.params = query.params.concat(params);
        return this.db.query(query.sql, query.params, (err, result) => {
            const rows = result ? (result.rows || []).slice() : [];
            if (err) {
                const models = this.__parseModelsFromRows__(rows);
                return callback.call(this, err, models);
            }
            const ids = result.rows.map((row) => row.id);
            /* Grab all items with ids, sorted by order */
            /* Only need to grab joins and order */
            const composerArray = this.__collapse__()
                .filter(composer => composer._command)
                .filter(composer => composer._command && (composer._command.type === 'orderBy' || composer._command.type === 'join'));
            // Add in id filter
            const newComposer = new Composer(this.Model).where({ id__in: ids });
            composerArray.unshift(newComposer._parent);
            const queryInfo = this.__reduceToQueryInformation__(composerArray);
            let query = this.__reduceCommandsToQuery__(queryInfo.commands);
            query = this.__addJoinsToQuery__(query, queryInfo);
            return this.db.query(query.sql, query.params, (err, result) => {
                const rows = result ? (result.rows || []).slice() : [];
                const models = this.__parseModelsFromRows__(rows);
                callback.call(this, err, models);
            });
        });
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Composer;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RUFBRSxDQUFDLENBQUM7WUFDcEUsYUFBYSxDQUFDLE9BQU8sQ0FBVyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFckQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ25FLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0QsS0FBSyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFbkQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQVUsRUFBRSxNQUFXO2dCQUVwRSxNQUFNLElBQUksR0FBRyxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUVsRCxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFFbkMsQ0FBQyxDQUFDLENBQUM7UUFFTCxDQUFDLENBQUMsQ0FBQztJQUVMLENBQUM7QUFFSCxDQUFDO0FBRUQ7a0JBQWUsUUFBUSxDQUFDIiwiZmlsZSI6ImNvbXBvc2VyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IERhdGFiYXNlIGZyb20gJy4vZGIvZGF0YWJhc2UnO1xuaW1wb3J0IEl0ZW1BcnJheSBmcm9tICcuL2l0ZW1fYXJyYXknO1xuaW1wb3J0IE1vZGVsIGZyb20gJy4vbW9kZWwnO1xuaW1wb3J0IE1vZGVsQXJyYXkgZnJvbSAnLi9tb2RlbF9hcnJheSc7XG5pbXBvcnQgeyBSZWxhdGlvbnNoaXBQYXRoIH0gZnJvbSAnLi9yZWxhdGlvbnNoaXBfZ3JhcGgnO1xuaW1wb3J0IHsgSUFueU9iamVjdCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHV0aWxpdGllcyBmcm9tICcuL3V0aWxpdGllcyc7XG5cbmludGVyZmFjZSBJSm9pbiB7XG4gIG5hbWU6IHN0cmluZztcbiAga2V5OiBzdHJpbmc7XG4gIG11bHRpcGxlOiBib29sZWFuO1xuICBjb2x1bW5zOiBzdHJpbmdbXTtcbiAgY29sdW1uc09iamVjdDogT2JqZWN0O1xuICBjYWNoZWRNb2RlbDogTW9kZWw7XG4gIGpvaW5BbGlhczogc3RyaW5nO1xuICBtdWx0aUZpbHRlcjogYW55O1xuICBwcmV2QWxpYXM6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElKb2luc09iamVjdCB7XG4gIFtqb2luSWQ6IHN0cmluZ106IElKb2luIHwgSUpvaW5bXTtcbn1cblxuaW50ZXJmYWNlIElDb21tYW5kIHtcbiAgdHlwZTogJ3doZXJlJyB8ICdvcmRlckJ5JyB8ICdsaW1pdCcgfCAnam9pbicgfCAnZ3JvdXBCeScgfCAnYWdncmVnYXRlJyB8ICcnO1xuICBkYXRhPzoge1xuICAgIGNvbHVtbk5hbWVzPzogc3RyaW5nW107XG4gICAgdHJhbnNmb3JtYXRpb24/OiBGdW5jdGlvbjtcbiAgICBjb21wYXJpc29uczogSUNvbXBhcmlzb25bXTtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgam9pbkRhdGE/OiBhbnk7XG4gICAgW290aGVyOiBzdHJpbmddOiBhbnk7XG4gIH0gfCBhbnk7XG4gIHdoZXJlPzogYW55O1xuICBsaW1pdD86IGFueTtcbiAgb3JkZXJCeT86IGFueVtdO1xuICBncm91cEJ5PzogYW55W107XG4gIGFnZ3JlZ2F0ZT86IGFueVtdO1xuICBbb3RoZXI6IHN0cmluZ106IGFueSB8IGFueVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wYXJpc29uIHtcbiAgW2l0ZW06IHN0cmluZ106IGFueTtcbiAgX19vcmRlcj86IHN0cmluZztcbiAgX19vZmZzZXQ/OiBudW1iZXI7XG4gIF9fY291bnQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJQ29sdW1uIHtcbiAgY29sdW1uTmFtZXM6IHN0cmluZ1tdO1xuICBhbGlhczogc3RyaW5nO1xuICB0cmFuc2Zvcm1hdGlvbjogRnVuY3Rpb247XG59XG5cbmludGVyZmFjZSBJQ29sdW1uT2JqZWN0IHtcbiAgW2NvbHVtbktleTogc3RyaW5nXTogSUNvbHVtbk9iamVjdDtcbn1cblxuaW50ZXJmYWNlIElRdWVyeSB7XG4gIHNxbDogc3RyaW5nO1xuICBwYXJhbXM6IGFueVtdO1xufVxuXG5pbnRlcmZhY2UgSVF1ZXJ5SW5mbyB7XG4gIGNvbW1hbmRzOiBJQ29tbWFuZFtdO1xuICBqb2luczogSUpvaW5zT2JqZWN0O1xufVxuXG4vKipcbiAqIFRoZSBxdWVyeSBjb21wb3NlciAoT1JNKVxuICogQGNsYXNzXG4gKi9cbmNsYXNzIENvbXBvc2VyIHtcblxuICBwdWJsaWMgZGI6IERhdGFiYXNlO1xuICBwdWJsaWMgTW9kZWw6IHR5cGVvZiBNb2RlbDtcbiAgcHJpdmF0ZSBfcGFyZW50OiBDb21wb3NlciB8IG51bGw7XG4gIHByaXZhdGUgX2NvbW1hbmQ6IElDb21tYW5kIHwgbnVsbDtcblxuICAvKipcbiAgICogQ3JlYXRlZCBieSBNb2RlbCNxdWVyeSwgdXNlZCBmb3IgY29tcG9zaW5nIFNRTCBxdWVyaWVzIGJhc2VkIG9uIE1vZGVsc1xuICAgKiBAcGFyYW0ge05vZGFsLk1vZGVsfSBNb2RlbCBUaGUgbW9kZWwgY2xhc3MgdGhlIGNvbXBvc2VyIGlzIHF1ZXJ5aW5nIGZyb21cbiAgICogQHBhcmFtIHtOb2RhbC5Db21wb3Nlcn0gW3BhcmVudD1udWxsXSBUaGUgY29tcG9zZXIncyBwYXJlbnQgKGFub3RoZXIgY29tcG9zZXIgaW5zdGFuY2UpXG4gICAqL1xuICBjb25zdHJ1Y3Rvcihtb2RlbENvbnN0cnVjdG9yOiB0eXBlb2YgTW9kZWwsIHBhcmVudD86IENvbXBvc2VyKSB7XG5cbiAgICB0aGlzLmRiID0gbW9kZWxDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZGI7XG4gICAgdGhpcy5Nb2RlbCA9IG1vZGVsQ29uc3RydWN0b3I7XG5cbiAgICB0aGlzLl9wYXJlbnQgPSBwYXJlbnQgfHwgbnVsbDtcbiAgICB0aGlzLl9jb21tYW5kID0gbnVsbDtcblxuICB9XG5cbiAgLyoqXG4gICAqIEdpdmVuIHJvd3Mgd2l0aCByZXBlYXRlZCBkYXRhIChkdWUgdG8gam9pbmluZyBpbiBtdWx0aXBsZSBjaGlsZHJlbiksXG4gICAqIHJldHVybiBvbmx5IHBhcmVudCBtb2RlbHMgKGJ1dCBpbmNsdWRlIHJlZmVyZW5jZXMgdG8gdGhlaXIgY2hpbGRyZW4pXG4gICAqIEBwYXJhbSB7QXJyYXl9IHJvd3MgUm93cyBmcm9tIHNxbCByZXN1bHRcbiAgICogQHBhcmFtIHtCb29sZWFufSBncm91cGVkIEFyZSB0aGVzZSBtb2RlbHMgZ3JvdXBlZCwgaWYgc28sIGRpZmZlcmVudCBwcm9jZWR1cmVcbiAgICogQHJldHVybiB7Tm9kYWwuTW9kZWxBcnJheX1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19wYXJzZU1vZGVsc0Zyb21Sb3dzX18ocm93czogYW55W10sIGdyb3VwZWQ/OiBib29sZWFuKTogYW55IHtcblxuICAgIGlmIChncm91cGVkKSB7XG4gICAgICByZXR1cm4gSXRlbUFycmF5LmZyb20ocm93cyk7XG4gICAgfVxuXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG5ldyBNb2RlbEFycmF5KHRoaXMuTW9kZWwpO1xuICAgIH1cblxuICAgIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMocm93c1swXSk7XG4gICAgY29uc3QgY2FjaGU6IElBbnlPYmplY3QgPSB7fTtcbiAgICBjb25zdCBtYWluQ2FjaGU6IHtcbiAgICAgIFttb2RlbElkOiBzdHJpbmddOiBNb2RlbDtcbiAgICB9ID0ge307XG4gICAgY2FjaGVbdGhpcy5Nb2RlbC5uYW1lXSA9IG1haW5DYWNoZTtcblxuICAgIGNvbnN0IGNvbHVtbnM6IHN0cmluZ1tdID0ga2V5c1xuICAgICAgLmZpbHRlcihrZXkgPT4ga2V5WzBdICE9PSAnJCcpO1xuXG4gICAgY29uc3QgY29sdW1uc09iamVjdDogSUFueU9iamVjdCA9IGNvbHVtbnNcbiAgICAgIC5yZWR1Y2UoKGFnZ3JlZ2F0ZWRDb2x1bW5zOiBJQW55T2JqZWN0LCBjdXJyZW50SXRlbTogc3RyaW5nKSA9PiB7XG5cbiAgICAgICAgYWdncmVnYXRlZENvbHVtbnNbY3VycmVudEl0ZW1dID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGNvbHVtbnM7XG5cbiAgICAgIH0sIHt9KTtcblxuICAgIGNvbnN0IGpvaW5zT2JqZWN0OiBJSm9pbnNPYmplY3QgPSBrZXlzXG4gICAgICAuZmlsdGVyKGtleSA9PiBrZXlbMF0gPT09ICckJylcbiAgICAgIC5yZWR1Y2UoKGFnZ3JlZ2F0ZWRKb2luczogSUFueU9iamVjdCwgY3VycmVudEl0ZW06IHN0cmluZykgPT4ge1xuXG4gICAgICAgIGNvbnN0IG1pZGRsZTogbnVtYmVyID0gY3VycmVudEl0ZW0uaW5kZXhPZignJCcsIDEpO1xuICAgICAgICBjb25zdCBuYW1lOiBzdHJpbmcgPSBjdXJyZW50SXRlbS5zdWJzdHJpbmcoMSwgbWlkZGxlKTtcbiAgICAgICAgY29uc3QgZmllbGQ6IHN0cmluZyA9IGN1cnJlbnRJdGVtLnN1YnN0cmluZyhtaWRkbGUgKyAxKTtcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwOiBSZWxhdGlvbnNoaXBQYXRoID0gdGhpcy5Nb2RlbC5yZWxhdGlvbnNoaXAobmFtZSk7XG5cbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdID0gYWdncmVnYXRlZEpvaW5zW25hbWVdIHx8IHt9O1xuXG4gICAgICAgIC8vIFR5cGUgYW55IG5lZWRlZCB1bnRpbCBUeXBlc2NyaXB0IGdpdmVzIGNvbnN0cnVjdG9ycyBiZXR0ZXIgdHlwaW5nXG4gICAgICAgIGNvbnN0IHJNb2RlbDogTW9kZWwgfCBhbnkgPSByZWxhdGlvbnNoaXAuZ2V0TW9kZWwoKTtcbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLk1vZGVsID0gck1vZGVsO1xuICAgICAgICBjYWNoZVtyTW9kZWwubmFtZV0gPSB7fTtcblxuICAgICAgICBhZ2dyZWdhdGVkSm9pbnNbbmFtZV0ubmFtZSA9IG5hbWU7XG4gICAgICAgIGFnZ3JlZ2F0ZWRKb2luc1tuYW1lXS5rZXkgPSBjdXJyZW50SXRlbTtcbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLm11bHRpcGxlID0gcmVsYXRpb25zaGlwLmltbWVkaWF0ZU11bHRpcGxlKCk7XG5cbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLmNvbHVtbnMgPSBhZ2dyZWdhdGVkSm9pbnNbbmFtZV0uY29sdW1ucyB8fCBbXTtcbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLmNvbHVtbnMucHVzaChmaWVsZCk7XG5cbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLmNvbHVtbnNPYmplY3QgPSBhZ2dyZWdhdGVkSm9pbnNbbmFtZV0uY29sdW1uc09iamVjdCB8fCB7fTtcbiAgICAgICAgYWdncmVnYXRlZEpvaW5zW25hbWVdLmNvbHVtbnNPYmplY3RbZmllbGRdID0gbnVsbDtcblxuICAgICAgICBhZ2dyZWdhdGVkSm9pbnNbbmFtZV0uY2FjaGVkTW9kZWwgPSBudWxsO1xuXG4gICAgICAgIHJldHVybiBhZ2dyZWdhdGVkSm9pbnM7XG5cbiAgICAgIH0sIHt9KTtcblxuICAgIGNvbnN0IGpvaW5zOiBhbnlbXSA9IE9iamVjdFxuICAgICAgLmtleXMoam9pbnNPYmplY3QpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5sZW5ndGggPiBiLmxlbmd0aCA/IDEgOiAtMSlcbiAgICAgIC5tYXAoKGs6IHN0cmluZykgPT4gam9pbnNPYmplY3Rba10pO1xuXG4gICAgY29uc3QgbW9kZWxzOiBNb2RlbEFycmF5ID0gbmV3IE1vZGVsQXJyYXkodGhpcy5Nb2RlbCk7XG5cbiAgICByb3dzLmZvckVhY2gocm93ID0+IHtcblxuICAgICAgbGV0IG1vZGVsOiBNb2RlbCA9IG1haW5DYWNoZVtyb3cuaWRdO1xuXG4gICAgICBpZiAoIW1vZGVsKSB7XG5cbiAgICAgICAgbW9kZWwgPSBtYWluQ2FjaGVbcm93LmlkXSA9IG5ldyB0aGlzLk1vZGVsKGNvbHVtbnMucmVkdWNlKChvYmosIGspID0+IHtcbiAgICAgICAgICBvYmpba10gPSByb3dba107XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSwgY29sdW1uc09iamVjdCksIHRydWUpO1xuXG4gICAgICAgIG1vZGVscy5wdXNoKG1vZGVsKTtcblxuICAgICAgfVxuXG4gICAgICBqb2lucy5mb3JFYWNoKGpvaW4gPT4ge1xuXG4gICAgICAgIGNvbnN0IGlkID0gcm93W2BcXCQke2pvaW4ubmFtZX1cXCRpZGBdO1xuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBqb2luLm5hbWU7XG4gICAgICAgIGNvbnN0IG5hbWVzID0gbmFtZS5zcGxpdCgnX18nKTtcbiAgICAgICAgY29uc3Qgam9pbk5hbWUgPSBuYW1lcy5wb3AoKTtcbiAgICAgICAgY29uc3QgcGFyZW50TmFtZSA9IG5hbWVzLmpvaW4oJ19fJyk7XG5cbiAgICAgICAgY29uc3QgcGFyZW50TW9kZWw6IE1vZGVsID0gcGFyZW50TmFtZSA/ICg8SUpvaW4+am9pbnNPYmplY3RbcGFyZW50TmFtZV0pLmNhY2hlZE1vZGVsIDogbW9kZWw7XG5cbiAgICAgICAgaWYgKGpvaW4ubXVsdGlwbGUpIHtcbiAgICAgICAgICBwYXJlbnRNb2RlbCAmJiAocGFyZW50TW9kZWwuam9pbmVkKGpvaW5OYW1lKSB8fCBwYXJlbnRNb2RlbC5zZXRKb2luZWQoam9pbk5hbWUsIG5ldyBNb2RlbEFycmF5KGpvaW4uTW9kZWwpKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgam9pbkNhY2hlID0gY2FjaGVbam9pbi5Nb2RlbC5uYW1lXTtcbiAgICAgICAgbGV0IGpvaW5Nb2RlbCA9IGpvaW4uY2FjaGVkTW9kZWwgPSBqb2luQ2FjaGVbaWRdO1xuXG4gICAgICAgIGlmICgham9pbk1vZGVsKSB7XG4gICAgICAgICAgam9pbk1vZGVsID0gam9pbi5jYWNoZWRNb2RlbFxuICAgICAgICAgICAgPSBqb2luQ2FjaGVbaWRdXG4gICAgICAgICAgICA9IG5ldyBqb2luLk1vZGVsKGpvaW4uY29sdW1ucy5yZWR1Y2UoXG4gICAgICAgICAgICAgIChyZWR1Y2VkQ29sdW1uczogSUFueU9iamVjdCwgY29sdW1uOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZWR1Y2VkQ29sdW1uc1tjb2x1bW5dID0gcm93W2BcXCQke2pvaW4ubmFtZX1cXCQke2NvbHVtbn1gXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVkdWNlZENvbHVtbnM7XG4gICAgICAgICAgICAgIH0sIGpvaW4uY29sdW1uc09iamVjdCksIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGpvaW4ubXVsdGlwbGUpIHtcbiAgICAgICAgICBjb25zdCBtb2RlbEFycmF5ID0gcGFyZW50TW9kZWwuam9pbmVkKGpvaW5OYW1lKTtcbiAgICAgICAgICAobW9kZWxBcnJheSBpbnN0YW5jZW9mIE1vZGVsQXJyYXkpICYmICFtb2RlbEFycmF5Lmhhcyhqb2luTW9kZWwpICYmIG1vZGVsQXJyYXkucHVzaChqb2luTW9kZWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmVudE1vZGVsLmpvaW5lZChqb2luTmFtZSkgfHwgcGFyZW50TW9kZWwuc2V0Sm9pbmVkKGpvaW5OYW1lLCBqb2luTW9kZWwpO1xuICAgICAgICB9XG5cbiAgICAgIH0pO1xuXG4gICAgfSk7XG5cbiAgICByZXR1cm4gbW9kZWxzO1xuXG4gIH1cblxuICAvKipcbiAgICogQ29sbGFwc2VzIGxpbmtlZCBsaXN0IG9mIHF1ZXJpZXMgaW50byBhbiBhcnJheSAoZm9yIC5yZWR1Y2UsIC5tYXAgZXRjKVxuICAgKiBAcmV0dXJuIHtBcnJheX1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19jb2xsYXBzZV9fKCk6IENvbXBvc2VyW10ge1xuXG4gICAgY29uc3QgY29tcG9zZXJBcnJheTogQ29tcG9zZXJbXSA9IFtdO1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby12YXItc2VsZlxuICAgIGxldCBjb21wb3NlcjogQ29tcG9zZXIgfCBudWxsID0gdGhpcztcblxuICAgIHdoaWxlIChjb21wb3Nlcikge1xuICAgICAgY29tcG9zZXJBcnJheS51bnNoaWZ0KGNvbXBvc2VyKTtcbiAgICAgIGNvbXBvc2VyID0gY29tcG9zZXIuX3BhcmVudDtcbiAgICB9XG5cbiAgICByZXR1cm4gY29tcG9zZXJBcnJheTtcblxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgbGFzdCBsaW1pdCBjb21tYW5kIGZyb20gYSBjb2xsYXBzZWQgYXJyYXkgb2YgY29tcG9zZXIgY29tbWFuZHNcbiAgICogQHBhcmFtIHtBcnJheX0gW2NvbXBvc2VyQXJyYXldIEFycmF5IG9mIGNvbXBvc2VyIGNvbW1hbmRzXG4gICAqIEByZXR1cm4ge0FycmF5fVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfX3JlbW92ZUxhc3RMaW1pdENvbW1hbmRfXyhjb21wb3NlckFycmF5OiBDb21wb3NlcltdKSB7XG5cbiAgICBjb25zdCBmb3VuZCA9IGNvbXBvc2VyQXJyYXkubWFwKGMgPT4gYy5fY29tbWFuZCAmJiBjLl9jb21tYW5kLnR5cGUpLmxhc3RJbmRleE9mKCdsaW1pdCcpO1xuICAgIChmb3VuZCAhPT0gLTEpICYmIGNvbXBvc2VyQXJyYXkuc3BsaWNlKGZvdW5kLCAxKTtcbiAgICByZXR1cm4gY29tcG9zZXJBcnJheTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgbGFzdCBsaW1pdCBjb21tYW5kIGZyb20gYSBjb2xsYXBzZWQgYXJyYXkgb2YgY29tcG9zZXIgY29tbWFuZHNcbiAgICogQHBhcmFtIHtBcnJheX0gW2NvbXBvc2VyQXJyYXldIEFycmF5IG9mIGNvbXBvc2VyIGNvbW1hbmRzXG4gICAqIEByZXR1cm4ge0FycmF5fVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfX2dldExhc3RMaW1pdENvbW1hbmRfXyhjb21wb3NlckFycmF5OiBDb21wb3NlcltdKSB7XG5cbiAgICBjb25zdCBmb3VuZCA9IGNvbXBvc2VyQXJyYXkubWFwKGMgPT4gYy5fY29tbWFuZCAmJiBjLl9jb21tYW5kLnR5cGUpLmxhc3RJbmRleE9mKCdsaW1pdCcpO1xuICAgIHJldHVybiBmb3VuZCA+PSAwID8gY29tcG9zZXJBcnJheS5zcGxpY2UoZm91bmQsIDEpWzBdIDogbnVsbDtcblxuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciB0aGlzIGNvbXBvc2VyIHF1ZXJ5IHJlcHJlc2VudHMgYSBncm91cGVkIHF1ZXJ5IG9yIG5vdFxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfX2lzR3JvdXBlZF9fKCkge1xuICAgIHJldHVybiB0aGlzLl9fY29sbGFwc2VfXygpLmZpbHRlcihjID0+IGMuX2NvbW1hbmQgJiYgYy5fY29tbWFuZC50eXBlID09PSAnZ3JvdXBCeScpLmxlbmd0aCA+IDA7XG4gIH1cblxuICAvKipcbiAgICogUmVkdWNlcyBhbiBhcnJheSBvZiBjb21wb3NlciBxdWVyaWVzIHRvIGEgc2luZ2xlIHF1ZXJ5IGluZm9ybWF0aW9uIG9iamVjdFxuICAgKiBAcGFyYW0ge0FycmF5fSBbY29tcG9zZXJBcnJheV1cbiAgICogQHJldHVybiB7T2JqZWN0fSBMb29rcyBsaWtlIHtjb21tYW5kczogW10sIGpvaW5zOiBbXX1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19yZWR1Y2VUb1F1ZXJ5SW5mb3JtYXRpb25fXyhjb21wb3NlckFycmF5OiBDb21wb3NlcltdKTogSVF1ZXJ5SW5mbyB7XG5cbiAgICAvLyBUT0RPIG91dGxpbmUgd2hhdCB0aGUgc2hhcGUgb2YgdGhpcyBvYmplY3QgaXMuXG4gICAgY29uc3Qgam9pbnM6IGFueSA9IHt9O1xuXG4gICAgLy8gVG9kbyBDbGVhbnVwIHRoaXMgaW1wbGVtZW50YXRpb25cbiAgICBjb25zdCBjb21tYW5kcyA9IGNvbXBvc2VyQXJyYXkucmVkdWNlKChyZWR1Y2VkQ29tbWFuZHM6IElDb21tYW5kW10sIGN1cnJlbnRDb21tYW5kOiBDb21wb3NlcikgPT4ge1xuXG4gICAgICBjb25zdCBjb21wb3NlckNvbW1hbmQ6IElDb21tYW5kID0gY3VycmVudENvbW1hbmQuX2NvbW1hbmQgfHwgeyB0eXBlOiAnd2hlcmUnLCBkYXRhOiB7IGNvbXBhcmlzb25zOiBbXSB9IH07XG5cbiAgICAgIGlmIChjb21wb3NlckNvbW1hbmQudHlwZSA9PT0gJ2pvaW4nICYmIGNvbXBvc2VyQ29tbWFuZC5kYXRhKSB7XG5cbiAgICAgICAgY29uc3QgY3VySm9pbk5hbWUgPSBjb21wb3NlckNvbW1hbmQuZGF0YS5uYW1lO1xuICAgICAgICBjb25zdCBjdXJKb2luRGF0YSA9IGNvbXBvc2VyQ29tbWFuZC5kYXRhLmpvaW5EYXRhO1xuICAgICAgICBqb2luc1tjdXJKb2luTmFtZV0gPSBjdXJKb2luRGF0YTtcbiAgICAgICAgT2JqZWN0LmtleXMoam9pbnMpXG4gICAgICAgICAgLmZpbHRlcihqb2luTmFtZSA9PiBqb2luTmFtZSAhPT0gY3VySm9pbk5hbWUpXG4gICAgICAgICAgLmZvckVhY2goam9pbk5hbWUgPT4ge1xuXG4gICAgICAgICAgICBpZiAoY3VySm9pbk5hbWUuaW5kZXhPZihqb2luTmFtZSkgPT09IDApIHtcbiAgICAgICAgICAgICAgam9pbnNbY3VySm9pbk5hbWVdID0gam9pbnNbam9pbk5hbWVdLmNvbmNhdChjdXJKb2luRGF0YS5zbGljZShqb2luc1tqb2luTmFtZV0ubGVuZ3RoKSk7XG4gICAgICAgICAgICAgIGRlbGV0ZSBqb2luc1tqb2luTmFtZV07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGpvaW5OYW1lLmluZGV4T2YoY3VySm9pbk5hbWUpID09PSAwKSB7XG4gICAgICAgICAgICAgIGpvaW5zW2pvaW5OYW1lXVtjdXJKb2luRGF0YS5sZW5ndGggLSAxXSA9IGN1ckpvaW5EYXRhW2N1ckpvaW5EYXRhLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICBkZWxldGUgam9pbnNbY3VySm9pbk5hbWVdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlZHVjZWRDb21tYW5kcztcblxuICAgICAgfVxuXG4gICAgICBjb25zdCBsYXN0Q29tbWFuZCA9IHJlZHVjZWRDb21tYW5kc1tyZWR1Y2VkQ29tbWFuZHMubGVuZ3RoIC0gMV07XG4gICAgICBsZXQgY29tbWFuZDogSUNvbW1hbmQgPSB7XG4gICAgICAgIHR5cGU6ICcnLFxuICAgICAgICB3aGVyZTogbnVsbCxcbiAgICAgICAgbGltaXQ6IG51bGwsXG4gICAgICAgIG9yZGVyQnk6IFtdLFxuICAgICAgICBncm91cEJ5OiBbXSxcbiAgICAgICAgYWdncmVnYXRlOiBbXVxuICAgICAgfTtcbiAgICAgIHJlZHVjZWRDb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXG4gICAgICBpZiAoXG4gICAgICAgIGxhc3RDb21tYW5kICYmIChcbiAgICAgICAgICAhbGFzdENvbW1hbmRbY29tcG9zZXJDb21tYW5kLnR5cGVdIHx8XG4gICAgICAgICAgbGFzdENvbW1hbmRbY29tcG9zZXJDb21tYW5kLnR5cGVdIGluc3RhbmNlb2YgQXJyYXlcbiAgICAgICAgKVxuICAgICAgKSB7XG5cbiAgICAgICAgY29tbWFuZCA9IGxhc3RDb21tYW5kO1xuICAgICAgICByZWR1Y2VkQ29tbWFuZHMucG9wKCk7XG5cbiAgICAgIH1cblxuICAgICAgaWYgKGNvbW1hbmRbY29tcG9zZXJDb21tYW5kLnR5cGVdIGluc3RhbmNlb2YgQXJyYXkpIHtcblxuICAgICAgICBjb21tYW5kW2NvbXBvc2VyQ29tbWFuZC50eXBlXS5wdXNoKFxuICAgICAgICAgIE9iamVjdC5rZXlzKGNvbXBvc2VyQ29tbWFuZC5kYXRhKS5yZWR1Y2UoKHA6IElBbnlPYmplY3QsIGM6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChwW2NdID0gY29tcG9zZXJDb21tYW5kLmRhdGFbY10sIHApO1xuICAgICAgICAgIH0sIHt9KVxuICAgICAgICApO1xuXG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIGNvbW1hbmRbY29tcG9zZXJDb21tYW5kLnR5cGVdID0gT2JqZWN0LmtleXMoY29tcG9zZXJDb21tYW5kLmRhdGEpLnJlZHVjZSgocDogSUFueU9iamVjdCwgYzogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIChwW2NdID0gY29tcG9zZXJDb21tYW5kLmRhdGFbY10sIHApO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZHVjZWRDb21tYW5kcztcblxuICAgIH0sIFtdKTtcblxuICAgIHJldHVybiB7XG4gICAgICBjb21tYW5kczogY29tbWFuZHMsXG4gICAgICBqb2luczogam9pbnNcbiAgICB9O1xuXG4gIH1cblxuICAvKipcbiAgICogUmVkdWNlcyBhbiBhcnJheSBvZiBjb21tYW5kcyBmcm9tIHF1ZXJ5IGluZm9ybXRpb24gdG8gYSBTUUwgcXVlcnlcbiAgICogQHBhcmFtIHtBcnJheX0gW2NvbW1hbmRBcnJheV1cbiAgICogQHBhcmFtIHtBcnJheX0gW2luY2x1ZGVDb2x1bW5zPSpdIFdoaWNoIGNvbHVtbnMgdG8gaW5jbHVkZSwgaW5jbHVkZXMgYWxsIGJ5IGRlZmF1bHRcbiAgICogQHJldHVybiB7T2JqZWN0fSBMb29rcyBsaWtlIHtzcWw6IFtdLCBwYXJhbXM6IFtdfVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfX3JlZHVjZUNvbW1hbmRzVG9RdWVyeV9fKGNvbW1hbmRBcnJheTogSUNvbW1hbmRbXSwgaW5jbHVkZUNvbHVtbnM/OiBzdHJpbmdbXSk6IElRdWVyeSB7XG5cbiAgICBsZXQgbGFzdEFnZ3JlZ2F0ZTogYW55W10gfCBudWxsID0gbnVsbDtcblxuICAgIHJldHVybiBjb21tYW5kQXJyYXkucmVkdWNlKChwcmV2LCBjb21tYW5kLCBpKSA9PiB7XG5cbiAgICAgIGlmIChjb21tYW5kLmFnZ3JlZ2F0ZSAmJiBjb21tYW5kLmFnZ3JlZ2F0ZS5sZW5ndGggJiZcbiAgICAgICAgICBjb21tYW5kLmdyb3VwQnkgJiYgY29tbWFuZC5ncm91cEJ5Lmxlbmd0aCkge1xuICAgICAgICBsYXN0QWdncmVnYXRlID0gY29tbWFuZC5hZ2dyZWdhdGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRhYmxlID0gYHQke2l9YDtcblxuICAgICAgY29uc3QgbXVsdGlGaWx0ZXIgPSB0aGlzLmRiLmFkYXB0ZXIuY3JlYXRlTXVsdGlGaWx0ZXIodGFibGUsIGNvbW1hbmQud2hlcmUgPyBjb21tYW5kLndoZXJlLmNvbXBhcmlzb25zIDogW10pO1xuICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5kYi5hZGFwdGVyLmdldFBhcmFtc0Zyb21NdWx0aUZpbHRlcihtdWx0aUZpbHRlcik7XG5cbiAgICAgIGNvbnN0IGpvaW5zID0gbnVsbDtcbiAgICAgIGxldCBjb2x1bW5zOiBhbnkgfCBzdHJpbmdbXSA9IGluY2x1ZGVDb2x1bW5zIHx8IGxhc3RBZ2dyZWdhdGUgfHwgdGhpcy5Nb2RlbC5jb2x1bW5OYW1lcygpO1xuXG4gICAgICBjb2x1bW5zID0gY29sdW1uc1xuICAgICAgICAubWFwKChjOiBhbnkpID0+IHR5cGVvZiBjICE9PSAnc3RyaW5nJyA/IGMgOiB7IGNvbHVtbk5hbWVzOiBbY10sIGFsaWFzOiBjLCB0cmFuc2Zvcm1hdGlvbjogKHY6IGFueSkgPT4gdiB9KVxuICAgICAgICAubWFwKChjOiBhbnkpID0+IE9iamVjdC5rZXlzKGMpLnJlZHVjZSgocDogYW55LCBrOiBzdHJpbmcpID0+IHsgcmV0dXJuIChwW2tdID0gY1trXSwgcCk7IH0sIHt9KSk7XG5cbiAgICAgIGNvbW1hbmQuZ3JvdXBCeSAmJiAhY29tbWFuZC5ncm91cEJ5Lmxlbmd0aCAmJiBjb2x1bW5zLmZvckVhY2goKGM6IGFueSkgPT4ge1xuICAgICAgICBjLnRyYW5zZm9ybWF0aW9uID0gKHY6IGFueSkgPT4gdjtcbiAgICAgICAgYy5jb2x1bW5OYW1lcyA9IFtjLmFsaWFzXTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzcWw6IHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZVNlbGVjdFF1ZXJ5KFxuICAgICAgICAgIHByZXYuc3FsIHx8IHsgdGFibGU6IHRoaXMuTW9kZWwudGFibGUoKSB9LFxuICAgICAgICAgIHRhYmxlLFxuICAgICAgICAgIGNvbHVtbnMsXG4gICAgICAgICAgbXVsdGlGaWx0ZXIsXG4gICAgICAgICAgam9pbnMsXG4gICAgICAgICAgY29tbWFuZC5ncm91cEJ5LFxuICAgICAgICAgIGNvbW1hbmQub3JkZXJCeSxcbiAgICAgICAgICBjb21tYW5kLmxpbWl0LFxuICAgICAgICAgIHByZXYucGFyYW1zLmxlbmd0aFxuICAgICAgICApLFxuICAgICAgICBwYXJhbXM6IHByZXYucGFyYW1zLmNvbmNhdChwYXJhbXMpXG4gICAgICB9O1xuXG4gICAgfSwgeyBzcWw6ICcnLCBwYXJhbXM6IFtdIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmUgYWxsIGpvaW5lZCBjb2x1bW4gZGF0YSBmb3IgYSBnaXZlbiBqb2luXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBqb2luTmFtZSBUaGUgbmFtZSBvZiB0aGUgam9pbiByZWxhdGlvbnNoaXBcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19qb2luZWRDb2x1bW5zX18oam9pbk5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlbGF0aW9uc2hpcCA9IDxSZWxhdGlvbnNoaXBQYXRoPiB0aGlzLk1vZGVsLnJlbGF0aW9uc2hpcHMoKS5maW5kRXhwbGljaXQoam9pbk5hbWUpO1xuICAgIHJldHVybiByZWxhdGlvbnNoaXAuZ2V0TW9kZWwoKS5jb2x1bW5OYW1lcygpLm1hcCgoY29sdW1uTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiBqb2luTmFtZSxcbiAgICAgICAgdGFibGU6IHJlbGF0aW9uc2hpcC5nZXRNb2RlbCgpLnRhYmxlKCksXG4gICAgICAgIGNvbHVtbk5hbWVzOiBbY29sdW1uTmFtZV0sXG4gICAgICAgIGFsaWFzOiBgXFwkJHtqb2luTmFtZX1cXCQke2NvbHVtbk5hbWV9YCxcbiAgICAgICAgdHJhbnNmb3JtYXRpb246ICh2OiBhbnkpID0+IHZcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgYSBTUUwgcXVlcnkgYW5kIGl0cyBhc3NvY2lhdGVkIHBhcmFtZXRlcnMgZnJvbSB0aGUgY3VycmVudCBjb21wb3NlciBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge0FycmF5fSBbaW5jbHVkZUNvbHVtbnM9Kl0gV2hpY2ggY29sdW1ucyB0byBpbmNsdWRlLCBpbmNsdWRlcyBhbGwgYnkgZGVmYXVsdFxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtkaXNhYmxlSm9pbnM9ZmFsc2VdIERpc2FibGUgam9pbnMgaWYgeW91IGp1c3Qgd2FudCBhIHN1YnNldCBvZiBkYXRhXG4gICAqIEByZXR1cm4ge09iamVjdH0gSGFzIFwicGFyYW1zXCIgYW5kIFwic3FsXCIgcHJvcGVydGllcy5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19nZW5lcmF0ZVF1ZXJ5X18oaW5jbHVkZUNvbHVtbnM/OiBzdHJpbmdbXSwgZGlzYWJsZUpvaW5zPzogYm9vbGVhbik6IElRdWVyeSB7XG5cbiAgICBkaXNhYmxlSm9pbnMgPSBkaXNhYmxlSm9pbnMgfHwgdGhpcy5fX2lzR3JvdXBlZF9fKCk7XG5cbiAgICBjb25zdCBxdWVyeUluZm8gPSB0aGlzLl9fcmVkdWNlVG9RdWVyeUluZm9ybWF0aW9uX18odGhpcy5fX2NvbGxhcHNlX18oKSk7XG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLl9fcmVkdWNlQ29tbWFuZHNUb1F1ZXJ5X18ocXVlcnlJbmZvLmNvbW1hbmRzLCBpbmNsdWRlQ29sdW1ucyk7XG5cbiAgICByZXR1cm4gZGlzYWJsZUpvaW5zID8gcXVlcnkgOiB0aGlzLl9fYWRkSm9pbnNUb1F1ZXJ5X18oXG4gICAgICBxdWVyeSxcbiAgICAgIHF1ZXJ5SW5mbyxcbiAgICAgIGluY2x1ZGVDb2x1bW5zXG4gICAgKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIGEgU1FMIGNvdW50IHF1ZXJ5XG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gW3VzZUxpbWl0PWZhbHNlXSBHZW5lcmF0ZXMgQ09VTlQgdXNpbmcgbGltaXQgY29tbWFuZCBhcyB3ZWxsXG4gICAqIEByZXR1cm4ge09iamVjdH0gSGFzIFwicGFyYW1zXCIgYW5kIFwic3FsXCIgcHJvcGVydGllcy5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19nZW5lcmF0ZUNvdW50UXVlcnlfXyh1c2VMaW1pdD86IGJvb2xlYW4pOiBJUXVlcnkge1xuXG4gICAgbGV0IGNvbGxhcHNlZCA9IHRoaXMuX19jb2xsYXBzZV9fKCk7XG4gICAgY29sbGFwc2VkID0gdXNlTGltaXQgPyBjb2xsYXBzZWQgOiB0aGlzLl9fcmVtb3ZlTGFzdExpbWl0Q29tbWFuZF9fKGNvbGxhcHNlZCk7XG4gICAgY29uc3QgcXVlcnlJbmZvID0gdGhpcy5fX3JlZHVjZVRvUXVlcnlJbmZvcm1hdGlvbl9fKGNvbGxhcHNlZCk7XG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLl9fcmVkdWNlQ29tbWFuZHNUb1F1ZXJ5X18ocXVlcnlJbmZvLmNvbW1hbmRzKTtcbiAgICBxdWVyeS5zcWwgPSB0aGlzLmRiLmFkYXB0ZXIuZ2VuZXJhdGVDb3VudFF1ZXJ5KHF1ZXJ5LnNxbCwgJ2MnKTtcbiAgICByZXR1cm4gcXVlcnk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgSm9pbnMgdG8gYSBxdWVyeSBmcm9tIHF1ZXJ5SW5mb1xuICAgKiBAcGFyYW0ge09iamVjdH0gcXVlcnkgTXVzdCBiZSBmb3JtYXQge3NxbDogJycsIHBhcmFtczogW119XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBxdWVyeUluZm8gTXVzdCBiZSBmb3JtYXQge2NvbW1hbmRzOiBbXSwgam9pbnM6IFtdfVxuICAgKiBAcGFyYW0ge0FycmF5fSBbaW5jbHVkZUNvbHVtbnM9Kl0gV2hpY2ggY29sdW1ucyB0byBpbmNsdWRlLCBpbmNsdWRlcyBhbGwgYnkgZGVmYXVsdFxuICAgKiBAcmV0dXJuIHtPYmplY3R9IEhhcyBcInBhcmFtc1wiIGFuZCBcInNxbFwiIHByb3BlcnRpZXMuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIF9fYWRkSm9pbnNUb1F1ZXJ5X18ocXVlcnk6IElRdWVyeSwgcXVlcnlJbmZvOiBJUXVlcnlJbmZvLCBpbmNsdWRlQ29sdW1ucz86IHN0cmluZ1tdKTogSVF1ZXJ5IHtcblxuICAgIGxldCBjb2x1bW5zOiBhbnkgPSBpbmNsdWRlQ29sdW1ucyB8fCB0aGlzLk1vZGVsLmNvbHVtbk5hbWVzKCk7XG5cbiAgICBjb25zdCBqb2luczogSUpvaW5zT2JqZWN0ID0gcXVlcnlJbmZvLmpvaW5zO1xuXG4gICAgT2JqZWN0LmtleXMoam9pbnMpLmZvckVhY2goam9pbk5hbWUgPT4ge1xuICAgICAgKDxJSm9pbltdPmpvaW5zW2pvaW5OYW1lXSkuZm9yRWFjaChqID0+IHtcbiAgICAgICAgY29sdW1ucyA9IGNvbHVtbnMuY29uY2F0KHRoaXMuX19qb2luZWRDb2x1bW5zX18oai5qb2luQWxpYXMpKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgam9pbnNBcnJheSA9IE9iamVjdC5rZXlzKGpvaW5zKS5tYXAoayA9PiBqb2luc1trXSk7XG4gICAgbGV0IHBhcmFtcyA9IHF1ZXJ5LnBhcmFtcy5zbGljZSgpO1xuXG4gICAgam9pbnNBcnJheS5mb3JFYWNoKChqb2luOiBJSm9pbltdKSA9PiB7XG5cbiAgICAgIGpvaW4uZm9yRWFjaCgoajogSUpvaW4pID0+IHtcbiAgICAgICAgcGFyYW1zID0gcGFyYW1zLmNvbmNhdCh0aGlzLmRiLmFkYXB0ZXIuZ2V0UGFyYW1zRnJvbU11bHRpRmlsdGVyKGoubXVsdGlGaWx0ZXIpKTtcbiAgICAgIH0pO1xuXG4gICAgfSk7XG5cbiAgICAvLyBTZXQgam9pbiBPcmRlckJ5cy4uLiBpbiByZXZlcnNlIG9yZGVyXG4gICAgY29uc3Qgb3JkZXJCeSA9IHF1ZXJ5SW5mby5jb21tYW5kcy5yZWR1Y2UoKGFycjogSUNvbW1hbmRbXSwgY29tbWFuZDogSUNvbW1hbmQpID0+IHtcbiAgICAgIGNvbW1hbmQub3JkZXJCeSAmJiAoYXJyID0gY29tbWFuZC5vcmRlckJ5LmNvbmNhdChhcnIpKTtcbiAgICAgIHJldHVybiBhcnI7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gV2hlbiBkb2luZyBqb2lucywgd2UgY291bnQgcGFyYW1PZmZzZXQgYXMgdGhlIGxhc3Qgd2hlcmUgcGFyYW1ldGVyIGxlbmd0aFxuICAgIC8vIEJlY2F1c2Ugd2UgYWRkIGluIGEgYnVuY2ggb2YgcGFyYW1ldGVycyBhdCB0aGUgZW5kLlxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNxbDogdGhpcy5kYi5hZGFwdGVyLmdlbmVyYXRlU2VsZWN0UXVlcnkoXG4gICAgICAgIHF1ZXJ5LnNxbCxcbiAgICAgICAgJ2onLFxuICAgICAgICBjb2x1bW5zLFxuICAgICAgICBudWxsLFxuICAgICAgICBqb2lucyxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgb3JkZXJCeSxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgcXVlcnkucGFyYW1zLmxlbmd0aFxuICAgICAgKSxcbiAgICAgIHBhcmFtczogcGFyYW1zXG4gICAgfTtcblxuICB9XG5cbiAgLyoqXG4gICAqIFdoZW4gdXNpbmcgQ29tcG9zZXIjd2hlcmUsIGZvcm1hdCBhbGwgcHJvdmlkZWQgY29tcGFyaXNvbnNcbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbXBhcmlzb25zIENvbXBhcmlzb25zIG9iamVjdC4ge2FnZV9fbHRlOiAyN30sIGZvciBleGFtcGxlLlxuICAgKiBAcGFyYW0ge05vZGFsLk1vZGVsfSBNb2RlbCB0aGUgbW9kZWwgdG8gdXNlIGFzIHRoZSBiYXNpcyBmb3IgY29tcGFyaXNvbi4gRGVmYXVsdCB0byBjdXJyZW50IG1vZGVsLlxuICAgKiBAcmV0dXJuIHtBcnJheX1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX19wYXJzZUNvbXBhcmlzb25zX18oY29tcGFyaXNvbnM6IElDb21wYXJpc29uLCBtb2RlbD86IHR5cGVvZiBNb2RlbCkge1xuXG4gICAgY29uc3QgbW9kZWxDb25zdHJ1Y3RvciA9IG1vZGVsIHx8IHRoaXMuTW9kZWw7XG5cbiAgICBjb25zdCBjb21wYXJhdG9ycyA9IHRoaXMuZGIuYWRhcHRlci5jb21wYXJhdG9ycztcbiAgICBjb25zdCBjb2x1bW5Mb29rdXAgPSBtb2RlbENvbnN0cnVjdG9yLmNvbHVtbkxvb2t1cCgpO1xuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKGNvbXBhcmlzb25zKVxuICAgICAgLm1hcChjb21wYXJpc29uID0+IHtcblxuICAgICAgICBsZXQgY29sdW1uID0gY29tcGFyaXNvbi5zcGxpdCgnX18nKTtcbiAgICAgICAgbGV0IHJlbDogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IGpvaW5OYW1lOiBzdHJpbmc7XG5cbiAgICAgICAgbGV0IGNvbXBhcmF0b3IgPSA8c3RyaW5nPmNvbHVtbi5wb3AoKTtcbiAgICAgICAgaWYgKCFjb21wYXJhdG9yc1tjb21wYXJhdG9yXSkge1xuICAgICAgICAgIGNvbHVtbi5wdXNoKGNvbXBhcmF0b3IpO1xuICAgICAgICAgIGNvbXBhcmF0b3IgPSAnaXMnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbHVtbi5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgam9pbk5hbWUgPSBjb2x1bW4uc2xpY2UoMCwgY29sdW1uLmxlbmd0aCAtIDEpLmpvaW4oJ19fJyk7XG4gICAgICAgICAgcmVsID0gKDx0eXBlb2YgTW9kZWw+bW9kZWxDb25zdHJ1Y3RvcikucmVsYXRpb25zaGlwKGpvaW5OYW1lKTtcbiAgICAgICAgICBjb2x1bW4gPSBjb2x1bW4uc2xpY2UoY29sdW1uLmxlbmd0aCAtIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHRhYmxlID0gbnVsbDtcbiAgICAgICAgbGV0IGpvaW5lZCA9IGZhbHNlO1xuICAgICAgICBsZXQgam9pbnMgPSBudWxsO1xuXG4gICAgICAgIGlmIChyZWwpIHtcblxuICAgICAgICAgIC8vIGlmIGl0J3Mgbm90IGZvdW5kLCByZXR1cm4gbnVsbC4uLlxuICAgICAgICAgIGlmICghcmVsLmdldE1vZGVsKCkuaGFzQ29sdW1uKGNvbHVtblswXSkpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRhYmxlID0gcmVsLmdldE1vZGVsKCkudGFibGUoKTtcbiAgICAgICAgICBqb2luZWQgPSB0cnVlO1xuICAgICAgICAgIGpvaW5zID0gcmVsLmpvaW5zKCd3Jyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSBjb2x1bW5bMF07XG5cbiAgICAgICAgLy8gYmxvY2sgb3V0IGJhZCBjb2x1bW4gbmFtZXNcbiAgICAgICAgaWYgKCFyZWwgJiYgIW1vZGVsQ29uc3RydWN0b3IuaGFzQ29sdW1uKGNvbHVtbk5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHRhYmxlOiB0YWJsZSxcbiAgICAgICAgICBjb2x1bW5OYW1lOiBjb2x1bW5OYW1lLFxuICAgICAgICAgIGNvbXBhcmF0b3I6IGNvbXBhcmF0b3IsXG4gICAgICAgICAgdmFsdWU6IGNvbXBhcmlzb25zW2NvbXBhcmlzb25dLFxuICAgICAgICAgIGpvaW5lZDogam9pbmVkLFxuICAgICAgICAgIGpvaW5zOiBqb2luc1xuICAgICAgICB9O1xuICAgICAgfSk7XG5cbiAgfVxuXG4gIHByaXZhdGUgX19maWx0ZXJIaWRkZW5fXyhtb2RlbENvbnN0cnVjdG9yOiB0eXBlb2YgTW9kZWwsIGNvbXBhcmlzb25zQXJyYXk6IElDb21wYXJpc29uW10pIHtcblxuICAgIGNvbXBhcmlzb25zQXJyYXkgPSAoY29tcGFyaXNvbnNBcnJheSB8fCBbXSkuZmlsdGVyKGMgPT4gYyk7XG5cbiAgICBjb25zdCBjb21wYXJhdG9ycyA9IHRoaXMuZGIuYWRhcHRlci5jb21wYXJhdG9ycztcblxuICAgIHJldHVybiBjb21wYXJpc29uc0FycmF5Lm1hcCgoY29tcGFyaXNvbnM6IGFueSkgPT4ge1xuXG4gICAgICBPYmplY3Qua2V5cyhjb21wYXJpc29ucykuZm9yRWFjaChjb21wYXJpc29uID0+IHtcblxuICAgICAgICBsZXQgY01vZGVsID0gbW9kZWxDb25zdHJ1Y3RvcjtcblxuICAgICAgICBjb25zdCBjb2x1bW4gPSBjb21wYXJpc29uLnNwbGl0KCdfXycpO1xuICAgICAgICBjb25zdCBjb21wYXJhdG9yID0gY29sdW1uLnBvcCgpO1xuICAgICAgICBjb21wYXJhdG9yICYmICFjb21wYXJhdG9yc1tjb21wYXJhdG9yXSAmJiBjb2x1bW4ucHVzaChjb21wYXJhdG9yKTtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjb2x1bW4ucG9wKCk7XG4gICAgICAgIGNvbnN0IHJlbE5hbWUgPSBjb2x1bW4uam9pbignX18nKTtcbiAgICAgICAgaWYgKHJlbE5hbWUpIHtcbiAgICAgICAgICBjb25zdCByZWwgPSBjTW9kZWwucmVsYXRpb25zaGlwKHJlbE5hbWUpO1xuICAgICAgICAgIGlmICghcmVsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNNb2RlbCA9IHJlbC5nZXRNb2RlbCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkICYmIGNNb2RlbC5pc0hpZGRlbihmaWVsZCkpIHtcbiAgICAgICAgICBjb21wYXJpc29uICYmIGRlbGV0ZSBjb21wYXJpc29uc1tjb21wYXJpc29uXTtcbiAgICAgICAgfVxuXG4gICAgICB9KTtcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGNvbXBhcmlzb25zKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb21wYXJpc29ucztcblxuICAgIH0pLmZpbHRlcihjb21wYXJpc29ucyA9PiBjb21wYXJpc29ucyk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgY29tcGFyaXNvbnMgdG8gU1FMIFdIRVJFIGNsYXVzZS4gRG9lcyBub3QgYWxsb3cgZmlsdGVyaW5nIGlmIE1vZGVsLmhpZGVzKCkgaGFzIGJlZW4gY2FsbGVkLlxuICAgKiBAcGFyYW0ge09iamVjdH0gY29tcGFyaXNvbnMgQ29tcGFyaXNvbnMgb2JqZWN0LiB7YWdlX19sdGU6IDI3fSwgZm9yIGV4YW1wbGUuXG4gICAqIEByZXR1cm4ge05vZGFsLkNvbXBvc2VyfSBuZXcgQ29tcG9zZXIgaW5zdGFuY2VcbiAgICovXG4gIHB1YmxpYyBzYWZlV2hlcmUoLi4uY29tcGFyaXNvbnNBcnJheTogSUNvbXBhcmlzb25bXSkge1xuXG4gICAgaWYgKCEoY29tcGFyaXNvbnNBcnJheSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgY29tcGFyaXNvbnNBcnJheSA9IFtdLnNsaWNlLmNhbGwoY29tcGFyaXNvbnNBcnJheSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMud2hlcmUoXG4gICAgICB0aGlzLl9fZmlsdGVySGlkZGVuX18oXG4gICAgICAgIHRoaXMuTW9kZWwsXG4gICAgICAgIGNvbXBhcmlzb25zQXJyYXlcbiAgICAgIClcbiAgICApO1xuXG4gIH1cblxuICAvKipcbiAgICogSm9pbiBpbiBhIHJlbGF0aW9uc2hpcC4gRmlsdGVycyBvdXQgaGlkZGVuIGZpZWxkcyBmcm9tIGNvbXBhcmlzb25zLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gam9pbk5hbWUgVGhlIG5hbWUgb2YgdGhlIGpvaW5lZCByZWxhdGlvbnNoaXBcbiAgICogQHBhcmFtIHthcnJheX0gY29tcGFyaXNvbnNBcnJheSBjb21wYXJpc29ucyB0byBwZXJmb3JtIG9uIHRoaXMgam9pbiAoY2FuIGJlIG92ZXJsb2FkZWQpXG4gICAqL1xuICBwdWJsaWMgc2FmZUpvaW4oam9pbk5hbWU6IHN0cmluZywgLi4uY29tcGFyaXNvbnNBcnJheTogSUNvbXBhcmlzb25bXSkge1xuXG4gICAgaWYgKCEoY29tcGFyaXNvbnNBcnJheSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgY29tcGFyaXNvbnNBcnJheSA9IFtdLnNsaWNlLmNhbGwoY29tcGFyaXNvbnNBcnJheSwgMSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVsYXRpb25zaGlwID0gdGhpcy5Nb2RlbC5yZWxhdGlvbnNoaXAoam9pbk5hbWUpO1xuICAgIGlmICghcmVsYXRpb25zaGlwKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5qb2luKFxuICAgICAgam9pbk5hbWUsXG4gICAgICB0aGlzLl9fZmlsdGVySGlkZGVuX18oXG4gICAgICAgIHJlbGF0aW9uc2hpcC5nZXRNb2RlbCgpLFxuICAgICAgICBjb21wYXJpc29uc0FycmF5XG4gICAgICApXG4gICAgKTtcblxuICB9XG5cbiAgLy8gU21lbGx5XG4gIC8qKlxuICAgKiBBZGQgY29tcGFyaXNvbnMgdG8gU1FMIFdIRVJFIGNsYXVzZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbXBhcmlzb25zIENvbXBhcmlzb25zIG9iamVjdC4ge2FnZV9fbHRlOiAyN30sIGZvciBleGFtcGxlLlxuICAgKiBAcmV0dXJuIHtOb2RhbC5Db21wb3Nlcn0gbmV3IENvbXBvc2VyIGluc3RhbmNlXG4gICAqL1xuICBwdWJsaWMgd2hlcmUoLi4uY29tcGFyaXNvbnNBcnJheTogSUNvbXBhcmlzb25bXSk6IENvbXBvc2VyIHtcblxuICAgIGlmICghKGNvbXBhcmlzb25zQXJyYXkgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIGNvbXBhcmlzb25zQXJyYXkgPSBbXS5zbGljZS5jYWxsKGNvbXBhcmlzb25zQXJyYXkpO1xuICAgIH1cblxuICAgIGNvbXBhcmlzb25zQXJyYXkgPSBjb21wYXJpc29uc0FycmF5Lm1hcChjb21wYXJpc29ucyA9PiB7XG4gICAgICByZXR1cm4gT2JqZWN0LmtleXMoY29tcGFyaXNvbnMpLnJlZHVjZSgocDogSUFueU9iamVjdCwgYzogc3RyaW5nKSA9PiB7IHJldHVybiAocFtjXSA9IGNvbXBhcmlzb25zW2NdLCBwKTsgfSwge30pO1xuICAgIH0pO1xuXG4gICAgbGV0IG9yZGVyOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbiAgICBsZXQgb2Zmc2V0OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IGNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbiAgICBjb21wYXJpc29uc0FycmF5LmZvckVhY2goY29tcGFyaXNvbnMgPT4ge1xuXG4gICAgICBpZiAoJ19fb3JkZXInIGluIGNvbXBhcmlzb25zKSB7XG4gICAgICAgIG9yZGVyID0gKDxzdHJpbmc+Y29tcGFyaXNvbnMuX19vcmRlcikuc3BsaXQoJyAnKTtcbiAgICAgICAgZGVsZXRlIGNvbXBhcmlzb25zLl9fb3JkZXI7XG4gICAgICB9XG5cbiAgICAgIGlmICgnX19vZmZzZXQnIGluIGNvbXBhcmlzb25zIHx8ICdfX2NvdW50JyBpbiBjb21wYXJpc29ucykge1xuICAgICAgICBvZmZzZXQgPSBjb21wYXJpc29ucy5fX29mZnNldDtcbiAgICAgICAgY291bnQgPSBjb21wYXJpc29ucy5fX2NvdW50O1xuICAgICAgICBkZWxldGUgY29tcGFyaXNvbnMuX19vZmZzZXQ7XG4gICAgICAgIGRlbGV0ZSBjb21wYXJpc29ucy5fX2NvdW50O1xuICAgICAgfVxuXG4gICAgfSk7XG5cbiAgICBpZiAob3JkZXIgfHwgb2Zmc2V0IHx8IGNvdW50KSB7XG4gICAgICBsZXQgY29tcG9zZXIgPSAob3JkZXIgJiYgb3JkZXIubGVuZ3RoID49IDEpID8gdGhpcy5vcmRlckJ5KG9yZGVyWzBdLCBvcmRlclsxXSkgOiB0aGlzO1xuICAgICAgKG9mZnNldCB8fCBjb3VudCkgJiYgKGNvbXBvc2VyID0gY29tcG9zZXIubGltaXQob2Zmc2V0IHx8IDAsIGNvdW50IHx8IDApKTtcbiAgICAgIHJldHVybiBjb21wb3Nlci53aGVyZShjb21wYXJpc29uc0FycmF5KTtcbiAgICB9XG5cbiAgICB0aGlzLl9jb21tYW5kID0ge1xuICAgICAgdHlwZTogJ3doZXJlJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgY29tcGFyaXNvbnM6IGNvbXBhcmlzb25zQXJyYXlcbiAgICAgICAgICAubWFwKGNvbXBhcmlzb25zID0+IHRoaXMuX19wYXJzZUNvbXBhcmlzb25zX18oY29tcGFyaXNvbnMpKVxuICAgICAgICAgIC5maWx0ZXIoZiA9PiBmLmxlbmd0aClcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBDb21wb3Nlcih0aGlzLk1vZGVsLCB0aGlzKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIE9yZGVyIGJ5IGZpZWxkIGJlbG9uZ2luZyB0byB0aGUgY3VycmVudCBDb21wb3NlciBpbnN0YW5jZSdzIG1vZGVsLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmllbGQgRmllbGQgdG8gb3JkZXIgYnlcbiAgICogQHBhcmFtIHtzdHJpbmd9IGRpcmVjdGlvbiBNdXN0IGJlICdBU0MnIG9yICdERVNDJ1xuICAgKiBAcmV0dXJuIHtOb2RhbC5Db21wb3Nlcn0gbmV3IENvbXBvc2VyIGluc3RhbmNlXG4gICAqL1xuICBwdWJsaWMgb3JkZXJCeShmaWVsZDogc3RyaW5nLCBkaXJlY3Rpb246ICdBU0MnIHwgJ0RTQycgfCBhbnkgPSAnQVNDJyk6IENvbXBvc2VyIHtcblxuICAgIGxldCB0cmFuc2Zvcm1hdGlvbjogRnVuY3Rpb247XG4gICAgbGV0IGZpZWxkczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmICh0eXBlb2YgZmllbGQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGZpZWxkcyA9IHV0aWxpdGllcy5nZXRGdW5jdGlvblBhcmFtZXRlcnMoZmllbGQpO1xuICAgICAgdHJhbnNmb3JtYXRpb24gPSBmaWVsZDtcbiAgICB9IGVsc2Uge1xuICAgICAgZmllbGRzID0gW2ZpZWxkXTtcbiAgICAgIHRyYW5zZm9ybWF0aW9uID0gKHY6IGFueSkgPT4gYCR7dn1gO1xuICAgIH1cblxuICAgIGZpZWxkcy5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmICghdGhpcy5Nb2RlbC5oYXNDb2x1bW4oZmllbGQpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IG9yZGVyIGJ5ICR7ZmllbGR9LCBpdCBkb2VzIG5vdCBiZWxvbmcgdG8gJHt0aGlzLk1vZGVsLm5hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLl9jb21tYW5kID0ge1xuICAgICAgdHlwZTogJ29yZGVyQnknLFxuICAgICAgZGF0YToge1xuICAgICAgICBjb2x1bW5OYW1lczogZmllbGRzLFxuICAgICAgICB0cmFuc2Zvcm1hdGlvbjogdHJhbnNmb3JtYXRpb24sXG4gICAgICAgIGRpcmVjdGlvblxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IENvbXBvc2VyKHRoaXMuTW9kZWwsIHRoaXMpO1xuXG4gIH1cblxuICAvKipcbiAgICogTGltaXQgdG8gYW4gb2Zmc2V0IGFuZCBjb3VudFxuICAgKiBAcGFyYW0ge251bWJlcn0gb2Zmc2V0IFRoZSBvZmZzZXQgYXQgd2hpY2ggdG8gc2V0IHRoZSBsaW1pdC4gSWYgdGhpcyBpcyB0aGUgb25seSBhcmd1bWVudCBwcm92aWRlZCwgaXQgd2lsbCBiZSB0aGUgY291bnQgaW5zdGVhZC5cbiAgICogQHBhcmFtIHtudW1iZXJ9IGNvdW50IFRoZSBudW1iZXIgb2YgcmVzdWx0cyB0byBiZSByZXR1cm5lZC4gQ2FuIGJlIG9taXR0ZWQsIGFuZCBpZiBvbWl0dGVkLCBmaXJzdCBhcmd1bWVudCBpcyB1c2VkIGZvciBjb3VudC5cbiAgICogQHJldHVybiB7Tm9kYWwuQ29tcG9zZXJ9IG5ldyBDb21wb3NlciBpbnN0YW5jZVxuICAgKi9cbiAgcHVibGljIGxpbWl0KG9mZnNldDogbnVtYmVyIHwgc3RyaW5nLCBjb3VudD86IG51bWJlciB8IHN0cmluZyk6IENvbXBvc2VyIHtcblxuICAgIGlmICh0aGlzLl9jb21tYW5kKSB7XG4gICAgICByZXR1cm4gbmV3IENvbXBvc2VyKHRoaXMuTW9kZWwsIHRoaXMpLmxpbWl0KG9mZnNldCwgY291bnQpO1xuICAgIH1cblxuICAgIGlmIChjb3VudCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb3VudCA9IG9mZnNldDtcbiAgICAgIG9mZnNldCA9IDA7XG4gICAgfVxuXG4gICAgY291bnQgPSBwYXJzZUludCg8c3RyaW5nPiBjb3VudCwgMTApO1xuICAgIG9mZnNldCA9IHBhcnNlSW50KDxzdHJpbmc+IG9mZnNldCwgMTApO1xuXG4gICAgdGhpcy5fY29tbWFuZCA9IHtcbiAgICAgIHR5cGU6ICdsaW1pdCcsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGNvdW50OiBjb3VudCxcbiAgICAgICAgb2Zmc2V0OiBvZmZzZXRcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBDb21wb3Nlcih0aGlzLk1vZGVsLCB0aGlzKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEpvaW4gaW4gYSByZWxhdGlvbnNoaXAuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBqb2luTmFtZSBUaGUgbmFtZSBvZiB0aGUgam9pbmVkIHJlbGF0aW9uc2hpcFxuICAgKiBAcGFyYW0ge2FycmF5fSBjb21wYXJpc29uc0FycmF5IGNvbXBhcmlzb25zIHRvIHBlcmZvcm0gb24gdGhpcyBqb2luIChjYW4gYmUgb3ZlcmxvYWRlZClcbiAgICovXG4gIHB1YmxpYyBqb2luKGpvaW5OYW1lOiBzdHJpbmcsIGNvbXBhcmlzb25zQXJyYXk/OiBJQ29tcGFyaXNvbltdIHwgSUNvbXBhcmlzb24sXG4gICAgICAgICAgICAgIG9yZGVyQnk6ICdBU0MnIHwgJ0RFU0MnID0gJ0FTQycsIGNvdW50PzogbnVtYmVyLCBvZmZzZXQ/OiBudW1iZXIpIHtcblxuICAgIC8vIEZJWE1FOiB2YWxpZGF0ZSBvcmRlckJ5XG4gICAgb3JkZXJCeSA9IG9yZGVyQnkgfHwgJyc7XG4gICAgY291bnQgPSBNYXRoLm1heCgwLCBjb3VudCB8IDApO1xuICAgIG9mZnNldCA9IE1hdGgubWF4KDAsIG9mZnNldCB8IDApO1xuXG4gICAgaWYgKCEoY29tcGFyaXNvbnNBcnJheSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgY29tcGFyaXNvbnNBcnJheSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICB9XG5cbiAgICBjb25zdCByZWxhdGlvbnNoaXAgPSB0aGlzLk1vZGVsLnJlbGF0aW9uc2hpcHMoKS5maW5kRXhwbGljaXQoam9pbk5hbWUpO1xuICAgIGlmICghcmVsYXRpb25zaGlwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vZGVsICR7dGhpcy5Nb2RlbC5uYW1lfSBkb2VzIG5vdCBoYXZlIHJlbGF0aW9uc2hpcCBcIiR7am9pbk5hbWV9XCIuYCk7XG4gICAgfVxuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXZhci1zZWxmXG4gICAgbGV0IGNvbXBvc2VyOiBDb21wb3NlciB8IG51bGwgPSB0aGlzO1xuICAgIHdoaWxlIChjb21wb3Nlcikge1xuICAgICAgaWYgKGNvbXBvc2VyLl9jb21tYW5kICYmIGNvbXBvc2VyLl9jb21tYW5kLnR5cGUgPT09ICdqb2luJyAmJiBjb21wb3Nlci5fY29tbWFuZC5kYXRhLm5hbWUgPT09IGpvaW5OYW1lKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgY29tcG9zZXIgPSBjb21wb3Nlci5fcGFyZW50O1xuICAgIH1cblxuICAgIGNvbnN0IGpvaW5EYXRhID0gcmVsYXRpb25zaGlwLmpvaW5zKCk7XG4gICAgam9pbkRhdGFbam9pbkRhdGEubGVuZ3RoIC0gMV0uam9pbkFsaWFzID0gam9pbk5hbWU7XG4gICAgam9pbkRhdGFbam9pbkRhdGEubGVuZ3RoIC0gMV0ucHJldkFsaWFzID0gam9pbk5hbWUuc3BsaXQoJ19fJykuc2xpY2UoMCwgLTEpLmpvaW4oJ19fJyk7XG4gICAgam9pbkRhdGFbam9pbkRhdGEubGVuZ3RoIC0gMV0ubXVsdGlGaWx0ZXIgPSB0aGlzLmRiLmFkYXB0ZXIuY3JlYXRlTXVsdGlGaWx0ZXIoXG4gICAgICBqb2luTmFtZSxcbiAgICAgIGNvbXBhcmlzb25zQXJyYXkgJiYgKDxJQ29tcGFyaXNvbltdPmNvbXBhcmlzb25zQXJyYXkpXG4gICAgICAgIC5tYXAoY29tcGFyaXNvbnMgPT4gdGhpcy5fX3BhcnNlQ29tcGFyaXNvbnNfXyhjb21wYXJpc29ucywgcmVsYXRpb25zaGlwLmdldE1vZGVsKCkpKVxuICAgICAgICAuZmlsdGVyKGYgPT4gZi5sZW5ndGgpXG4gICAgKTtcblxuICAgIC8vIEZJWE1FOiBpbXBsZW1lbnQgcHJvcGVybHlcbiAgICBqb2luRGF0YVtqb2luRGF0YS5sZW5ndGggLSAxXS5vcmRlckJ5ID0gb3JkZXJCeTtcbiAgICBqb2luRGF0YVtqb2luRGF0YS5sZW5ndGggLSAxXS5vZmZzZXQgPSBvZmZzZXQ7XG4gICAgam9pbkRhdGFbam9pbkRhdGEubGVuZ3RoIC0gMV0uY291bnQgPSBjb3VudDtcblxuICAgIHRoaXMuX2NvbW1hbmQgPSB7XG4gICAgICB0eXBlOiAnam9pbicsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIG5hbWU6IGpvaW5OYW1lLFxuICAgICAgICBqb2luRGF0YTogam9pbkRhdGFcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBDb21wb3Nlcih0aGlzLk1vZGVsLCB0aGlzKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEdyb3VwcyBieSBhIHNwZWNpZmljIGZpZWxkLCBvciBhIHRyYW5zZm9ybWF0aW9uIG9uIGEgZmllbGRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNvbHVtbiBUaGUgY29sdW1uIHRvIGdyb3VwIGJ5XG4gICAqL1xuICBwdWJsaWMgZ3JvdXBCeShjb2x1bW46IHN0cmluZykge1xuXG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdO1xuICAgIGxldCB0cmFuc2Zvcm1hdGlvbjogRnVuY3Rpb247XG5cbiAgICAvLyBUT0RPOiBNYWtlIHRoaXMgZnVuY3Rpb24gb3ZlcmxvYWRpbmcgbW9yZSBjbGVhclxuICAgIGlmICh0eXBlb2YgY29sdW1uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb2x1bW5zID0gdXRpbGl0aWVzLmdldEZ1bmN0aW9uUGFyYW1ldGVycyhjb2x1bW4pO1xuICAgICAgdHJhbnNmb3JtYXRpb24gPSBjb2x1bW47XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbHVtbnMgPSBbY29sdW1uXTtcbiAgICAgIHRyYW5zZm9ybWF0aW9uID0gKHY6IGFueSkgPT4gYCR7dn1gO1xuICAgIH1cblxuICAgIHRoaXMuX2NvbW1hbmQgPSB7XG4gICAgICB0eXBlOiAnZ3JvdXBCeScsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGNvbHVtbk5hbWVzOiBjb2x1bW5zLFxuICAgICAgICB0cmFuc2Zvcm1hdGlvbjogdHJhbnNmb3JtYXRpb25cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBDb21wb3Nlcih0aGlzLk1vZGVsLCB0aGlzKS5hZ2dyZWdhdGUoY29sdW1uKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIEFnZ3JlZ2F0ZXMgYSBmaWVsZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gYWxpYXMgVGhlIGFsaWFzIGZvciB0aGUgbmV3IGFnZ3JlZ2F0ZSBmaWVsZFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSB0cmFuc2Zvcm1hdGlvbiBUaGUgdHJhbnNmb3JtYXRpb24gdG8gYXBwbHkgdG8gY3JlYXRlIHRoZSBhZ2dyZWdhdGVcbiAgICovXG4gIHB1YmxpYyBhZ2dyZWdhdGUoYWxpYXM6IHN0cmluZywgdHJhbnNmb3JtYXRpb24/OiBGdW5jdGlvbikge1xuXG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdO1xuXG4gICAgLy8gVE9ETzogTWFrZSB0aGlzIGZ1bmN0aW9uIG92ZXJsb2FkaW5nIG1vcmUgY2xlYXJcbiAgICBpZiAodHlwZW9mIGFsaWFzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb2x1bW5zID0gdXRpbGl0aWVzLmdldEZ1bmN0aW9uUGFyYW1ldGVycyhhbGlhcyk7XG4gICAgICB0cmFuc2Zvcm1hdGlvbiA9IGFsaWFzO1xuICAgICAgYWxpYXMgPSBjb2x1bW5zLmpvaW4oJ19fXycpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRyYW5zZm9ybWF0aW9uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb2x1bW5zID0gdXRpbGl0aWVzLmdldEZ1bmN0aW9uUGFyYW1ldGVycyh0cmFuc2Zvcm1hdGlvbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbHVtbnMgPSBbYWxpYXNdO1xuICAgICAgdHJhbnNmb3JtYXRpb24gPSAodjogYW55KSA9PiB2O1xuICAgIH1cblxuICAgIHRoaXMuX2NvbW1hbmQgPSB7XG4gICAgICB0eXBlOiAnYWdncmVnYXRlJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgYWxpYXM6IGFsaWFzLFxuICAgICAgICBjb2x1bW5OYW1lczogY29sdW1ucyxcbiAgICAgICAgdHJhbnNmb3JtYXRpb246IHRyYW5zZm9ybWF0aW9uXG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgQ29tcG9zZXIodGhpcy5Nb2RlbCwgdGhpcyk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBDb3VudHMgdGhlIHJlc3VsdHMgaW4gdGhlIHF1ZXJ5XG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFN1cHBsaWVkIHdpdGggYW4gZXJyb3IgYW5kIHRoZSBpbnRlZ2VyIHZhbHVlIG9mIHRoZSBjb3VudFxuICAgKi9cbiAgcHVibGljIGNvdW50KGNhbGxiYWNrOiAoZXJyOiBFcnJvciwgY291bnQ6IG51bWJlcikgPT4gdm9pZCkge1xuXG4gICAgY29uc3QgY291bnRRdWVyeSA9IHRoaXMuX19nZW5lcmF0ZUNvdW50UXVlcnlfXyh0cnVlKTtcblxuICAgIHRoaXMuZGIucXVlcnkoY291bnRRdWVyeS5zcWwsIGNvdW50UXVlcnkucGFyYW1zLCAoZXJyOiBFcnJvciwgcmVzdWx0OiBhbnkpID0+IHtcblxuICAgICAgY2FsbGJhY2soZXJyLCAoKChyZXN1bHQgJiYgcmVzdWx0LnJvd3MpIHx8IFtdKVswXSB8fCB7fSkuX190b3RhbF9fIHx8IDApO1xuXG4gICAgfSk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIHRoZSBxdWVyeSB5b3UndmUgYmVlbiBjb21wb3NpbmcuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb24oe0Vycm9yfSwge05vZGFsLk1vZGVsQXJyYXl9KX0gY2FsbGJhY2sgVGhlIG1ldGhvZCB0byBleGVjdXRlIHdoZW4gdGhlIHF1ZXJ5IGlzIGNvbXBsZXRlXG4gICAqL1xuICBwdWJsaWMgZW5kKGNhbGxiYWNrOiAoZXJyOiBFcnJvciwgbW9kZWxBcnJheTogTW9kZWxBcnJheSkgPT4gdm9pZCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5fX2dlbmVyYXRlUXVlcnlfXygpO1xuICAgIGNvbnN0IGNvdW50UXVlcnkgPSB0aGlzLl9fZ2VuZXJhdGVDb3VudFF1ZXJ5X18oKTtcblxuICAgIGNvbnN0IGdyb3VwZWQgPSB0aGlzLl9faXNHcm91cGVkX18oKTtcblxuICAgIGNvbnN0IGxpbWl0Q29tbWFuZCA9IHRoaXMuX19nZXRMYXN0TGltaXRDb21tYW5kX18odGhpcy5fX2NvbGxhcHNlX18oKSk7XG4gICAgY29uc3Qgb2Zmc2V0ID0gbGltaXRDb21tYW5kICYmIGxpbWl0Q29tbWFuZC5fY29tbWFuZCA/IGxpbWl0Q29tbWFuZC5fY29tbWFuZC5kYXRhLm9mZnNldCA6IDA7XG5cbiAgICB0aGlzLmRiLnF1ZXJ5KGNvdW50UXVlcnkuc3FsLCBjb3VudFF1ZXJ5LnBhcmFtcywgKGVycjogRXJyb3IsIHJlc3VsdDogYW55KSA9PiB7XG4gICAgICBjb25zdCB0b3RhbCA9ICgoKHJlc3VsdCAmJiByZXN1bHQucm93cykgfHwgW10pWzBdIHx8IHt9KS5fX3RvdGFsX18gfHwgMDtcblxuICAgICAgaWYgKCF0b3RhbCkge1xuICAgICAgICBjb25zdCBtb2RlbHMgPSB0aGlzLl9fcGFyc2VNb2RlbHNGcm9tUm93c19fKFtdLCBncm91cGVkKTtcbiAgICAgICAgbW9kZWxzLnNldE1ldGEoeyBvZmZzZXQ6IG9mZnNldCwgdG90YWw6IHRvdGFsIH0pO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suY2FsbCh0aGlzLCBlcnIsIG1vZGVscyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGIucXVlcnkocXVlcnkuc3FsLCBxdWVyeS5wYXJhbXMsIChlcnI6IEVycm9yLCByZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICBjb25zdCByb3dzID0gcmVzdWx0ID8gKHJlc3VsdC5yb3dzIHx8IFtdKS5zbGljZSgpIDogW107XG4gICAgICAgIGNvbnN0IG1vZGVscyA9IHRoaXMuX19wYXJzZU1vZGVsc0Zyb21Sb3dzX18ocm93cywgZ3JvdXBlZCk7XG4gICAgICAgIG1vZGVscy5zZXRNZXRhKHsgb2Zmc2V0OiBvZmZzZXQsIHRvdGFsOiB0b3RhbCB9KTtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCBlcnIsIG1vZGVscyk7XG5cbiAgICAgIH0pO1xuXG4gICAgfSk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBTaG9ydGN1dCBmb3IgLmxpbWl0KDEpLmVuZChjYWxsYmFjaykgdGhhdCBvbmx5IHJldHVybnMgYSBtb2RlbCBvYmplY3Qgb3IgZXJyb3IgaWYgbm90IGZvdW5kXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIHRvIGV4ZWN1dGUsIHByb3ZpZGVzIGFuIGVycm9yIGFuZCBtb2RlbCBwYXJhbWV0ZXJcbiAgICovXG4gIHB1YmxpYyBmaXJzdChjYWxsYmFjazogKGVycjogRXJyb3IsIG1vZGVsOiBNb2RlbCkgPT4gdm9pZCkge1xuXG4gICAgcmV0dXJuIHRoaXMubGltaXQoMSkuZW5kKChlcnIsIG1vZGVscykgPT4ge1xuXG4gICAgICBpZiAoIWVyciAmJiAhbW9kZWxzLmxlbmd0aCkge1xuICAgICAgICBlcnIgPSBuZXcgRXJyb3IoYE5vIHJlY29yZHMgZm9yICR7dGhpcy5Nb2RlbC5uYW1lfSBmb3VuZCBpbiB5b3VyIHF1ZXJ5YCk7XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKGVyciwgbW9kZWxzWzBdKTtcblxuICAgIH0pO1xuXG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBxdWVyeSBhcyBhbiB1cGRhdGUgcXVlcnksIGNoYW5nZWQgYWxsIGZpZWxkcyBzcGVjaWZpZWQuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBmaWVsZHMgVGhlIG9iamVjdCBjb250YWluaW5nIGNvbHVtbnMgKGtleXMpIGFuZCBhc3NvY2lhdGVkIHZhbHVlcyB5b3UnZCBsaWtlIHRvIHVwZGF0ZVxuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHtFcnJvcn0sIHtOb2RhbC5Nb2RlbEFycmF5fSl9IGNhbGxiYWNrIFRoZSBjYWxsYmFjayBmb3IgdGhlIHVwZGF0ZSBxdWVyeVxuICAgKi9cbiAgcHVibGljIHVwZGF0ZShmaWVsZHM6IElBbnlPYmplY3QsIGNhbGxiYWNrOiAoZXJyOiBFcnJvciwgbW9kZWxBcnJheTogTW9kZWxBcnJheSkgPT4gdm9pZCkge1xuXG4gICAgaWYgKHRoaXMuX19pc0dyb3VwZWRfXygpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1cGRhdGUgZ3JvdXBlZCBxdWVyaWVzJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLl9fZ2VuZXJhdGVRdWVyeV9fKFsnaWQnXSwgdHJ1ZSk7XG4gICAgY29uc3QgY29sdW1ucyA9IE9iamVjdC5rZXlzKGZpZWxkcyk7XG4gICAgbGV0IHBhcmFtcyA9IGNvbHVtbnMubWFwKChjOiBzdHJpbmcpID0+IGZpZWxkc1tjXSk7XG5cbiAgICBjb25zdCBjb2x1bW5OYW1lcyA9IGNvbHVtbnMuZmlsdGVyKCh2LCBpKSA9PiB0eXBlb2YgcGFyYW1zW2ldICE9PSAnZnVuY3Rpb24nKTtcbiAgICBjb25zdCBjb2x1bW5GdW5jdGlvbnMgPSBjb2x1bW5zXG4gICAgICAubWFwKCh2LCBpKSA9PiBbdiwgcGFyYW1zW2ldXSlcbiAgICAgIC5maWx0ZXIoKHYsIGkpID0+IHR5cGVvZiBwYXJhbXNbaV0gPT09ICdmdW5jdGlvbicpO1xuXG4gICAgcGFyYW1zID0gcGFyYW1zLmZpbHRlcih2ID0+IHR5cGVvZiB2ICE9PSAnZnVuY3Rpb24nKTtcblxuICAgIHF1ZXJ5LnNxbCA9IHRoaXMuZGIuYWRhcHRlci5nZW5lcmF0ZVVwZGF0ZUFsbFF1ZXJ5KFxuICAgICAgdGhpcy5Nb2RlbC50YWJsZSgpLFxuICAgICAgJ2lkJyxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgY29sdW1uRnVuY3Rpb25zLFxuICAgICAgcXVlcnkucGFyYW1zLmxlbmd0aCxcbiAgICAgIHF1ZXJ5LnNxbFxuICAgICk7XG5cbiAgICBxdWVyeS5wYXJhbXMgPSBxdWVyeS5wYXJhbXMuY29uY2F0KHBhcmFtcyk7XG5cbiAgICByZXR1cm4gdGhpcy5kYi5xdWVyeShxdWVyeS5zcWwsIHF1ZXJ5LnBhcmFtcywgKGVycjogRXJyb3IsIHJlc3VsdDogYW55KSA9PiB7XG5cbiAgICAgIGNvbnN0IHJvd3MgPSByZXN1bHQgPyAocmVzdWx0LnJvd3MgfHwgW10pLnNsaWNlKCkgOiBbXTtcblxuICAgICAgaWYgKGVycikge1xuICAgICAgICBjb25zdCBtb2RlbHMgPSB0aGlzLl9fcGFyc2VNb2RlbHNGcm9tUm93c19fKHJvd3MpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suY2FsbCh0aGlzLCBlcnIsIG1vZGVscyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlkcyA9IHJlc3VsdC5yb3dzLm1hcCgocm93OiBhbnkpID0+IHJvdy5pZCk7XG5cbiAgICAgIC8qIEdyYWIgYWxsIGl0ZW1zIHdpdGggaWRzLCBzb3J0ZWQgYnkgb3JkZXIgKi9cbiAgICAgIC8qIE9ubHkgbmVlZCB0byBncmFiIGpvaW5zIGFuZCBvcmRlciAqL1xuXG4gICAgICBjb25zdCBjb21wb3NlckFycmF5ID0gdGhpcy5fX2NvbGxhcHNlX18oKVxuICAgICAgICAuZmlsdGVyKGNvbXBvc2VyID0+IGNvbXBvc2VyLl9jb21tYW5kKVxuICAgICAgICAuZmlsdGVyKGNvbXBvc2VyID0+IGNvbXBvc2VyLl9jb21tYW5kICYmIChjb21wb3Nlci5fY29tbWFuZC50eXBlID09PSAnb3JkZXJCeScgfHwgY29tcG9zZXIuX2NvbW1hbmQudHlwZSA9PT0gJ2pvaW4nKSk7XG5cbiAgICAgIC8vIEFkZCBpbiBpZCBmaWx0ZXJcbiAgICAgIGNvbnN0IG5ld0NvbXBvc2VyID0gbmV3IENvbXBvc2VyKHRoaXMuTW9kZWwpLndoZXJlKHsgaWRfX2luOiBpZHMgfSk7XG4gICAgICBjb21wb3NlckFycmF5LnVuc2hpZnQoPENvbXBvc2VyPm5ld0NvbXBvc2VyLl9wYXJlbnQpO1xuXG4gICAgICBjb25zdCBxdWVyeUluZm8gPSB0aGlzLl9fcmVkdWNlVG9RdWVyeUluZm9ybWF0aW9uX18oY29tcG9zZXJBcnJheSk7XG4gICAgICBsZXQgcXVlcnkgPSB0aGlzLl9fcmVkdWNlQ29tbWFuZHNUb1F1ZXJ5X18ocXVlcnlJbmZvLmNvbW1hbmRzKTtcbiAgICAgIHF1ZXJ5ID0gdGhpcy5fX2FkZEpvaW5zVG9RdWVyeV9fKHF1ZXJ5LCBxdWVyeUluZm8pO1xuXG4gICAgICByZXR1cm4gdGhpcy5kYi5xdWVyeShxdWVyeS5zcWwsIHF1ZXJ5LnBhcmFtcywgKGVycjogRXJyb3IsIHJlc3VsdDogYW55KSA9PiB7XG5cbiAgICAgICAgY29uc3Qgcm93cyA9IHJlc3VsdCA/IChyZXN1bHQucm93cyB8fCBbXSkuc2xpY2UoKSA6IFtdO1xuICAgICAgICBjb25zdCBtb2RlbHMgPSB0aGlzLl9fcGFyc2VNb2RlbHNGcm9tUm93c19fKHJvd3MpO1xuXG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgZXJyLCBtb2RlbHMpO1xuXG4gICAgICB9KTtcblxuICAgIH0pO1xuXG4gIH1cblxufVxuXG5leHBvcnQgZGVmYXVsdCBDb21wb3NlcjtcbiJdfQ==
