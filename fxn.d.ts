declare module "fxn" {
    namespace fxn {
      type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';

      interface HttpHeaders {
        [item: string]: string;
      }

      class Controller {
        constructor(path: string, method: string, requestHeaders: Object, params: Object, responder: Function);
        convertMethod(method: HttpMethod, id: number): string;
        run(): void;
        notImplemented(): void;
        before(): void;
        after(): void;
        get(): void;
        put(): void;
        post(): void;
        del(): void;
        options(): void;
        index(): void;
        show(): void;
        update(): void;
        create(): void;
        destroy(): void;
        setHeaders(): HttpHeaders;
        setHeader(key: string, value: string): string;
        appendHeader(key: string, value: string): string;
        getHeader(key: string, value: string): string;
        code(code: number): number;
        getStatus(): number;
        render(data: Buffer | String | Object): void;
        allowOrigin(value: string): this;
        securityPolicy(directive: string, src: string): string;
        redirect(location: string): void;
      }
    }

    export = fxn;
}