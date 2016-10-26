import ItemArray from './item_array';
import Model from './model';
import ModelArray from './model_array';
import {IAnyObject} from './types';

export class APIConstructor {

  public format(obj: any, arrInterface?: string[]) {

    if (obj instanceof Error) {
      const err: any = obj;
      return this.error(err.message, err.details);
    }

    if (obj instanceof Model) {
      const modelArray: ModelArray = new ModelArray(obj.constructor);
      modelArray.setMeta({total: 1, offset: 0});
      modelArray.push(obj);
      obj = modelArray;
    }

    if (!(obj instanceof ItemArray)) {
      return this.spoof(obj);
    }

    return this.response(obj, arrInterface);

  }

  public meta(total: number, count: number, offset: number, error: any, summary?: string | null, resource?: any) {

    if (error) {
      total = 0;
      count = 0;
      offset = 0;
      resource = null;
    }

    return {
      total,
      count,
      offset,
      error,
      summary,
      resource
    };

  }

  public error(message: string, details: string) {

    return {
      meta: this.meta(0, 0, 0, {message: message, details: details}),
      data: []
    };

  }

  public spoof(obj: any, useResource?: boolean) {

    if (!(obj instanceof Array)) {
      obj = [obj];
    }

    return {
      meta: this.meta(
        obj.length,
        obj.length,
        0,
        null,
        null,
        useResource && this.resourceFromArray(obj)
      ),
      data: obj
    };

  }

  public response(itemArray: any, arrInterface: any, useResource?: boolean) {

    return {
      meta: this.meta(
        itemArray._meta.total,
        itemArray.length,
        itemArray._meta.offset,
        null,
        null,
        useResource && this.resourceFromModelArray(itemArray, arrInterface)
      ),
      data: itemArray.toObject(arrInterface)
    };

  }

  public resourceFromArray(arr: any[]) {

    function getType(v: any) {
      v = (v instanceof Array) ? v[0] : v;
      const typeObj: IAnyObject = {
        boolean: 'boolean',
        string: 'string',
        number: 'float'
      };

      return typeObj[(typeof v)] || ((v instanceof Date) ? 'datetime' : 'string');
    }

    let fields: any[] = [];

    if (arr.length && arr[0] && typeof arr[0] === 'object') {
      const datum = arr[0];
      fields = Object.keys(datum).map((v: any, i: number) => {

        return {
          name: v,
          type: getType(datum[v]),
          array: (v instanceof Array)
        };

      });
    }

    return {
      name: 'object',
      fields: fields
    };

  }

  public resourceFromModelArray(modelArray: any, arrInterface: any) {

    return modelArray._modelConstructor.toResource(arrInterface);

  }

}

const API = new APIConstructor();

export default API;
