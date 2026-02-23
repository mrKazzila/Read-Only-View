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
	parentElement: MockHTMLElement | null;

	constructor(selectors: string[] = []) {
		this.selectors = new Set(selectors);
		this.children = [];
		this.parentElement = null;
	}

	addClassSelector(selector: string): void {
		this.selectors.add(selector);
	}

	appendChild(child: MockHTMLElement): void {
		child.parentElement = this;
		this.children.push(child);
	}

	matches(selector: string): boolean {
		return selector
			.split(',')
			.map((part) => part.trim())
			.some((part) => this.selectors.has(part));
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
	documentBody: MockHTMLElement;
	restore: () => void;
};

export function installDomMocks(): InstalledDomMocks {
	const previousDocument = setGlobalValue('document', { body: new MockHTMLElement() });
	const previousHTMLElement = setGlobalValue('HTMLElement', MockHTMLElement);
	const previousMutationObserver = setGlobalValue('MutationObserver', MockMutationObserver);
	const documentBody = (
		(globalThis as unknown as { document: { body: MockHTMLElement } }).document.body
	);

	return {
		documentBody,
		restore: () => {
			restoreGlobalValue('document', previousDocument);
			restoreGlobalValue('HTMLElement', previousHTMLElement);
			restoreGlobalValue('MutationObserver', previousMutationObserver);
			MockMutationObserver.reset();
		},
	};
}
