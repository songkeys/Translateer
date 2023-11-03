import type { Page } from "puppeteer";

type IExamples = string[];

type IDefinitions = Record<
	string,
	{
		definition: string;
		example?: string;
		labels?: string[];
		synonyms?: Record<string, string[]>;
	}[]
>;

type ITranslations = Record<
	string,
	{
		translation: string;
		reversedTranslations: string[];
		frequency: string;
	}[]
>;

export const parsePage = async (
	page: Page,
	{
		text,
		from,
		to,
		lite,
	}: {
		text: string;
		from: string;
		to: string;
		lite: boolean;
	}
) => {
	// click clear button
	await page.$eval("button[aria-label='Clear source text']", (btn) =>
		(btn as HTMLButtonElement).click()
	);

	// switch source and target language
	await page.evaluate(
		(fromSelector, toSelector) => {
			const fromLangs = Array.from(
				document.querySelectorAll<HTMLElement>(fromSelector)
			);
			const toLangs = Array.from(
				document.querySelectorAll<HTMLElement>(toSelector)
			);

			const isInRecentScope = (el: HTMLElement) =>
				(el.parentElement?.firstChild as HTMLElement)?.innerText ===
				"Recent languages";

			// (all)?   (all)?   ?   ?
			// from
			// (all)?   (all)?   ?   ?
			//          to
			let from = fromLangs[0]!;
			let to = toLangs[0]!;

			// check from
			if (isInRecentScope(from)) {
				// recent all
				//        from
				from = fromLangs[1]!;
			}

			// check to
			if (isInRecentScope(to)) {
				// recent all  ?   ?
				//             to
				to = toLangs[2]!;
				if (isInRecentScope(to)) {
					// recent all recent all
					//                   to
					to = toLangs[3]!;
				}
			} else {
				// all ?   ?   ?
				//     to
				to = toLangs[1]!;
				if (isInRecentScope(to)) {
					// all recent all \
					//            to
					to = toLangs[2]!;
				}
			}

			if (from.getAttribute("aria-selected") !== "true") {
				from.click();
			}
			if (to.getAttribute("aria-selected") !== "true") {
				to.click();
			}
		},
		from === "auto"
			? `button[data-language-code='auto']`
			: `div[data-language-code='${from}']`,
		`div[data-language-code='${to}']`
	);

	// type text
	const textareaSelector = "textarea[aria-label='Source text']";
	await page.$eval(
		textareaSelector,
		(textarea, text) =>
			((textarea as HTMLTextAreaElement).value = text as string),
		text
	);
	await page.type(textareaSelector, " ");

	// translating...
	let result = "";
	let pronunciation = "";
	do {
		// const targetSelector = `span[data-language-for-alternatives=${to}]`;
		const targetSelector = `span[lang=${to}]`;
		await page.waitForSelector(targetSelector);

		// get translated text
		result += await page.evaluate(
			(targetSelector) =>
				document
					.querySelector<HTMLElement>(targetSelector)!
					.innerText!.replace(/[\u200B-\u200D\uFEFF]/g, ""), // remove zero-width space
			targetSelector
		);

		// get pronunciation
		pronunciation += await page.evaluate(
			() =>
				document
					.querySelector<HTMLElement>('div[data-location="2"] > div')!
					.innerText!.replace(/[\u200B-\u200D\uFEFF]/g, "") || undefined
		);

		// get next page
		const shouldContinue = await page.evaluate(() => {
			const next = document.querySelector('button[aria-label="Next"]');
			const pseudoNext = getComputedStyle(
				document.querySelector('button[aria-label="Next"] > div')!,
				"::before"
			);
			const hasNext =
				next && pseudoNext.width.endsWith("px") && pseudoNext.width !== "0px";
			const isLastPage = next?.hasAttribute("disabled");
			const shouldContinue = Boolean(hasNext && !isLastPage);
			return shouldContinue;
		});

		if (shouldContinue) {
			// await network idle first
			const xhr = page.waitForResponse((r) => {
				return r
					.url()
					.startsWith(
						"https://translate.google.com/_/TranslateWebserverUi/data/batchexecute"
					);
			});

			await page.evaluate(() => {
				const next = document.querySelector<HTMLButtonElement>(
					'button[aria-label="Next"]'
				)!;
				next.click();
			});

			await xhr;
		} else {
			break;
		}
	} while (true);

	// get from
	// const fromISO = await page.evaluate(() =>
	// 	document
	// 		.querySelector<HTMLElement>("div[data-original-language]")!
	// 		.getAttribute("data-original-language")
	// );

	// get did you mean
	const fromDidYouMean = await page.evaluate(() => {
		const didYouMeanBlock = document.querySelector<HTMLElement>("html-blob");
		const hasDidYouMean = ["Did you mean:", "Showing translation for"].some(
			(t) =>
				didYouMeanBlock?.parentElement?.parentElement?.innerHTML.includes(t)
		);

		return hasDidYouMean ? didYouMeanBlock?.innerText : undefined;
	});

	// get suggestions
	const fromSuggestions =
		lite || from === "auto" // auto lang doesn't have suggestions
			? undefined
			: await page.evaluate(() => {
					const sgsBlocks = Array.from(
						document.querySelectorAll<HTMLElement>('ul[role="listbox"] > li')
					);
					return sgsBlocks.length === 0
						? undefined
						: sgsBlocks.map((b) => {
								return {
									text: b.children[0].textContent!.replace(
										/[\u200B-\u200D\uFEFF]/g,
										""
									),
									translation: b.children[1].textContent!.replace(
										/[\u200B-\u200D\uFEFF]/g,
										""
									),
								};
						  });
			  });

	// get from pronunciation
	const fromPronunciation = await page.evaluate(
		() =>
			document
				.querySelector<HTMLElement>('div[data-location="1"] > div')!
				.innerText!.replace(/[\u200B-\u200D\uFEFF]/g, "") || undefined
	);

	// get examples
	try {
		await page.waitForSelector("html-blob", { timeout: 100 });
	} catch {}

	// get definitions
	const definitions = lite
		? undefined
		: await page.evaluate(() => {
				const ret: IDefinitions = {};

				if (
					!document
						.querySelector<HTMLElement>(
							"c-wiz > div > div > c-wiz > div > c-wiz > div > div:nth-child(3) > div > div > div"
						)
						?.innerText.includes("Definitions of")
				) {
					return ret;
				}

				const definitionalBlocks = Array.from(
					document.querySelectorAll<HTMLElement>(
						"c-wiz > div > div > c-wiz > div > c-wiz > div > div:nth-child(3) > div > div > div > div"
					)
				);

				let blockClassName = undefined;
				for (
					let i = 0,
						currentPos = "unknown",
						currentLabels: string[] | undefined;
					i < definitionalBlocks.length;
					++i
				) {
					const isHiddenBlock =
						definitionalBlocks[i].getAttribute("role") === "presentation";
					const block = isHiddenBlock
						? definitionalBlocks[i].children[0]
						: definitionalBlocks[i];

					const isButtonBlock = block.children[0].tagName === "BUTTON"; // Show all button
					if (isButtonBlock) {
						continue;
					}

					const isPosBlock = block.children[0].childElementCount === 0; // a text block
					if (isPosBlock) {
						currentPos = block.children[0].textContent!.toLowerCase();
						if (currentPos.includes("expand")) {
							continue;
						}
						ret[currentPos] = [];
						currentLabels = undefined; // reset labels
					} else {
						// parse definition block
						let def: IDefinitions[string][number] = { definition: "" };
						if (!blockClassName) {
							blockClassName = block.className;
						} else if (block.className !== blockClassName) {
							continue;
						}
						const leftBlock = block.children[0]; // its children should be number or nothing
						const rightBlock = block.children[1]; // its children should be the definition div or label div
						const isRightBlockLabel = leftBlock.childElementCount === 0;
						if (isRightBlockLabel) {
							currentLabels = [rightBlock.textContent!.toLowerCase()]; // this label should be the following blocks' labels
							continue;
						} else {
							// definition block

							// check the previous labels first
							if (currentLabels) {
								def.labels = currentLabels;
							}

							const blocks = Array.from(rightBlock.children);

							// the leading block could be (local) labels
							const hasLabels = blocks[0].childElementCount >= 1;
							if (hasLabels) {
								def.labels = Array.from(blocks[0].children).map(
									(b) => b.textContent!
								);
								blocks.shift();
							}

							// there must be a definition
							def.definition = blocks[0].textContent!;
							blocks.shift();

							// there may be some blocks after the definition

							// there may be an example
							try {
								const hasExample =
									blocks.length > 0 && blocks[0].children[0]?.tagName === "Q";
								if (hasExample) {
									def.example = blocks[0].children[0].textContent!;
									blocks.shift();
								}
							} catch (e: any) {
								throw new Error(
									`Failed parsing definition's example: ${e.message}. ` +
										JSON.stringify(def)
								);
							}

							// there may be synonyms
							const hasSynonyms =
								blocks.length > 0 && blocks[0].textContent === "Synonyms:";
							if (hasSynonyms) {
								blocks.shift();
								def.synonyms = {};
								while (blocks.length > 0) {
									const words = Array.from(blocks[0].children);
									const hasType = words[0].textContent!.includes(":");
									const type = hasType
										? words[0].textContent!.split(":")[0]
										: "common";
									if (hasType) {
										words.shift();
									}
									def.synonyms[type] = words.map((w) => w.textContent!.trim());
									blocks.shift();
								}
							}

							ret[currentPos].push(def);

							// definition block end
						}
					}
				}

				return ret;
		  });

	const examples = lite
		? undefined
		: await page.evaluate((from) => {
				const egBlocks = Array.from(
					document.querySelectorAll(
						`c-wiz > div > div > c-wiz > div > c-wiz > div > div > div > div:nth-child(2) > div > div div[lang=${from}]`
					)
				);
				return egBlocks.map((el) => el.textContent!) as IExamples;
		  }, from);

	const translations = lite
		? undefined
		: await page.evaluate(() => {
				const ret: ITranslations = {};
				Array.from(
					document.querySelectorAll<HTMLElement>("table > tbody")
				).forEach((tbody) => {
					const [tr0, ...trs] = Array.from(tbody.children);
					const [th0, ...tds] = Array.from(tr0.children);
					const PoS = th0.textContent!.toLowerCase();
					if (PoS === "") return;
					trs.push({ children: tds } as unknown as Element);
					ret[PoS] = trs.map(({ children }) => {
						const [trans, reverseTranses, freq] = Array.from(children);
						return {
							translation: trans.textContent?.trim()!,
							reversedTranslations: Array.from(
								reverseTranses.children[0].children
							)
								.map((c) => c.textContent!.replace(", ", "").split(", "))
								.flat(),
							frequency:
								freq.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild
									?.getAttribute("aria-label")
									?.toLowerCase() ??
								freq.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild
									?.getAttribute("aria-label")
									?.toLowerCase()!,
						};
					});
				});
				return ret;
		  });

	return {
		result,
		// fromISO,
		fromDidYouMean,
		fromSuggestions,
		fromPronunciation,
		pronunciation,
		examples,
		definitions,
		translations,
	};
};
