"use strict";
const api_1 = require('./api');
const fxn_1 = require('fxn');
/**
 * Multi-process HTTP Daemon that resets when files changed (in development)
 * @class
 */
class Daemon extends fxn_1.default.Daemon {
    constructor() {
        super('Nodal');
    }
    error(req, res, err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(JSON.stringify(api_1.default.error('Application Error', (process.env.NODE_ENV !== 'production' && err) ?
            err.stack.split('\n') : null), null, 2));
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Daemon;
