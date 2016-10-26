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
            .filter(m => objModelData[m.name] && objModelData[m.name].length)
            .map(m => (callback) => new this(m).create(objModelData[m.name], callback)), (err, results) => callback(err || null, results));
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
exports.default = ModelFactory;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QyxRQUFRLENBQUMsQ0FBQztJQUV2QixDQUFDO0FBRUgsQ0FBQztBQUVEO2tCQUFlLFlBQVksQ0FBQyIsImZpbGUiOiJtb2RlbF9mYWN0b3J5LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE1vZGVsIGZyb20gJy4vbW9kZWwnO1xuaW1wb3J0IE1vZGVsQXJyYXkgZnJvbSAnLi9tb2RlbF9hcnJheSc7XG5pbXBvcnQgYXN5bmMgZnJvbSAnYXN5bmMnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTW9kZWxEYXRhIHtcbiAgW21vZGVsTmFtZTogc3RyaW5nXTogYW55W107XG59XG5cbi8vIFRPRE86IENsZWFudXAgc29tZSBvZiB0aGUgdWdsaWVyIG5lc3RpbmcgZ29pbmcgb24gaGVyZS5cblxuLyoqXG4gKiBGYWN0b3J5IGZvciBjcmVhdGluZyBtb2RlbHNcbiAqIEBjbGFzc1xuICovXG5jbGFzcyBNb2RlbEZhY3Rvcnkge1xuXG4gIHByaXZhdGUgTW9kZWw6IHR5cGVvZiBNb2RlbDtcblxuICAvKipcbiAgICogQ3JlYXRlIHRoZSBNb2RlbEZhY3Rvcnkgd2l0aCBhIHByb3ZpZGVkIE1vZGVsIHRvIHVzZSBhcyBhIHJlZmVyZW5jZS5cbiAgICogQHBhcmFtIHtOb2RhbC5Nb2RlbH0gbW9kZWxDb25zdHJ1Y3RvciBNdXN0IHBhc3MgdGhlIGNvbnN0cnVjdG9yIGZvciB0aGUgdHlwZSBvZiBNb2RlbEZhY3RvcnkgeW91IHdpc2ggdG8gY3JlYXRlLlxuICAgKi9cbiAgY29uc3RydWN0b3IobW9kZWxDb25zdHJ1Y3RvcjogdHlwZW9mIE1vZGVsKSB7XG5cbiAgICB0aGlzLk1vZGVsID0gbW9kZWxDb25zdHJ1Y3RvcjtcblxuICB9XG5cbiAgLyoqXG4gICAqIExvYWRzIGFsbCBtb2RlbCBjb25zdHJ1Y3RvcnMgaW4geW91ciAuL2FwcC9tb2RlbHMgZGlyZWN0b3J5IGludG8gYW4gYXJyYXlcbiAgICogQHJldHVybiB7QXJyYXl9IEFycmF5IG9mIG1vZGVsIENvbnN0cnVjdG9yc1xuICAgKi9cbiAgcHVibGljIHN0YXRpYyBsb2FkTW9kZWxzKCk6IGFueVtdIHtcblxuICAgIGNvbnN0IGRpciA9ICcuL2FwcC9tb2RlbHMnO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgcmV0dXJuIDxNb2RlbEFycmF5PmZzXG4gICAgICAucmVhZGRpclN5bmMoZGlyKVxuICAgICAgLm1hcChmaWxlbmFtZSA9PiByZXF1aXJlKGAke3Byb2Nlc3MuY3dkKCl9L2FwcC9tb2RlbHMvJHtmaWxlbmFtZX1gKSk7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIG5ldyBmYWN0b3JpZXMgZnJvbSBhIHN1cHBsaWVkIGFycmF5IG9mIE1vZGVscywgbG9hZGluZyBpbiBkYXRhIGtleWVkIGJ5IE1vZGVsIG5hbWVcbiAgICogQHBhcmFtIHtBcnJheX0gTW9kZWxzIEFycmF5IG9mIG1vZGVsIGNvbnN0cnVjdG9ycyB5b3Ugd2lzaCB0byByZWZlcmVuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iak1vZGVsRGF0YSBLZXlzIGFyZSBtb2RlbCBuYW1lcywgdmFsdWVzIGFyZSBhcnJheXMgb2YgbW9kZWwgZGF0YSB5b3Ugd2lzaCB0byBjcmVhdGVcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgV2hhdCB0byBleGVjdXRlIHVwb24gY29tcGxldGlvblxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBjcmVhdGVGcm9tTW9kZWxzKE1vZGVsczogKHR5cGVvZiBNb2RlbClbXSwgb2JqTW9kZWxEYXRhOiBJTW9kZWxEYXRhLCBjYWxsYmFjazogRnVuY3Rpb24pIHtcblxuICAgIGlmIChvYmpNb2RlbERhdGEgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgYXN5bmMuc2VyaWVzKFxuICAgICAgICBvYmpNb2RlbERhdGEubWFwKG9iak1vZGVsRGF0YSA9PiAoY2FsbGJhY2s6IEZ1bmN0aW9uKSA9PiB0aGlzLmNyZWF0ZUZyb21Nb2RlbHMoTW9kZWxzLCBvYmpNb2RlbERhdGEsIGNhbGxiYWNrKSksXG4gICAgICAgIChlcnI6IEVycm9yLCByZXN1bHRzOiBhbnkpID0+IHtcbiAgICAgICAgICByZXN1bHRzID0gKHJlc3VsdHMgfHwgW10pLnJlZHVjZSgocmVzdWx0czogYW55LCByZXM6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHMuY29uY2F0KHJlcyk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNhbGxiYWNrKGVyciB8fCBudWxsLCByZXN1bHRzKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhc3luYy5wYXJhbGxlbChcbiAgICAgIE1vZGVsc1xuICAgICAgICAuZmlsdGVyKG0gPT4gb2JqTW9kZWxEYXRhW20ubmFtZV0gJiYgb2JqTW9kZWxEYXRhW20ubmFtZV0ubGVuZ3RoKVxuICAgICAgICAubWFwKG0gPT4gKGNhbGxiYWNrOiBGdW5jdGlvbikgPT4gbmV3IHRoaXMobSkuY3JlYXRlKG9iak1vZGVsRGF0YVttLm5hbWVdLCBjYWxsYmFjaykpLFxuICAgICAgKGVyciwgcmVzdWx0cykgPT4gY2FsbGJhY2soZXJyIHx8IG51bGwsIHJlc3VsdHMpXG4gICAgKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIFBvcHVsYXRlcyBhIGxhcmdlIGFtb3VudCBvZiBtb2RlbCBkYXRhIGZyb20gYW4gT2JqZWN0LlxuICAgKiBAcGFyYW0ge0FycmF5fSBNb2RlbHMgQXJyYXkgb2YgTW9kZWwgY29uc3RydWN0b3JzXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHBvcHVsYXRlKG9iak1vZGVsRGF0YTogSU1vZGVsRGF0YSwgY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cbiAgICByZXR1cm4gdGhpcy5jcmVhdGVGcm9tTW9kZWxzKHRoaXMubG9hZE1vZGVscygpLCBvYmpNb2RlbERhdGEsIGNhbGxiYWNrKTtcblxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgbW9kZWxzIGZyb20gYW4gYXJyYXkgb2YgT2JqZWN0cyBjb250YWluaW5nIHRoZSBtb2RlbCBkYXRhXG4gICAqIEBwYXJhbSB7QXJyYXl9IGFyck1vZGVsRGF0YSBBcnJheSBvZiBvYmplY3RzIHRvIGNyZWF0ZSBtb2RlbCBkYXRhIGZyb21cbiAgICovXG4gIHB1YmxpYyBjcmVhdGUoYXJyTW9kZWxEYXRhOiBJTW9kZWxEYXRhW10sIGNhbGxiYWNrOiBGdW5jdGlvbikge1xuXG4gICAgLy8gbmV3IHRoaXMuTW9kZWwoZGF0YSwgZmFsc2UsIHRydWUpIGlzIHRlbGxpbmcgdGhlIE1vZGVsIHRoYXQgdGhpcyBpcyBmcm9tIGEgc2VlZFxuXG4gICAgTW9kZWxBcnJheVxuICAgICAgLmZyb20oYXJyTW9kZWxEYXRhLm1hcChkYXRhID0+IG5ldyB0aGlzLk1vZGVsKGRhdGEsIGZhbHNlLCB0cnVlKSkpXG4gICAgICAuc2F2ZUFsbChjYWxsYmFjayk7XG5cbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IE1vZGVsRmFjdG9yeTtcbiJdfQ==
