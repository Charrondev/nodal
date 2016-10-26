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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRXpELENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUVkLENBQUM7QUFFSCxDQUFDO0FBRUQ7a0JBQWUsVUFBVSxDQUFDIiwiZmlsZSI6ImNvbnRyb2xsZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQVBJIGZyb20gJy4vYXBpJztcbmltcG9ydCBNb2RlbCBmcm9tICcuL21vZGVsJztcbmltcG9ydCBNb2RlbEFycmF5IGZyb20gJy4vbW9kZWxfYXJyYXknO1xuaW1wb3J0IHtJRXh0ZW5kZWRFcnJvcn0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgKiBhcyBmeG4gZnJvbSAnZnhuJztcblxuY2xhc3MgQ29udHJvbGxlciBleHRlbmRzIGZ4bi5Db250cm9sbGVyIHtcblxuICAvKipcbiAgICogU2V0IEhUVFAgc3RhdHVzIGNvZGUgZm9yIHRoaXMgcmVzcG9uc2UuIElmIE9QVElPTlMgbW9kZSwgZGVmYXVsdCB0byAyMDAuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlXG4gICAqL1xuICBwdWJsaWMgc3RhdHVzKHZhbHVlOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBzdXBlci5zdGF0dXModGhpcy5fbWV0aG9kID09PSAnT1BUSU9OUycgPyAyMDAgOiB2YWx1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogVXNpbmcgQVBJIGZvcm1hdHRpbmcsIHNlbmQgYW4gaHR0cC5TZXJ2ZXJSZXNwb25zZSBpbmRpY2F0aW5nIHRoZXJlIHdhcyBhIEJhZCBSZXF1ZXN0ICg0MDApXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtc2cgRXJyb3IgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkZXRhaWxzIEFueSBhZGRpdGlvbmFsIGRldGFpbHMgZm9yIHRoZSBlcnJvciAobXVzdCBiZSBzZXJpYWxpemFibGUpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgYmFkUmVxdWVzdChtc2c6IHN0cmluZywgZGV0YWlsczogYW55KTogYm9vbGVhbiB7XG4gICAgdGhpcy5zdGF0dXMoNDAwKTtcbiAgICB0aGlzLnJlbmRlcihBUEkuZXJyb3IobXNnIHx8ICdCYWQgUmVxdWVzdCcsIGRldGFpbHMpKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2luZyBBUEkgZm9ybWF0dGluZywgc2VuZCBhbiBodHRwLlNlcnZlclJlc3BvbnNlIGluZGljYXRpbmcgdGhlcmUgd2FzIGFuIFVuYXV0aG9yaXplZCByZXF1ZXN0ICg0MDEpXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtc2cgRXJyb3IgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkZXRhaWxzIEFueSBhZGRpdGlvbmFsIGRldGFpbHMgZm9yIHRoZSBlcnJvciAobXVzdCBiZSBzZXJpYWxpemFibGUpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgdW5hdXRob3JpemVkKG1zZzogc3RyaW5nLCBkZXRhaWxzOiBhbnkpOiBib29sZWFuIHtcbiAgICB0aGlzLnN0YXR1cyg0MDEpO1xuICAgIHRoaXMucmVuZGVyKEFQSS5lcnJvcihtc2cgfHwgJ1VuYXV0aG9yaXplZCcsIGRldGFpbHMpKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2luZyBBUEkgZm9ybWF0dGluZywgc2VuZCBhbiBodHRwLlNlcnZlclJlc3BvbnNlIGluZGljYXRpbmcgdGhlIHJlcXVlc3RlZCByZXNvdXJjZSB3YXMgTm90IEZvdW5kICg0MDQpXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtc2cgRXJyb3IgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkZXRhaWxzIEFueSBhZGRpdGlvbmFsIGRldGFpbHMgZm9yIHRoZSBlcnJvciAobXVzdCBiZSBzZXJpYWxpemFibGUpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgbm90Rm91bmQobXNnOiBzdHJpbmcsIGRldGFpbHM6IGFueSk6IGJvb2xlYW4ge1xuICAgIHRoaXMuc3RhdHVzKDQwNCk7XG4gICAgdGhpcy5yZW5kZXIoQVBJLmVycm9yKG1zZyB8fCAnTm90IEZvdW5kJywgZGV0YWlscykpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIEVuZHBvaW50IG5vdCBpbXBsZW1lbnRlZFxuICAgKiBAcGFyYW0ge3N0cmluZ30gbXNnIEVycm9yIG1lc3NhZ2UgdG8gc2VuZFxuICAgKiBAcGFyYW0ge09iamVjdH0gZGV0YWlscyBBbnkgYWRkaXRpb25hbCBkZXRhaWxzIGZvciB0aGUgZXJyb3IgKG11c3QgYmUgc2VyaWFsaXphYmxlKVxuICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgKi9cbiAgcHVibGljIG5vdEltcGxlbWVudGVkKG1zZzogc3RyaW5nLCBkZXRhaWxzOiBhbnkpOiBib29sZWFuIHtcbiAgICB0aGlzLnN0YXR1cyg1MDEpO1xuICAgIHRoaXMucmVuZGVyKEFQSS5lcnJvcihtc2cgIHx8ICdOb3QgSW1wbGVtZW50ZWQnLCBkZXRhaWxzKSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogVXNpbmcgQVBJIGZvcm1hdHRpbmcsIHNlbmQgYW4gaHR0cC5TZXJ2ZXJSZXNwb25zZSBpbmRpY2F0aW5nIHRoZXJlIHdlcmUgVG9vIE1hbnkgUmVxdWVzdHMgKDQyOSkgKGkuZS4gdGhlIGNsaWVudCBpcyBiZWluZyByYXRlIGxpbWl0ZWQpXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtc2cgRXJyb3IgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkZXRhaWxzIEFueSBhZGRpdGlvbmFsIGRldGFpbHMgZm9yIHRoZSBlcnJvciAobXVzdCBiZSBzZXJpYWxpemFibGUpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgdG9vTWFueVJlcXVlc3RzKG1zZzogc3RyaW5nLCBkZXRhaWxzOiBhbnkpOiBib29sZWFuIHtcbiAgICB0aGlzLnN0YXR1cyg0MjkpO1xuICAgIHRoaXMucmVuZGVyKEFQSS5lcnJvcihtc2cgfHwgJ1RvbyBNYW55IFJlcXVlc3RzJywgZGV0YWlscykpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFVzaW5nIEFQSSBmb3JtYXR0aW5nLCBzZW5kIGFuIGh0dHAuU2VydmVyUmVzcG9uc2UgaW5kaWNhdGluZyB0aGVyZSB3YXMgYW4gSW50ZXJuYWwgU2VydmVyIEVycm9yICg1MDApXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBtc2cgRXJyb3IgbWVzc2FnZSB0byBzZW5kXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkZXRhaWxzIEFueSBhZGRpdGlvbmFsIGRldGFpbHMgZm9yIHRoZSBlcnJvciAobXVzdCBiZSBzZXJpYWxpemFibGUpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgZXJyb3IobXNnOiBzdHJpbmcsIGRldGFpbHM6IGFueSk6IGJvb2xlYW4ge1xuICAgIHRoaXMuc3RhdHVzKDUwMCk7XG4gICAgdGhpcy5yZW5kZXIoQVBJLmVycm9yKG1zZyB8fCAnSW50ZXJuYWwgU2VydmVyIEVycm9yJywgZGV0YWlscykpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFVzaW5nIEFQSSBmb3JtYXR0aW5nLCBnZW5lcmF0ZSBhbiBlcnJvciBvciByZXNwb25kIHdpdGggbW9kZWwgLyBvYmplY3QgZGF0YS5cbiAgICogQHBhcmFtIHtFcnJvcnxPYmplY3R8QXJyYXl8Tm9kYWwuTW9kZWx8Tm9kYWwuTW9kZWxBcnJheX0gZGF0YSBPYmplY3QgdG8gYmUgZm9ybWF0dGVkIGZvciBBUEkgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtvcHRpb25hbCBBcnJheX0gVGhlIGludGVyZmFjZSB0byB1c2UgZm9yIHRoZSBkYXRhIGJlaW5nIHJldHVybmVkLCBpZiBub3QgYW4gZXJyb3IuXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBwdWJsaWMgcmVzcG9uZChkYXRhOiBFcnJvciB8IE9iamVjdCB8IGFueVtdIHwgTW9kZWwgfCBNb2RlbEFycmF5LCBhcnJJbnRlcmZhY2U/OiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXG4gICAgaWYgKGRhdGEgaW5zdGFuY2VvZiBFcnJvcikge1xuXG4gICAgICBjb25zdCBlcnI6IElFeHRlbmRlZEVycm9yID0gZGF0YTtcblxuICAgICAgaWYgKGVyci5ub3RGb3VuZCkge1xuICAgICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZChlcnIubWVzc2FnZSwgZXJyLmRldGFpbHMgfHwge30pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5iYWRSZXF1ZXN0KGVyci5tZXNzYWdlLCBlcnIuZGV0YWlscyB8fCB7fSk7XG5cbiAgICB9XG5cbiAgICB0aGlzLnJlbmRlcihBUEkuZm9ybWF0KGRhdGEsIGFyckludGVyZmFjZSkpO1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH1cblxufVxuXG5leHBvcnQgZGVmYXVsdCBDb250cm9sbGVyO1xuIl19
