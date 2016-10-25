"use strict";
const api_1 = require('./api');
const fxn = require('fxn');
class Application extends fxn.Application {
    constructor() {
        super('Nodal');
    }
    /**
     * HTTP Error
     */
    error(req, res, start, status, message, err) {
        status = status || 500;
        message = message || 'Internal Server Error';
        const headers = { 'Content-Type': 'application/json' };
        err && console.log(err.stack);
        this.send(req, res, start, status, headers, JSON.stringify(api_1.default.error(message, (process.env.NODE_ENV !== 'production' && err) ?
            err.stack.split('\n') : null), null, 2), message);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Application;
