import API from './api';
import fxn from 'fxn';

/**
 * Multi-process HTTP Daemon that resets when files changed (in development)
 * @class
 */
class Daemon extends fxn.Daemon {

  constructor() {

    super('Nodal');

  }

  public error(req: any, res: any, err: any) {

    res.writeHead(500, {'Content-Type': 'text/plain'});

    res.end(
      JSON.stringify(
        API.error(
          'Application Error',
          (process.env.NODE_ENV !== 'production' && err) ?
            err.stack.split('\n') : null
          ),
        null,
        2
      )
    );

  }

}

export default Daemon;
