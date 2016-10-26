import Database from './db/database';
import ItemArray from './item_array.js';
import Model from './model';
import * as async from 'async';

import {RelationshipPath} from './relationship_graph';

import {IAnyObject, Query} from './types';

/*
* Array of Models, for easy conversion to Objects
* @class
*/
class ModelArray extends ItemArray<Model> {

  public Model: typeof Model;

  /*
  * Create the ModelArray with a provided Model to use as a reference.
  * @param {Array|class typeof Nodal.Model} modelConstructor Must pass the constructor for the type of ModelArray you wish to create.
  */
  constructor(modelConstructor: typeof Model) {

    super();
    this.Model = modelConstructor;

  }

  /*
  * Convert a normal Array into a ModelArray
  * @param {Array} arr The array of child objects
  */
  public static from(arr: Model[]): ModelArray {

    if (!arr.length) {
      throw new Error('Cannot create ModelArray from empty Array');
    }

    const modelArray: ModelArray = new ModelArray(arr[0].constructor);
    modelArray.push.apply(modelArray, arr);

    return modelArray;

  }

  /*
  * Creates an Array of plain objects from the ModelArray, with properties matching an optional interface
  * @param {Array} arrInterface Interface to use for object creation for each model
  */
  public toObject(arrInterface?: string[]): any {

    return this.map(model => model.toObject(arrInterface));

  }

  /*
  * Checks if ModelArray has a model in it
  * @param {Nodal.Model} model
  */
  public has(model: Model): boolean {
    return this.filter(m => m.get('id') === model.get('id')).length > 0;
  }

  /*
  * Calls Model#read on each Model in the ModelArray
  * @param {Object}
  */
  public readAll(data: Object): boolean {
    this.forEach(model => model.read(data));
    return true;
  }

  /*
  * Calls Model#set on each Model in the ModelArray
  * @param {string}
  * @param {string}
  */
  public setAll(field: string, value: string): boolean {
    this.forEach(model => model.set(field, value));
    return true;
  }

  /*
  * Destroys (deletes) all models in the ModelArray from the database
  * @param {function} callback Method to invoke upon completion
  */
  public destroyAll(callback: Function): void {

    if (this.filter(m => !m.inStorage()).length) {
      return callback(new Error('Not all models are in storage'));
    }

    const db: Database = this.Model.prototype.db;

    const params: string[] = this.map(m => m.get('id'));
    const sql: string = db.adapter.generateDeleteAllQuery(this.Model.table(), 'id', params);

    db.query(
      sql,
      params,
      (err: Error, result: Object | Object[]) => {

        if (err) {
          return callback.call(this, new Error(err.message));
        }

        this.forEach(model => model._inStorage = false);

        callback.call(this, null);

      }
    );

  }

  /*
  * Destroys model and cascades all deletes.
  * @param {function} callback method to run upon completion
  */
  public destroyCascade(callback: Function): void {

    const db: Database = this.Model.prototype.db;

    if (this.filter(m => !m.inStorage()).length) {
      return callback(new Error('Not all models are in storage'));
    }

    const params: string[] = this.map(model => model.get('id'));

    /*
     * TODO: Clean up this section. 
     */
    let txn: Query = [[db.adapter.generateDeleteAllQuery(this.Model.table(), 'id', params), params]];

    const children: RelationshipPath[] = this.Model.relationships().cascade();
    txn = txn.concat(
      children.map((relation: RelationshipPath) => {
        return [db.adapter.generateDeleteAllQuery(relation.getModel().table(),
               'id', params, relation.joins(null, this.Model.table())), params];
      })
    ).reverse();

    db.transaction(
      txn,
      (err: Error, result: Object | Object[]) => {

        if (err) {
          return callback(err);
        }

        this.forEach(m => m._inStorage = false);

        callback(null);

      }
    );

  }

  /*
  * Saves / updates all models in the ModelArray. Uses beforeSave / afterSave. Will return an error and rollback if *any* model errors out.
  * @param {function} callback returning the error and reference to self
  */
  public saveAll(callback: Function): Function | undefined {

    if (!this.length) {
      return callback.call(this, null, this);
    }

    /**
     * TODO: Try and use some promises here.
     */

    async.series(
      this.map(m => m.beforeSave.bind(m)),
      err => {

        if (err) {
          return callback(err);
        }

        this.__saveAll__((errr: Error) => {

          if (err) {
            return callback(errr, this);
          }

          async.series(
            this.map(m => m.afterSave.bind(m)),
            errrr => callback(errrr || null, this)
          );

        });

      }
    );

  }

  /*
  * save all models (outside of beforeSave / afterSave)
  * @param {function} callback Called with error, if applicable
  * @private
  */
  private __saveAll__(callback: Function): void {

    const firstErrorModel: Model | undefined = this.filter(m => m.hasErrors()).shift();

    if (firstErrorModel) {
      return callback.call(this, firstErrorModel.errorObject());
    }

    async.series(
      this.map(model => model.__verify__.bind(model)),
      (err) => {

        if (err) {
          return callback.call(this, err);
        }

        const db: Database = this.Model.prototype.db;

        db.transaction(
          this.map(model => {
            const query: Query = model.__generateSaveQuery__();
            return [query.sql, query.params];
          }),
          (errr: Error, result: IAnyObject) => {

            if (errr) {
              return callback.call(this, new Error(errr.message));
            }

            this.forEach((model, index) => {
              model.__load__(result[index].rows[0], true);
            });

            callback.call(this, null);

          }
        );

      }
    );

  }

}

export default ModelArray;
