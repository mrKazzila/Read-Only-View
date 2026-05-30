type GlobalValueDescriptor = {
	existed: boolean;
	value: unknown;
};

function setGlobalValue(name: string, value: unknown): GlobalValueDescriptor {
	const globalRecord = globalThis as Record<string, unknown>;
	const existed = Object.prototype.hasOwnProperty.call(globalRecord, name);
	const previous = globalRecord[name];
	Object.defineProperty(globalThis, name, {
		value,
		configurable: true,
		writable: true,
	});
	return {
		existed,
		value: previous,
	};
}

function restoreGlobalValue(name: string, descriptor: GlobalValueDescriptor): void {
	if (descriptor.existed) {
		Object.defineProperty(globalThis, name, {
			value: descriptor.value,
			configurable: true,
			writable: true,
		});
		return;
	}
	delete (globalThis as Record<string, unknown>)[name];
}

export class MockHTMLElement {
	private readonly selectors: Set<string>;
	private readonly children: MockHTMLElement[];
	private readonly attributes: Map<string, string>;
	private readonly eventListeners: Map<string, Array<() => void>>;
	readonly tagName: string;
	parentElement: MockHTMLElement | null;
	ownerDocument: MockDocument | null;
	textContent: string;
	value: string;
	placeholder: string;
	rows: number;
	type: string;

	constructor(selectors: string[] = [], tagName = 'div') {
		this.selectors = new Set(selectors);
		this.children = [];
		this.attributes = new Map<string, string>();
		this.eventListeners = new Map<string, Array<() => void>>();
		this.tagName = tagName.toLowerCase();
		this.parentElement = null;
		this.ownerDocument = null;
		this.textContent = '';
		this.value = '';
		this.placeholder = '';
		this.rows = 0;
		this.type = '';
	}

	addClassSelector(selector: string): void {
		this.selectors.add(selector);
	}

	appendChild(child: MockHTMLElement): void {
		child.parentElement = this;
		child.ownerDocument = this.ownerDocument;
		this.children.push(child);
	}

	private createChild(tag: string, options?: { cls?: string; text?: string; type?: string }): MockHTMLElement {
		const selectors: string[] = [tag.toLowerCase()];
		if (options?.cls) {
			for (const part of options.cls.split(' ').filter(Boolean)) {
				selectors.push(`.${part}`);
			}
		}
		const child = new MockHTMLElement(selectors, tag);
		if (options?.text) {
			child.textContent = options.text;
		}
		if (options?.type) {
			child.type = options.type;
		}
		this.appendChild(child);
		return child;
	}

	createDiv(options?: { cls?: string; text?: string }): MockHTMLElement {
		return this.createChild('div', options);
	}

	createSpan(options?: { cls?: string; text?: string }): MockHTMLElement {
		return this.createChild('span', options);
	}

	createEl(tag: string, options?: { cls?: string; text?: string; type?: string }): MockHTMLElement {
		return this.createChild(tag, options);
	}

	addClass(cls: string): void {
		this.selectors.add(`.${cls}`);
	}

	removeClass(cls: string): void {
		this.selectors.delete(`.${cls}`);
	}

	setText(text: string): void {
		this.textContent = text;
	}

	empty(): void {
		this.children.length = 0;
		this.textContent = '';
	}

	remove(): void {
		if (!this.parentElement) {
			return;
		}
		const siblings = this.parentElement.children;
		const index = siblings.indexOf(this);
		if (index >= 0) {
			siblings.splice(index, 1);
		}
		this.parentElement = null;
	}

	setAttr(name: string, value: string): void {
		this.attributes.set(name, value);
		if (name === 'id') {
			this.selectors.add(`#${value}`);
		}
	}

	getAttr(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	addEventListener(type: string, listener: () => void): void {
		const listeners = this.eventListeners.get(type) ?? [];
		listeners.push(listener);
		this.eventListeners.set(type, listeners);
	}

	trigger(type: string): void {
		for (const listener of this.eventListeners.get(type) ?? []) {
			listener();
		}
	}

	instanceOf<T>(type: { new (): T }): this is T {
		return type === MockHTMLElement || type === (globalThis as Record<string, unknown>).HTMLElement;
	}

	matches(selector: string): boolean {
		return selector
			.split(',')
			.map((part) => part.trim())
			.some((part) => this.selectors.has(part) || part === this.tagName);
	}

	querySelector(selector: string): MockHTMLElement | null {
		for (const child of this.children) {
			if (child.matches(selector)) {
				return child;
			}
			const nested = child.querySelector(selector);
			if (nested) {
				return nested;
			}
		}
		return null;
	}

	querySelectorAll(selector: string): MockHTMLElement[] {
		const matches: MockHTMLElement[] = [];
		for (const child of this.children) {
			if (child.matches(selector)) {
				matches.push(child);
			}
			matches.push(...child.querySelectorAll(selector));
		}
		return matches;
	}

	getChildren(): MockHTMLElement[] {
		return [...this.children];
	}

	contains(node: unknown): boolean {
		if (!(node instanceof MockHTMLElement)) {
			return false;
		}
		if (node === this) {
			return true;
		}
		for (const child of this.children) {
			if (child.contains(node)) {
				return true;
			}
		}
		return false;
	}
}

export class MockDocument {
	readonly body: MockHTMLElement;

	constructor() {
		this.body = new MockHTMLElement();
		this.body.ownerDocument = this;
	}
}

type MockMutationObserverInit = {
	childList?: boolean;
	subtree?: boolean;
};

type MockMutationRecord = {
	addedNodes: unknown[];
};

type MutationObserverCallback = (mutations: MockMutationRecord[], observer: MockMutationObserver) => void;

export class MockMutationObserver {
	static instances: MockMutationObserver[] = [];

	readonly callback: MutationObserverCallback;
	readonly observeCalls: Array<{ target: unknown; options: MockMutationObserverInit }>;
	disconnected = false;

	constructor(callback: MutationObserverCallback) {
		this.callback = callback;
		this.observeCalls = [];
		MockMutationObserver.instances.push(this);
	}

	observe(target: unknown, options: MockMutationObserverInit): void {
		this.observeCalls.push({ target, options });
	}

	disconnect(): void {
		this.disconnected = true;
	}

	takeRecords(): MockMutationRecord[] {
		return [];
	}

	trigger(records: MockMutationRecord[]): void {
		this.callback(records, this);
	}

	static reset(): void {
		MockMutationObserver.instances = [];
	}
}

export type InstalledDomMocks = {
	document: MockDocument;
	documentBody: MockHTMLElement;
	createDocument: () => MockDocument;
	restore: () => void;
};

export function installDomMocks(): InstalledDomMocks {
	const mainDocument = new MockDocument();
	const previousDocument = setGlobalValue('document', mainDocument);
	const previousActiveDocument = setGlobalValue(
		'activeDocument',
		(globalThis as unknown as { document: unknown }).document,
	);
	const previousHTMLElement = setGlobalValue('HTMLElement', MockHTMLElement);
	const previousMutationObserver = setGlobalValue('MutationObserver', MockMutationObserver);
	const previousActiveWindow = setGlobalValue('activeWindow', globalThis);
	const documentBody = (
		(globalThis as unknown as { document: { body: MockHTMLElement } }).document.body
	);

	return {
		document: mainDocument,
		documentBody,
		createDocument: () => new MockDocument(),
		restore: () => {
			restoreGlobalValue('document', previousDocument);
			restoreGlobalValue('activeDocument', previousActiveDocument);
			restoreGlobalValue('HTMLElement', previousHTMLElement);
			restoreGlobalValue('MutationObserver', previousMutationObserver);
			restoreGlobalValue('activeWindow', previousActiveWindow);
			MockMutationObserver.reset();
		},
	};
}
