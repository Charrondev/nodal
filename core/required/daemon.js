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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImRhZW1vbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsc0JBQWdCLE9BQU8sQ0FBQyxDQUFBO0FBQ3hCLHNCQUFnQixLQUFLLENBQUMsQ0FBQTtBQUV0Qjs7O0dBR0c7QUFDSCxxQkFBcUIsYUFBRyxDQUFDLE1BQU07SUFFN0I7UUFFRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0lBRWpCLENBQUM7SUFFTSxLQUFLLENBQUMsR0FBUSxFQUFFLEdBQVEsRUFBRSxHQUFRO1FBRXZDLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUMsY0FBYyxFQUFFLFlBQVksRUFBQyxDQUFDLENBQUM7UUFFbkQsR0FBRyxDQUFDLEdBQUcsQ0FDTCxJQUFJLENBQUMsU0FBUyxDQUNaLGFBQUcsQ0FBQyxLQUFLLENBQ1AsbUJBQW1CLEVBQ25CLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEtBQUssWUFBWSxJQUFJLEdBQUcsQ0FBQztZQUM1QyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQzdCLEVBQ0gsSUFBSSxFQUNKLENBQUMsQ0FDRixDQUNGLENBQUM7SUFFSixDQUFDO0FBRUgsQ0FBQztBQUVEO2tCQUFlLE1BQU0sQ0FBQyIsImZpbGUiOiJkYWVtb24uanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQVBJIGZyb20gJy4vYXBpJztcbmltcG9ydCBmeG4gZnJvbSAnZnhuJztcblxuLyoqXG4gKiBNdWx0aS1wcm9jZXNzIEhUVFAgRGFlbW9uIHRoYXQgcmVzZXRzIHdoZW4gZmlsZXMgY2hhbmdlZCAoaW4gZGV2ZWxvcG1lbnQpXG4gKiBAY2xhc3NcbiAqL1xuY2xhc3MgRGFlbW9uIGV4dGVuZHMgZnhuLkRhZW1vbiB7XG5cbiAgY29uc3RydWN0b3IoKSB7XG5cbiAgICBzdXBlcignTm9kYWwnKTtcblxuICB9XG5cbiAgcHVibGljIGVycm9yKHJlcTogYW55LCByZXM6IGFueSwgZXJyOiBhbnkpIHtcblxuICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7J0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJ30pO1xuXG4gICAgcmVzLmVuZChcbiAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICBBUEkuZXJyb3IoXG4gICAgICAgICAgJ0FwcGxpY2F0aW9uIEVycm9yJyxcbiAgICAgICAgICAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJyAmJiBlcnIpID9cbiAgICAgICAgICAgIGVyci5zdGFjay5zcGxpdCgnXFxuJykgOiBudWxsXG4gICAgICAgICAgKSxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgMlxuICAgICAgKVxuICAgICk7XG5cbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IERhZW1vbjtcbiJdfQ==
