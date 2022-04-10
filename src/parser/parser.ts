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
  // refresh page to get the result
  await page.evaluate(
    ([from, to, text]) => {
      location.href = `?sl=${from}&tl=${to}&text=${encodeURIComponent(text)}`;
    },
    [from, to, text]
  );

  // translating...
  await page.waitForSelector(`span[lang=${to}]`);

  // get translated text
  const result = await page.evaluate(
    (to) =>
      (document.querySelectorAll(`span[lang=${to}]`)[0] as HTMLElement)
        .innerText,
    to
  );

  // get examples
  try {
    await page.waitForSelector("html-blob", { timeout: 100 });
  } catch {}

  const examples = lite
    ? undefined
    : await page.evaluate<() => IExamples>(() =>
        Array.from(document.querySelectorAll("html-blob")).map(
          (blob) => blob.textContent!
        )
      );

  // get definitions
  const definitions = lite
    ? undefined
    : await page.evaluate<() => IDefinitions>(() => {
        const ret: IDefinitions = {};

        if (
          !document
            .querySelectorAll<HTMLElement>(
              "c-wiz > div > div > c-wiz > div > c-wiz > div > c-wiz > div > div > div > div:nth-child(1) > div > div"
            )[0]
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
        Array.from(document.querySelectorAll("table > tbody")).forEach(
          (tbody) => {
            const [tr0, ...trs] = Array.from(tbody.children);
            const [th0, ...tds] = Array.from(tr0.children);
            const PoS = th0.textContent!;
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
          }
        );
        return ret;
      });

  return {
    result,
    examples,
    definitions,
    translations,
  };
};
