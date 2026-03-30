# Polyfill for `Symbol.dispose` and `Symbol.asyncDispose`

[npm-image]: https://img.shields.io/npm/v/@shigen/polyfill-symbol-dispose.svg
[npm-url]: https://npmjs.org/package/@shigen/polyfill-symbol-dispose

[![NPM Version][npm-image]][npm-url]

This is a lightweight polyfill for the wellknown symbols `dispose` and `asyncDispose` as defined in the [proposal for Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management). Both Babel and TypeScript support the `using` and `await using` Syntax but require the symbols to be defined to work. This polyfill will only create the symbols if they don't exist yet and should be imported before one of the symbols is used. Node.js implemented its own polyfill in versions 18.18 and 20.4 until official support lands in v8.

A complete polyfill of the proposal is available through the [`disposablestack` package](https://www.npmjs.com/package/disposablestack).
