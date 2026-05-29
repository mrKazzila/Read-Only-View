export class DebouncedRenderScheduler {
	private timer: ReturnType<Window['setTimeout']> | null = null;
	private disposed = false;

	constructor(
		private readonly delayMs: number,
		private readonly render: () => void,
	) {}

	schedule(): void {
		if (this.disposed) {
			return;
		}
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
		}
		this.timer = activeWindow.setTimeout(() => {
			this.timer = null;
			if (!this.disposed) {
				this.render();
			}
		}, this.delayMs);
	}

	flush(): void {
		if (this.disposed) {
			return;
		}
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
			this.timer = null;
		}
		this.render();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
