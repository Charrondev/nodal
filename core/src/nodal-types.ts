import * as API from './api';
import Application from './application';
import Composer from './composer';
import Controller from './controller';
import Database from './db/database';
import Daemon from './daemon';
import GraphQuery from './graph_query';
import ItemArray from './item_array';
import Migration from './db/migration';
import Model from './model';
import ModelArray from './model_array';
import ModelFactory from './model_factory';
import RelationshipGraph from './relationship_graph';
import Router from './router';
import Scheduler from './scheduler';
import SchemaGenerator from './db/schema_generator';

const APIResource: any = {};
const CLI: any = {};
const Mime: any = {};

const my: {
  Config?: any;
  Schema?: any;
  bootstrapper?: any;
} = {};

export default {
  API,
  APIResource,
  Application,
  Controller,
  Composer,
  CLI,
  Daemon,
  Database,
  GraphQuery,
  ItemArray,
  Migration,
  Mime,
  Model,
  ModelArray,
  ModelFactory,
  RelationshipGraph,
  Router,
  Scheduler,
  SchemaGenerator,
  my
};
