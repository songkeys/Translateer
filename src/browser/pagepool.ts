import { Browser, executablePath, Page } from "puppeteer";
import puppeteer from "./puppeteer";

const { PUPPETEER_WS_ENDPOINT } = process.env;

export let pagePool: PagePool;

export default class PagePool {
	private _pages: Page[] = [];
	private _pagesInUse: Page[] = [];
	private _browser!: Browser;

	constructor(private pageCount: number = 5) {
		pagePool = this;
	}

	public async init() {
		await this._initBrowser();
		await this._initPages();

		// refresh pages every 1 hour to keep alive
		this._resetInterval(60 * 60 * 1000);
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

	private async _initBrowser() {
		this._browser = PUPPETEER_WS_ENDPOINT
			? await puppeteer.connect({ browserWSEndpoint: PUPPETEER_WS_ENDPOINT })
			: await puppeteer.launch({
					ignoreHTTPSErrors: true,
					headless: process.env.DEBUG !== "true" ? "new" : false,
					executablePath: executablePath(),
					userDataDir: "./tmp/translateer-data",
			  });
		console.log("browser launched");
	}

	private async _initPages() {
		let created = 0;
		this._pages = await Promise.all(
			[...Array(this.pageCount)].map((_, i) =>
				this._browser.newPage().then(async (page) => {
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
					console.log(`page ${i} created`);
					await page.goto("https://translate.google.com/details", {
						waitUntil: "networkidle2",
					});
					console.log(`page ${i} loaded`);
					// privacy consent
					try {
						const btnSelector = 'button[aria-label="Reject all"]';
						await page.waitForSelector(btnSelector, { timeout: 1000 });
						await page.$eval(btnSelector, (btn) => {
							(btn as HTMLButtonElement).click();
						});
						console.log(`page ${i} privacy consent rejected`);
					} catch {
						console.log(`page ${i} privacy consent not found`);
					}
					created++;
					console.log(`page ${i} ready (${created}/${this.pageCount})`);
					return page;
				})
			)
		);
	}

	private _resetInterval(ms: number) {
		setInterval(async () => {
			this._pagesInUse = [];
			this._pages = [];
			await this._browser.close();
			await this._initBrowser();
			await this._initPages();
		}, ms);
	}
}
