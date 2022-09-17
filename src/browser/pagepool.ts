import type { Browser, Page } from "puppeteer";

export let pagePool: PagePool;

export default class PagePool {
	private _pages: Page[] = [];
	private _pagesInUse: Page[] = [];

	constructor(private browser: Browser, private pageCount: number = 5) {
		pagePool = this;
	}

	public async init() {
		this._pages = await Promise.all(
			[...Array(this.pageCount)].map(() =>
				this.browser.newPage().then(async (page) => {
					await page.setRequestInterception(true);
					page.on("request", (req) => {
						if (
							req.resourceType() === "image" ||
							req.resourceType() === "stylesheet" ||
							req.resourceType() === "font"
						) {
							req.abort();
						} else {
							req.continue();
						}
					});
					await page.goto("https://translate.google.com/", {
						waitUntil: "networkidle2",
					});
					// privacy consent
					try {
						const btnSelector = 'button[aria-label="Reject all"]';
						await page.waitForSelector(btnSelector, { timeout: 1000 });
						await page.$eval(btnSelector, (btn) => {
							(btn as HTMLButtonElement).click();
						});
						console.log("rejected privacy consent");
					} catch {
						console.log("no privacy consent");
					}
					return page;
				})
			)
		);

		// refresh pages every 1 hour to keep alive
		const ONE_HOUR = 60 * 60 * 1000;
		setInterval(() => {
			this._pagesInUse.forEach((page) => {
				this.releasePage(page);
			});
			this._pages.forEach((p) => {
				p.evaluate(() => {
					location.reload();
				});
			});
		}, ONE_HOUR);
	}

	public getPage() {
		const page = this._pages.pop();
		if (!page) {
			return undefined;
		}
		this._pagesInUse.push(page);
		return page;
	}

	public releasePage(page: Page) {
		const index = this._pagesInUse.indexOf(page);
		if (index === -1) {
			return;
		}
		this._pagesInUse.splice(index, 1);
		this._pages.push(page);
	}
}
