export interface IDataTypes {
  [type: string]: {
    convert: (v: any) => any;
  };
}

const dataTypes: IDataTypes = {
  serial: {
    convert: (v: any) => {
      return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
    }
  },
  int: {
    convert: (v: any) => {
      return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
    }
  },
  currency: {
    convert: (v: any) => {
      return Math.max(Math.min(parseInt(v, 10) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
    }
  },
  float: {
    convert: (v: any) => {
      return parseFloat(v) || 0;
    }
  },
  string: {
    convert: (v: any) => {
      return v === null ? '' : (v + '');
    }
  },
  text: {
    convert: (v: any) => {
      return v === null ? '' : (v + '');
    }
  },
  datetime: {
    convert: (v: any) => {
      if (!(v instanceof Date)) {
        v = new Date(v);
        if (v.toString() === 'Invalid Date') {
          v = new Date(0);
        }
      }
      return v;
    }
  },
  boolean: {
    convert: (v: any) => {
      const negatives: string[] = ['f', 'false', 'n', 'no', 'off', '0', ''];
      const convertedToNumber: number = negatives.indexOf(v) > -1 ? 1 : 0;
      return typeof v === 'string' ? [true, false][convertedToNumber] : !!v;
    }
  },
  json: {
    convert: (v: any) => {
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  }
};

export default dataTypes;
