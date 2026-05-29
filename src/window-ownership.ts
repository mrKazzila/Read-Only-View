export type TimerWindow = Pick<Window, 'setTimeout' | 'clearTimeout'>;
export type OwnedTimeout = {
	ownerWindow: TimerWindow;
	id: ReturnType<Window['setTimeout']>;
};

export type AnimationFrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
export type OwnedAnimationFrame = {
	ownerWindow: AnimationFrameWindow | null;
	id: number;
};

function hasTimerMethods(value: unknown): value is TimerWindow {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as TimerWindow).setTimeout === 'function'
		&& typeof (value as TimerWindow).clearTimeout === 'function';
}

function hasAnimationFrameMethods(value: unknown): value is AnimationFrameWindow {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as AnimationFrameWindow).requestAnimationFrame === 'function'
		&& typeof (value as AnimationFrameWindow).cancelAnimationFrame === 'function';
}

export function resolveTimerWindow(preferredWindow?: TimerWindow | null): TimerWindow {
	if (hasTimerMethods(preferredWindow)) {
		return preferredWindow;
	}
	if (hasTimerMethods(typeof activeWindow === 'object' ? activeWindow : undefined)) {
		return activeWindow;
	}
	if (hasTimerMethods(typeof window === 'object' ? window : undefined)) {
		return window;
	}
	return {
		setTimeout,
		clearTimeout,
	};
}

export function scheduleOwnedTimeout(
	callback: () => void,
	delayMs: number,
	preferredWindow?: TimerWindow | null,
): OwnedTimeout {
	const ownerWindow = resolveTimerWindow(preferredWindow);
	return {
		ownerWindow,
		id: ownerWindow.setTimeout(callback, delayMs),
	};
}

export function clearOwnedTimeout(timer: OwnedTimeout | null): void {
	if (!timer) {
		return;
	}
	timer.ownerWindow.clearTimeout(timer.id);
}

export function resolveAnimationFrameWindow(
	preferredWindow?: AnimationFrameWindow | null,
): AnimationFrameWindow | null {
	if (hasAnimationFrameMethods(preferredWindow)) {
		return preferredWindow;
	}
	if (hasAnimationFrameMethods(typeof activeWindow === 'object' ? activeWindow : undefined)) {
		return activeWindow;
	}
	if (hasAnimationFrameMethods(typeof window === 'object' ? window : undefined)) {
		return window;
	}
	return null;
}

export function requestOwnedAnimationFrame(
	callback: FrameRequestCallback,
	preferredWindow?: AnimationFrameWindow | null,
): OwnedAnimationFrame | null {
	const ownerWindow = resolveAnimationFrameWindow(preferredWindow);
	if (ownerWindow) {
		return {
			ownerWindow,
			id: ownerWindow.requestAnimationFrame(callback),
		};
	}
	if (typeof requestAnimationFrame === 'function') {
		return {
			ownerWindow: null,
			id: requestAnimationFrame(callback),
		};
	}
	return null;
}

export function cancelOwnedAnimationFrame(frame: OwnedAnimationFrame): void {
	if (frame.ownerWindow) {
		frame.ownerWindow.cancelAnimationFrame(frame.id);
		return;
	}
	if (typeof cancelAnimationFrame === 'function') {
		cancelAnimationFrame(frame.id);
	}
}
