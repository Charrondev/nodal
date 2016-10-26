import API from './api';
import * as fxn from 'fxn';

class Application extends fxn.Application {

  constructor() {

    super('Nodal');

  }

  /**
   * HTTP Error
   */
  public error(req: any, res: any, start: any, status: number, message: string, err: any) {

    status = status || 500;
    message = message || 'Internal Server Error';

    const headers = {'Content-Type': 'application/json'};

    err && console.log(err.stack);

    this.send(
      req,
      res,
      start,
      status,
      headers,
      JSON.stringify(
        API.error(
          message,
          (process.env.NODE_ENV !== 'production' && err) ?
            err.stack.split('\n') : null
        ),
        null,
        2
      ),
      message
    );

  }

}

export default Application;
