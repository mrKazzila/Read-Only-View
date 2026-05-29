import {
	clearOwnedTimeout,
	scheduleOwnedTimeout,
	type OwnedTimeout,
	type TimerWindow,
} from './window-ownership';

export class DebouncedRenderScheduler {
	private timer: OwnedTimeout | null = null;
	private disposed = false;

	constructor(
		private readonly delayMs: number,
		private readonly render: () => void,
		private readonly ownerWindow?: TimerWindow | null,
	) {}

	schedule(): void {
		if (this.disposed) {
			return;
		}
		clearOwnedTimeout(this.timer);
		this.timer = scheduleOwnedTimeout(() => {
			this.timer = null;
			if (!this.disposed) {
				this.render();
			}
		}, this.delayMs, this.ownerWindow);
	}

	flush(): void {
		if (this.disposed) {
			return;
		}
		clearOwnedTimeout(this.timer);
		this.timer = null;
		this.render();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		clearOwnedTimeout(this.timer);
		this.timer = null;
	}
}
