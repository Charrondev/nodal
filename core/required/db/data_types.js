"use strict";
const dataTypes = {
    serial: {
        convert: (v) => {
            return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
        }
    },
    int: {
        convert: (v) => {
            return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
        }
    },
    currency: {
        convert: (v) => {
            return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
        }
    },
    float: {
        convert: (v) => {
            return parseFloat(v) || 0;
        }
    },
    string: {
        convert: (v) => {
            return v === null ? '' : (v + '');
        }
    },
    text: {
        convert: (v) => {
            return v === null ? '' : (v + '');
        }
    },
    datetime: {
        convert: (v) => {
            if (!(v instanceof Date)) {
                v = new Date(v);
                if (v.toString() === 'Invalid Date') {
                    v = new Date(0);
                }
            }
            return v;
        }
    },
    boolean: {
        convert: (v) => {
            const negatives = ['f', 'false', 'n', 'no', 'off', '0', ''];
            const convertedToNumber = negatives.indexOf(v) > -1 ? 1 : 0;
            return typeof v === 'string' ? [true, false][convertedToNumber] : !!v;
        }
    },
    json: {
        convert: (v) => {
            return typeof v === 'string' ? JSON.parse(v) : v;
        }
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = dataTypes;
