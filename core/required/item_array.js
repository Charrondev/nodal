"use strict";
/*
* Array of Items, for easy conversion to Objects
* @class
*/
class ItemArray extends Array {
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
    static from(arr) {
        const itemArray = new this();
        itemArray.push.apply(itemArray, arr);
        return itemArray;
    }
    /*
    * Sets metadata for the modelArray
    * @param {Object} data values to set
    */
    setMeta(data) {
        Object.keys(data).forEach((k) => this._meta[k] = data[k]);
        return this._meta;
    }
    /*
    * Creates an Array of plain objects from the ModelArray, with properties matching an optional interface
    * @param {Array} arrInterface Interface to use for object creation for each model
    */
    toObject(arrInterface) {
        let keys = [];
        if (this.length) {
            keys = Object.keys(this[0]);
            if (arrInterface && arrInterface.length) {
                keys = keys.filter(key => (arrInterface.indexOf(key) !== -1));
            }
        }
        return this.map((item) => keys.reduce((obj, currentKey) => {
            obj[currentKey] = item[currentKey];
            return obj;
        }, {}));
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ItemArray;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIml0ZW1fYXJyYXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQVFBOzs7RUFHRTtBQUNGLHdCQUEyQixLQUFLO0lBRzlCOztNQUVFO0lBQ0Y7UUFFRSxPQUFPLENBQUM7UUFDUixJQUFJLENBQUMsS0FBSyxHQUFHO1lBQ1gsS0FBSyxFQUFFLENBQUM7WUFDUixNQUFNLEVBQUUsQ0FBQztTQUNWLENBQUM7SUFFSixDQUFDO0lBRUQ7OztNQUdFO0lBQ0YsT0FBYyxJQUFJLENBQUMsR0FBYTtRQUU5QixNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQzdCLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUVyQyxNQUFNLENBQUMsU0FBUyxDQUFDO0lBRW5CLENBQUM7SUFFRDs7O01BR0U7SUFDSyxPQUFPLENBQUMsSUFBb0I7UUFFakMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUVwQixDQUFDO0lBRUQ7OztNQUdFO0lBQ0ssUUFBUSxDQUFDLFlBQXNCO1FBRXBDLElBQUksSUFBSSxHQUFhLEVBQUUsQ0FBQztRQUV4QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUVoQixJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUU1QixFQUFFLENBQUMsQ0FBQyxZQUFZLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3hDLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7UUFFSCxDQUFDO1FBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFnQixLQUMvQixJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBcUIsRUFBRSxVQUFrQjtZQUNwRCxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDYixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQ1AsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDO0FBTUQ7a0JBQWUsU0FBUyxDQUFDIiwiZmlsZSI6Iml0ZW1fYXJyYXkuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0lBbnlPYmplY3R9IGZyb20gJy4vdHlwZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBcnJheU1ldGFkYXRhIHtcbiAgdG90YWw/OiBudW1iZXI7XG4gIG9mZnNldD86IG51bWJlcjtcbiAgW290aGVyOiBzdHJpbmddOiBhbnk7XG59XG5cbi8qXG4qIEFycmF5IG9mIEl0ZW1zLCBmb3IgZWFzeSBjb252ZXJzaW9uIHRvIE9iamVjdHNcbiogQGNsYXNzXG4qL1xuY2xhc3MgSXRlbUFycmF5PFQ+IGV4dGVuZHMgQXJyYXk8VD4ge1xuXG4gIHByaXZhdGUgX21ldGE6IElBcnJheU1ldGFkYXRhO1xuICAvKlxuICAqIENyZWF0ZSB0aGUgSXRlbUFycmF5XG4gICovXG4gIGNvbnN0cnVjdG9yKCkge1xuXG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLl9tZXRhID0ge1xuICAgICAgdG90YWw6IDAsXG4gICAgICBvZmZzZXQ6IDBcbiAgICB9O1xuXG4gIH1cblxuICAvKlxuICAqIENvbnZlcnQgYSBub3JtYWwgQXJyYXkgaW50byBhIEl0ZW1BcnJheVxuICAqIEBwYXJhbSB7QXJyYXl9IGFyciBUaGUgYXJyYXkgb2YgY2hpbGQgb2JqZWN0c1xuICAqL1xuICBwdWJsaWMgc3RhdGljIGZyb20oYXJyOiBPYmplY3RbXSkge1xuXG4gICAgY29uc3QgaXRlbUFycmF5ID0gbmV3IHRoaXMoKTtcbiAgICBpdGVtQXJyYXkucHVzaC5hcHBseShpdGVtQXJyYXksIGFycik7XG5cbiAgICByZXR1cm4gaXRlbUFycmF5O1xuXG4gIH1cblxuICAvKlxuICAqIFNldHMgbWV0YWRhdGEgZm9yIHRoZSBtb2RlbEFycmF5XG4gICogQHBhcmFtIHtPYmplY3R9IGRhdGEgdmFsdWVzIHRvIHNldFxuICAqL1xuICBwdWJsaWMgc2V0TWV0YShkYXRhOiBJQXJyYXlNZXRhZGF0YSk6IElBcnJheU1ldGFkYXRhIHtcblxuICAgIE9iamVjdC5rZXlzKGRhdGEpLmZvckVhY2goKGspID0+IHRoaXMuX21ldGFba10gPSBkYXRhW2tdKTtcbiAgICByZXR1cm4gdGhpcy5fbWV0YTtcblxuICB9XG5cbiAgLypcbiAgKiBDcmVhdGVzIGFuIEFycmF5IG9mIHBsYWluIG9iamVjdHMgZnJvbSB0aGUgTW9kZWxBcnJheSwgd2l0aCBwcm9wZXJ0aWVzIG1hdGNoaW5nIGFuIG9wdGlvbmFsIGludGVyZmFjZVxuICAqIEBwYXJhbSB7QXJyYXl9IGFyckludGVyZmFjZSBJbnRlcmZhY2UgdG8gdXNlIGZvciBvYmplY3QgY3JlYXRpb24gZm9yIGVhY2ggbW9kZWxcbiAgKi9cbiAgcHVibGljIHRvT2JqZWN0KGFyckludGVyZmFjZTogc3RyaW5nW10pOiBPYmplY3Qge1xuXG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAodGhpcy5sZW5ndGgpIHtcblxuICAgICAga2V5cyA9IE9iamVjdC5rZXlzKHRoaXNbMF0pO1xuXG4gICAgICBpZiAoYXJySW50ZXJmYWNlICYmIGFyckludGVyZmFjZS5sZW5ndGgpIHtcbiAgICAgICAga2V5cyA9IGtleXMuZmlsdGVyKGtleSA9PiAoYXJySW50ZXJmYWNlLmluZGV4T2Yoa2V5KSAhPT0gLTEpKTtcbiAgICAgIH1cblxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm1hcCgoaXRlbTogSUFueU9iamVjdCkgPT5cbiAgICAgIGtleXMucmVkdWNlKChvYmo6IElCdWlsZGFibGVPYmplY3QsIGN1cnJlbnRLZXk6IHN0cmluZykgPT4ge1xuICAgICAgICBvYmpbY3VycmVudEtleV0gPSBpdGVtW2N1cnJlbnRLZXldO1xuICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgfSwge30pXG4gICAgKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgSUJ1aWxkYWJsZU9iamVjdCB7XG4gIFtwcm9wOiBzdHJpbmddOiBhbnk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IEl0ZW1BcnJheTtcbiJdfQ==
