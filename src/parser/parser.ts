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

	// switch source language
	await page.evaluate((fromSelector) => {
		const from = document.querySelectorAll<HTMLElement>(fromSelector)[0];
		from.click();
	}, `c-wiz[data-node-index='2;0'] div[data-language-code='${from}']`);

	// switch target language
	await page.evaluate((toSelector) => {
		const to = document.querySelectorAll<HTMLElement>(toSelector)[1];
		to.click();
	}, `c-wiz[data-node-index='2;0'] div[data-language-code='${to}']`);

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
	// const targetSelector = `span[data-language-for-alternatives=${to}]`;
	const targetSelector = `div[data-language=${to}] span`;
	await page.waitForSelector(targetSelector);

	// get translated text
	const result = await page.evaluate(
		(targetSelector) =>
			document
				.querySelector<HTMLElement>(targetSelector)!
				.parentElement!.innerText!.replace(/[\u200B-\u200D\uFEFF]/g, ""), // remove zero-width space
		targetSelector
	);

	// get from
	const fromISO = await page.evaluate(() =>
		document
			.querySelector<HTMLElement>("div[data-original-language]")!
			.getAttribute("data-original-language")
	);

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

	// get pronunciation
	const pronunciation = await page.evaluate(
		() =>
			document
				.querySelector<HTMLElement>('div[data-location="2"] > div')!
				.innerText!.replace(/[\u200B-\u200D\uFEFF]/g, "") || undefined
	);

	// get examples
	try {
		await page.waitForSelector("html-blob", { timeout: 100 });
	} catch {}

	const examples = lite
		? undefined
		: await page.evaluate<(hasDidYouMean: boolean) => IExamples>(
				(hasDidYouMean) => {
					const egBlocks = Array.from(document.querySelectorAll("html-blob"));
					if (hasDidYouMean) {
						egBlocks.shift();
					}
					return egBlocks.map((blob) => blob.textContent!);
				},
				fromDidYouMean !== undefined
		  );

	// get definitions
	const definitions = lite
		? undefined
		: await page.evaluate<() => IDefinitions>(() => {
				const ret: IDefinitions = {};

				if (
					!document
						.querySelector<HTMLElement>(
							"c-wiz > div > div > c-wiz > div > c-wiz > div > c-wiz > div > div > div > div:nth-child(1) > div > div"
						)
						?.innerText.includes("Definitions of")
				) {
					return ret;
				}

				const definitionalBlocks = Array.from(
					document.querySelectorAll<HTMLElement>(
						"c-wiz > div > div > c-wiz > div > c-wiz > div > c-wiz > div > div > div > div:nth-child(1) > div > div > div"
					)
				);

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
									blocks.length > 0 && blocks[0].children[0].tagName === "Q";
								if (hasExample) {
									def.example = blocks[0].children[0].textContent!;
									blocks.shift();
								}
							} catch {
								throw JSON.stringify(def);
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

	const translations = lite
		? undefined
		: await page.evaluate<() => ITranslations>(() => {
				const ret: ITranslations = {};
				Array.from(
					document.querySelectorAll<HTMLElement>("table > tbody")
				).forEach((tbody) => {
					const [tr0, ...trs] = Array.from(tbody.children);
					const [th0, ...tds] = Array.from(tr0.children);
					const PoS = th0.textContent!;
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
		fromISO,
		fromDidYouMean,
		fromSuggestions,
		fromPronunciation,
		pronunciation,
		examples,
		definitions,
		translations,
	};
};
