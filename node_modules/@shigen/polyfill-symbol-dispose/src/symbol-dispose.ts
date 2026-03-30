function polyfill(name: string) {
	if (!Object.getOwnPropertyDescriptor(Symbol, name)) {
		Object.defineProperty(Symbol, name, {
			value: Symbol(`@shigen/polyfill-symbol-dispose:Symbol.${name}`),
			configurable: false,
			enumerable: false,
			writable: false,
		});
	}
}

polyfill('dispose');
polyfill('asyncDispose');
