"use strict";
const model_array_1 = require('./model_array');
const async_1 = require('async');
const fs_1 = require('fs');
// TODO: Cleanup some of the uglier nesting going on here.
/**
 * Factory for creating models
 * @class
 */
class ModelFactory {
    /**
     * Create the ModelFactory with a provided Model to use as a reference.
     * @param {Nodal.Model} modelConstructor Must pass the constructor for the type of ModelFactory you wish to create.
     */
    constructor(modelConstructor) {
        this.Model = modelConstructor;
    }
    /**
     * Loads all model constructors in your ./app/models directory into an array
     * @return {Array} Array of model Constructors
     */
    static loadModels() {
        const dir = './app/models';
        if (!fs_1.default.existsSync(dir)) {
            return [];
        }
        return fs_1.default
            .readdirSync(dir)
            .map(filename => require(`${process.cwd()}/app/models/${filename}`));
    }
    /**
     * Creates new factories from a supplied array of Models, loading in data keyed by Model name
     * @param {Array} Models Array of model constructors you wish to reference
     * @param {Object} objModelData Keys are model names, values are arrays of model data you wish to create
     * @param {Function} callback What to execute upon completion
     */
    static createFromModels(Models, objModelData, callback) {
        if (objModelData instanceof Array) {
            async_1.default.series(objModelData.map(objModelData => (callback) => this.createFromModels(Models, objModelData, callback)), (err, results) => {
                results = (results || []).reduce((results, res) => {
                    return results.concat(res);
                }, []);
                callback(err || null, results);
            });
            return;
        }
        async_1.default.parallel(Models
            .filter((Model) => objModelData[Model.name] && objModelData[Model.name].length)
            .map((Model) => (callback) => new this(Model).create(objModelData[Model.name], callback)), (err, results) => callback(err || null, results));
    }
    /**
     * Populates a large amount of model data from an Object.
     * @param {Array} Models Array of Model constructors
     */
    static populate(objModelData, callback) {
        return this.createFromModels(this.loadModels(), objModelData, callback);
    }
    /**
     * Creates models from an array of Objects containing the model data
     * @param {Array} arrModelData Array of objects to create model data from
     */
    create(arrModelData, callback) {
        // new this.Model(data, false, true) is telling the Model that this is from a seed
        model_array_1.default
            .from(arrModelData.map(data => new this.Model(data, false, true)))
            .saveAll(callback);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = model_array_1.default;
