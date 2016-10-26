import {IAnyObject} from './types';

export interface IArrayMetadata {
  total?: number;
  offset?: number;
  [other: string]: any;
}

/*
* Array of Items, for easy conversion to Objects
* @class
*/
class ItemArray<T> extends Array<T> {

  private _meta: IArrayMetadata;
  /*
  * Create the ItemArray
  */
  constructor() {

    super();
    this._meta = {
      total: 0,
      offset: 0
    };

  }

  /*
  * Convert a normal Array into a ItemArray
  * @param {Array} arr The array of child objects
  */
  public static from(arr: Object[]) {

    const itemArray = new this();
    itemArray.push.apply(itemArray, arr);

    return itemArray;

  }

  /*
  * Sets metadata for the modelArray
  * @param {Object} data values to set
  */
  public setMeta(data: IArrayMetadata): IArrayMetadata {

    Object.keys(data).forEach((k) => this._meta[k] = data[k]);
    return this._meta;

  }

  /*
  * Creates an Array of plain objects from the ModelArray, with properties matching an optional interface
  * @param {Array} arrInterface Interface to use for object creation for each model
  */
  public toObject(arrInterface: string[]): Object {

    let keys: string[] = [];

    if (this.length) {

      keys = Object.keys(this[0]);

      if (arrInterface && arrInterface.length) {
        keys = keys.filter(key => (arrInterface.indexOf(key) !== -1));
      }

    }

    return this.map((item: IAnyObject) =>
      keys.reduce((obj: IBuildableObject, currentKey: string) => {
        obj[currentKey] = item[currentKey];
        return obj;
      }, {})
    );
  }
}

interface IBuildableObject {
  [prop: string]: any;
}

export default ItemArray;
