import API from './api';
import Model from './model';
import ModelArray from './model_array';
import {IExtendedError} from './types';
import * as fxn from 'fxn';

class Controller extends fxn.Controller {

  /**
   * Set HTTP status code for this response. If OPTIONS mode, default to 200.
   * @param {Number} code
   */
  public status(value: number): boolean {
    super.status(this._method === 'OPTIONS' ? 200 : value);
    return true;
  }

  /**
   * Using API formatting, send an http.ServerResponse indicating there was a Bad Request (400)
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public badRequest(msg: string, details: any): boolean {
    this.status(400);
    this.render(API.error(msg || 'Bad Request', details));
    return true;
  }

  /**
   * Using API formatting, send an http.ServerResponse indicating there was an Unauthorized request (401)
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public unauthorized(msg: string, details: any): boolean {
    this.status(401);
    this.render(API.error(msg || 'Unauthorized', details));
    return true;
  }

  /**
   * Using API formatting, send an http.ServerResponse indicating the requested resource was Not Found (404)
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public notFound(msg: string, details: any): boolean {
    this.status(404);
    this.render(API.error(msg || 'Not Found', details));
    return true;
  }

  /**
   * Endpoint not implemented
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public notImplemented(msg: string, details: any): boolean {
    this.status(501);
    this.render(API.error(msg  || 'Not Implemented', details));
    return true;
  }

  /**
   * Using API formatting, send an http.ServerResponse indicating there were Too Many Requests (429) (i.e. the client is being rate limited)
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public tooManyRequests(msg: string, details: any): boolean {
    this.status(429);
    this.render(API.error(msg || 'Too Many Requests', details));
    return true;
  }

  /**
   * Using API formatting, send an http.ServerResponse indicating there was an Internal Server Error (500)
   * @param {string} msg Error message to send
   * @param {Object} details Any additional details for the error (must be serializable)
   * @return {boolean}
   */
  public error(msg: string, details: any): boolean {
    this.status(500);
    this.render(API.error(msg || 'Internal Server Error', details));
    return true;
  }

  /**
   * Using API formatting, generate an error or respond with model / object data.
   * @param {Error|Object|Array|Nodal.Model|Nodal.ModelArray} data Object to be formatted for API response
   * @param {optional Array} The interface to use for the data being returned, if not an error.
   * @return {boolean}
   */
  public respond(data: Error | Object | any[] | Model | ModelArray, arrInterface?: string[]): boolean {

    if (data instanceof Error) {

      const err: IExtendedError = data;

      if (err.notFound) {
        return this.notFound(err.message, err.details || {});
      }

      return this.badRequest(err.message, err.details || {});

    }

    this.render(API.format(data, arrInterface));
    return true;

  }

}

export default Controller;
