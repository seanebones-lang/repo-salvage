/*
Adapted from lukeed/clsx, src/index.js
Repository: https://github.com/lukeed/clsx
Pinned commit: 925494cf31bcd97d3337aacd34e659e80cae7fe2
Intentional change: object handling uses enumerable own string-keyed properties only.

MIT License

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function toValue(value) {
  if (!value) return '';

  if (typeof value === 'string' || typeof value === 'number') {
    return '' + value;
  }

  let result = '';

  if (Array.isArray(value)) {
    const length = value.length;
    for (let i = 0; i < length; i++) {
      const token = toValue(value[i]);
      if (token) {
        if (result) result += ' ';
        result += token;
      }
    }
  } else if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (value[key]) {
        if (result) result += ' ';
        result += key;
      }
    }
  }

  return result;
}

export function classes(...values) {
  let result = '';
  for (const value of values) {
    const token = toValue(value);
    if (token) {
      if (result) result += ' ';
      result += token;
    }
  }
  return result;
}
