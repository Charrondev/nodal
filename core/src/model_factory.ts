import Model from './model';
import ModelArray from './model_array';
import async from 'async';
import fs from 'fs';

export interface IModelData {
  [modelName: string]: any[];
}

// TODO: Cleanup some of the uglier nesting going on here.

/**
 * Factory for creating models
 * @class
 */
class ModelFactory {

  private Model: typeof Model;

  /**
   * Create the ModelFactory with a provided Model to use as a reference.
   * @param {Nodal.Model} modelConstructor Must pass the constructor for the type of ModelFactory you wish to create.
   */
  constructor(modelConstructor: typeof Model) {

    this.Model = modelConstructor;

  }

  /**
   * Loads all model constructors in your ./app/models directory into an array
   * @return {Array} Array of model Constructors
   */
  public static loadModels(): any[] {

    const dir = './app/models';
    if (!fs.existsSync(dir)) {
      return [];
    }

    return <ModelArray>fs
      .readdirSync(dir)
      .map(filename => require(`${process.cwd()}/app/models/${filename}`));

  }

  /**
   * Creates new factories from a supplied array of Models, loading in data keyed by Model name
   * @param {Array} Models Array of model constructors you wish to reference
   * @param {Object} objModelData Keys are model names, values are arrays of model data you wish to create
   * @param {Function} callback What to execute upon completion
   */
  public static createFromModels(Models: (typeof Model)[], objModelData: IModelData, callback: Function) {

    if (objModelData instanceof Array) {
      async.series(
        objModelData.map(objModelData => (callback: Function) => this.createFromModels(Models, objModelData, callback)),
        (err: Error, results: any) => {
          results = (results || []).reduce((results: any, res: any) => {
            return results.concat(res);
          }, []);
          callback(err || null, results);
        }
      );
      return;
    }

    async.parallel(
      Models
        .filter(m => objModelData[m.name] && objModelData[m.name].length)
        .map(m => (callback: Function) => new this(m).create(objModelData[m.name], callback)),
      (err, results) => callback(err || null, results)
    );

  }

  /**
   * Populates a large amount of model data from an Object.
   * @param {Array} Models Array of Model constructors
   */
  public static populate(objModelData: IModelData, callback: Function) {

    return this.createFromModels(this.loadModels(), objModelData, callback);

  }

  /**
   * Creates models from an array of Objects containing the model data
   * @param {Array} arrModelData Array of objects to create model data from
   */
  public create(arrModelData: IModelData[], callback: Function) {

    // new this.Model(data, false, true) is telling the Model that this is from a seed

    ModelArray
      .from(arrModelData.map(data => new this.Model(data, false, true)))
      .saveAll(callback);

  }

}

export default ModelFactory;
