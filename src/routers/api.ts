import type { FastifyPluginCallback } from "fastify";
import { FREQUENCY, PART_OF_SPEECH } from "../constants";
import { pagePool } from "../pagepool";

export default ((fastify, opts, done) => {
  fastify.get<{
    Querystring: {
      text: string;
      from: string;
      to: string;
      lite: boolean;
    };
  }>(
    "/",
    {
      schema: {
        querystring: {
          text: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          lite: { type: "boolean" },
        },
      },
    },
    async (request, reply) => {
      const { text, from = "auto", to = "zh-CN", lite = false } = request.query;

      const page = pagePool.getPage();
      if (!page) {
        reply
          .code(400)
          .header("Content-Type", "application/json; charset=utf-8")
          .send({
            error: 1,
            message:
              "We're running out of resources. Please wait for a moment and retry.",
          });
        return;
      }

      await page.evaluate(
        ([from, to, text]) => {
          location.href = `?sl=${from}&tl=${to}&text=${encodeURIComponent(
            text
          )}`;
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

      let examples, definitions, translations;
      if (!lite) {
        try {
          await page.waitForSelector("html-blob", { timeout: 200 });
        } catch {}

        examples = await page.evaluate(() =>
          Array.from(document.querySelectorAll("html-blob")).map(
            (blob) => blob.textContent
          )
        );

        definitions = await page.evaluate((PART_OF_SPEECH) => {
          const parseDefinitionBlock = (element: any) => {
            const isFirstLabel =
              element.firstElementChild.firstElementChild &&
              getComputedStyle(element.firstElementChild.firstElementChild)
                .textTransform === "uppercase";
            let i = isFirstLabel ? 1 : 0;
            const labels = isFirstLabel
              ? Array.from(
                  element.firstElementChild.children as HTMLElement[]
                ).map((l) => l.textContent!.toLowerCase())
              : null;
            const definition: string = element.children[i]?.textContent;
            ++i;
            const example: string | null =
              element.children[i]?.children[0]?.tagName === "Q"
                ? element.children[i]?.textContent
                : null;
            ++i;

            const synonyms: Record<string, string[]> = {};
            while (element.children[i]) {
              if (element.children[i].textContent === "同义词") {
                // skip
              }
              const words: string[] = Array.from(
                element.children[i].children as HTMLElement[]
              ).map((e) => e.textContent!.trim());

              if (words.length === 0) {
                // skip
              } else if (words[0].includes("：")) {
                const type = words.shift()!.replace("：", "");
                synonyms[type!] = words;
              } else {
                synonyms.common = words;
              }
              ++i;
            }

            const result: any = {
              definition,
            };

            if (example) {
              result.example = example;
            }

            if (labels) {
              result.label = labels;
            }

            if (Object.keys(synonyms).length > 0) {
              result.synonyms = synonyms;
            }

            return result;
          };

          if (
            !(
              document.querySelectorAll(
                "section > div > div > div:nth-child(1) > div > div > div"
              )[0] as HTMLElement
            )?.innerText.includes("的定义")
          ) {
            return {};
          }
          const definitionalBlocks = Array.from(
            document.querySelectorAll(
              "section > div > div > div:nth-child(1) > div:nth-child(1) > div > div:nth-child(1) > div"
            )
          );

          let i = 0;
          let currentPos = "unknown";
          const definitions: Record<string, any> = {};
          while (definitionalBlocks[i]) {
            const text = definitionalBlocks[i].textContent!;
            const rightBlock =
              definitionalBlocks[i].children[1] ??
              definitionalBlocks[i].children[0].children[1];

            if (
              Object.keys(PART_OF_SPEECH).some((key) => text.includes(key)) ||
              !rightBlock
            ) {
              const chType = text.split("\n")[0].replace(/[a-z]/g, "");
              currentPos = PART_OF_SPEECH[chType] ?? chType;
              definitions[currentPos] = [];
            } else {
              definitions[currentPos].push(
                parseDefinitionBlock(
                  definitionalBlocks[i].children[1] ??
                    definitionalBlocks[i].children[0].children[1]
                )
              );
            }
            ++i;
          }

          return definitions;
        }, PART_OF_SPEECH);

        translations = await page.evaluate(
          (PART_OF_SPEECH, FREQUENCY) => {
            const res: Record<string, any> = {};
            Array.from(document.querySelectorAll("table > tbody")).forEach(
              (tbody) => {
                const [tr0, ...trs] = Array.from(tbody.children);
                const [th0, ...tds] = Array.from(tr0.children);
                const PoS = PART_OF_SPEECH[th0.textContent!];
                trs.push({ children: tds } as unknown as Element);
                res[PoS] = trs.map(({ children }) => {
                  const [trans, reverseTranses, freq] = Array.from(children);
                  return {
                    translation: trans.textContent?.trim(),
                    reverseTranslations: Array.from(
                      reverseTranses.children[0].children
                    )
                      .map((c) => c.textContent!.replace(", ", "").split(", "))
                      .flat(),
                    frequency:
                      FREQUENCY[
                        freq.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.getAttribute(
                          "aria-label"
                        ) ??
                          freq.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.getAttribute(
                            "aria-label"
                          )!
                      ],
                  };
                });
              }
            );
            return res;
          },
          PART_OF_SPEECH,
          FREQUENCY
        );
      }

      pagePool.releasePage(page);

      const packedUpRes: Record<string, any> = {
        result,
        examples,
        definitions,
        translations,
      };

      Object.keys(packedUpRes).forEach((key) => {
        if (
          packedUpRes[key] === undefined ||
          (typeof packedUpRes[key] === "object" &&
            Object.keys(packedUpRes[key]).length === 0) ||
          (Array.isArray(packedUpRes[key]) && packedUpRes[key].length === 0)
        )
          delete packedUpRes[key];
      });

      reply
        .code(200)
        .header("Content-Type", "application/json; charset=utf-8")
        .send(packedUpRes);
    }
  );

  done();
}) as FastifyPluginCallback;
