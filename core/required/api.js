"use strict";
const item_array_1 = require('./item_array');
const model_1 = require('./model');
const model_array_1 = require('./model_array');
class APIConstructor {
    format(obj, arrInterface) {
        if (obj instanceof Error) {
            const err = obj;
            return this.error(err.message, err.details);
        }
        if (obj instanceof model_1.default) {
            const modelArray = new model_array_1.default(obj.constructor);
            modelArray.setMeta({ total: 1, offset: 0 });
            modelArray.push(obj);
            obj = modelArray;
        }
        if (!(obj instanceof item_array_1.default)) {
            return this.spoof(obj);
        }
        return this.response(obj, arrInterface);
    }
    meta(total, count, offset, error, summary, resource) {
        if (error) {
            total = 0;
            count = 0;
            offset = 0;
            resource = null;
        }
        return {
            total,
            count,
            offset,
            error,
            summary,
            resource
        };
    }
    error(message, details) {
        return {
            meta: this.meta(0, 0, 0, { message: message, details: details }),
            data: []
        };
    }
    spoof(obj, useResource) {
        if (!(obj instanceof Array)) {
            obj = [obj];
        }
        return {
            meta: this.meta(obj.length, obj.length, 0, null, null, useResource && this.resourceFromArray(obj)),
            data: obj
        };
    }
    response(itemArray, arrInterface, useResource) {
        return {
            meta: this.meta(itemArray._meta.total, itemArray.length, itemArray._meta.offset, null, null, useResource && this.resourceFromModelArray(itemArray, arrInterface)),
            data: itemArray.toObject(arrInterface)
        };
    }
    resourceFromArray(arr) {
        function getType(v) {
            v = (v instanceof Array) ? v[0] : v;
            const typeObj = {
                boolean: 'boolean',
                string: 'string',
                number: 'float'
            };
            return typeObj[(typeof v)] || ((v instanceof Date) ? 'datetime' : 'string');
        }
        let fields = [];
        if (arr.length && arr[0] && typeof arr[0] === 'object') {
            const datum = arr[0];
            fields = Object.keys(datum).map((v, i) => {
                return {
                    name: v,
                    type: getType(datum[v]),
                    array: (v instanceof Array)
                };
            });
        }
        return {
            name: 'object',
            fields: fields
        };
    }
    resourceFromModelArray(modelArray, arrInterface) {
        return modelArray._modelConstructor.toResource(arrInterface);
    }
}
exports.APIConstructor = APIConstructor;
const API = new APIConstructor();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = API;
