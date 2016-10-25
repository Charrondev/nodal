"use strict";
const api_1 = require('./api');
const fxn = require('fxn');
class Controller extends fxn.Controller {
    /**
     * Set HTTP status code for this response. If OPTIONS mode, default to 200.
     * @param {Number} code
     */
    status(value) {
        super.status(this._method === 'OPTIONS' ? 200 : value);
        return true;
    }
    /**
     * Using API formatting, send an http.ServerResponse indicating there was a Bad Request (400)
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    badRequest(msg, details) {
        this.status(400);
        this.render(api_1.default.error(msg || 'Bad Request', details));
        return true;
    }
    /**
     * Using API formatting, send an http.ServerResponse indicating there was an Unauthorized request (401)
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    unauthorized(msg, details) {
        this.status(401);
        this.render(api_1.default.error(msg || 'Unauthorized', details));
        return true;
    }
    /**
     * Using API formatting, send an http.ServerResponse indicating the requested resource was Not Found (404)
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    notFound(msg, details) {
        this.status(404);
        this.render(api_1.default.error(msg || 'Not Found', details));
        return true;
    }
    /**
     * Endpoint not implemented
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    notImplemented(msg, details) {
        this.status(501);
        this.render(api_1.default.error(msg || 'Not Implemented', details));
        return true;
    }
    /**
     * Using API formatting, send an http.ServerResponse indicating there were Too Many Requests (429) (i.e. the client is being rate limited)
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    tooManyRequests(msg, details) {
        this.status(429);
        this.render(api_1.default.error(msg || 'Too Many Requests', details));
        return true;
    }
    /**
     * Using API formatting, send an http.ServerResponse indicating there was an Internal Server Error (500)
     * @param {string} msg Error message to send
     * @param {Object} details Any additional details for the error (must be serializable)
     * @return {boolean}
     */
    error(msg, details) {
        this.status(500);
        this.render(api_1.default.error(msg || 'Internal Server Error', details));
        return true;
    }
    /**
     * Using API formatting, generate an error or respond with model / object data.
     * @param {Error|Object|Array|Nodal.Model|Nodal.ModelArray} data Object to be formatted for API response
     * @param {optional Array} The interface to use for the data being returned, if not an error.
     * @return {boolean}
     */
    respond(data, arrInterface) {
        if (data instanceof Error) {
            const err = data;
            if (err.notFound) {
                return this.notFound(err.message, err.details || {});
            }
            return this.badRequest(err.message, err.details || {});
        }
        this.render(api_1.default.format(data, arrInterface));
        return true;
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Controller;
