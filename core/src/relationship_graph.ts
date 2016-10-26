const inflect: any = require('i')();
let __id__: number = 0;
import Model from './model';
import {IJoin} from './types';

export interface IOptions {
  name: string;
  multiple: boolean;
  as: string;
  via: string;
}

export class RelationshipPath {

  private 'constructor': typeof RelationshipPath;
  public path: (RelationshipEdge | RelationshipNode)[];

  constructor(path: (RelationshipEdge | RelationshipNode)[]) {
    this.path = path;
  }

  public toString() {
    return this.path.join(' <-> ');
  }

  public joinName(reverse: boolean = false) {

    let path = [].slice.call(this.path);

    if (reverse) {
      path = path.reverse();
    }

    const names: string[] = [];

    while (path.length > 1) {
      const node = path.pop();
      const edge = path.pop();
      names.push(edge.hasChild(node) ? edge.options.name : edge.options.as);
    }

    return names.join('__');

  }

  public add(node: RelationshipNode, edge: RelationshipEdge) {

    return new this.constructor([node, edge].concat(this.path));
  }

  public getModel() {
    return (<RelationshipNode> this.path[0]).Model;
  }

  public multiple() {
    for (let i = 1; i < this.path.length; i += 2) {
      const edge = <RelationshipEdge> this.path[i];
      const node = <RelationshipNode> this.path[i - 1];
      if (edge.hasChild(node) && edge.options.multiple) {
        return true;
      }
    }
    return false;
  }

  public immediateMultiple() {
    const node = <RelationshipNode>this.path[0];
    const edge = <RelationshipEdge> this.path[1];
    if (edge.hasChild(node) && edge.options.multiple) {
      return true;
    }
    return false;
  }

  public joins(alias?: string | null, firstTable?: string): IJoin[] {

    let node: RelationshipNode;
    let i = 0;
    return this.path.slice().reverse().reduce((joins: IJoin[], item: any) => {

      if (item instanceof RelationshipNode) {
        node = item;
        return joins;
      }

      const edge = <RelationshipEdge> item;

      const opposite = edge.opposite(node);
      const join: any = {
        joinTable: opposite && opposite.Model.table(),
        prevTable: joins[joins.length - 1] ? joins[joins.length - 1].joinAlias : (firstTable || null)
      };

      if (edge.hasChild(node)) {
        join.prevColumn = edge.options.via;
        join.joinColumn = 'id';
        join.joinAlias = edge.options.name;
      } else {
        join.prevColumn = 'id';
        join.joinColumn = edge.options.via;
        join.joinAlias = edge.options.as;
      }

      join.joinAlias = alias ? `${alias}${++i}` : join.joinAlias;

      joins.push(join);

      return joins;

    }, []);

  }

}

export class RelationshipNode {

  public Graph: RelationshipGraph;
  public Model: typeof Model;
  public edges: RelationshipEdge[];

  constructor(Graph: RelationshipGraph, mModel: typeof Model) {
    this.Graph = Graph;
    this.Model = mModel;
    this.edges = [];
  }

  public toString() {
    return `[Node: ${this.Model.name}]`;
  }

  public joinsTo(mModel: typeof Model, options: IOptions) {

    if (!mModel.name) {
      // Sanity check for circular dependency resolution
      return null;
    }

    options = options || {};

    options.multiple = !!options.multiple;
    options.as = options.as || (options.multiple ?
                               `${inflect.pluralize(inflect.camelize(this.Model.name, false))}` :
                               `${inflect.camelize(this.Model.name, false)}`);
    options.name = options.name || `${inflect.camelize(mModel.name, false)}`;
    options.via = options.via || `${inflect.underscore(options.name)}_id`;

    const parentNode = this.Graph.of(mModel);
    let edge = this.edges.filter(e => e.parent === parentNode && e.options.name === options.name).pop();

    if (!edge) {
      edge = new RelationshipEdge(parentNode, this, options);
    }

    return edge;

  }

  public childEdges() {
    return this.edges.filter(edge => edge.parent === this);
  }

  public cascade() {

    let queue = this.childEdges();
    let paths = queue.map(e => new RelationshipPath([e.child, e, e.parent]));

    let i = 0;
    while (queue.length) {

      const edge = <RelationshipEdge> queue.shift();
      const curPath = paths[i++];

      const nextEdges = edge.child.childEdges();
      queue = queue.concat(nextEdges);

      paths = paths.concat(nextEdges.map(e => curPath.add(e.child, e)));

    }

    return paths;

  }

  public findExplicit(pathname: string) {

    const names = pathname.split('__');
    let node: RelationshipNode = this;
    let path = new RelationshipPath([node]);

    while (names.length) {

      const name = names.shift();

      const edges = node.edges.filter(edge => {
        return (edge.hasChild(node) && edge.options.name === name) || edge.options.as === name;
      });

      if (edges.length === 0) {
        return null;
      }

      const edge = <RelationshipEdge> edges.pop();
      const nextNode = <RelationshipNode> edge.opposite(node);

      // nextNode could be null
      path = path.add(nextNode, edge);
      node = nextNode;

    }

    return path;

  }

  public find(name: string) {

    let queue = this.edges
      .slice()
      .map(edge => {
        return {edge: edge, path: new RelationshipPath([this])};
      });

    const traversed: any = {};

    while (queue.length) {

      const item = queue[0];
      const curEdge = item.edge;
      const path = item.path;
      let node: any;

      traversed[curEdge.id] = true;

      const curNode = <RelationshipNode> path.path[0];
      node = curEdge.opposite(curNode);

      if ((curEdge.hasChild(curNode) && curEdge.options.name === name) || curEdge.options.as === name) {
        return path.add(node, curEdge);
      }

      queue = queue.slice(1).concat(
        node.edges
          .filter((edge: RelationshipEdge) => !traversed[edge.id])
          .map((edge: RelationshipEdge) => {
            return {
              edge: edge,
              path: path.add(node, curEdge)
            };
          })
      );

    }

    return null;

  }

}

export class RelationshipEdge {

  public id: number;
  public parent: RelationshipNode;
  public child: RelationshipNode;
  public options: IOptions;

  constructor(parent: RelationshipNode, child: RelationshipNode, options: IOptions) {

    this.id = ++__id__;
    this.parent = parent;
    this.child = child;
    this.options = options;

    parent.edges.push(this);
    child.edges.push(this);

  }

  public toString() {
    return `[Edge: ${this.parent.Model.name}, ${this.child.Model.name}]`;
  }

  public hasChild(child: RelationshipNode) {
    return this.child === child;
  }

  public hasParent(parent: RelationshipNode) {
    return this.parent === parent;
  }

  public opposite(node: RelationshipNode) {
    return this.child === node ? this.parent : (this.parent === node ? this.child : null);
  }

}

export default class RelationshipGraph {

  public nodes: RelationshipNode[];
  public edges: RelationshipEdge[];

  constructor() {
    this.nodes = [];
    this.edges = [];
  }

  public of(mModel: typeof Model) {

    let node = this.nodes.filter(n => n.Model === mModel).pop();
    if (!node) {
      node = new RelationshipNode(this, mModel);
      this.nodes.push(node);
    }

    return node;

  }

}
