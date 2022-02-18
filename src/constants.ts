export const ROOT = __dirname;
export const PART_OF_SPEECH: Record<string, string> = {
  名词: "noun",
  动词: "verb",
  形容词: "adjective",
  副词: "adverb",
  惊叹词: "interjection",
  感叹词: "interjection",
  代词: "pronoun",
  介词: "preposition",
  连词: "conjunction",
  缩写词: "abbreviation",
  冠词: "title",
  前缀: "prefix",
  后缀: "suffix",
};

export const FREQUENCY: Record<string, string> = {
  常用: "common",
  不常用: "uncommon",
  很少使用: "rare",
};

/**
 * @deprecated
 * This will mutate the order of the response object,
 * thus we should not use it.
 */
export const SCHEMA_RESPONSE = {
  200: {
    type: "object",
    properties: {
      result: { type: "string" },
      examples: { type: "array", items: { type: "string" } },
      definitions: {
        type: "object",
        properties: {
          ...Object.values(PART_OF_SPEECH).reduce((acc, pos) => {
            // @ts-ignore
            acc[pos] = {
              type: "array",
              items: {
                type: "object",
                properties: {
                  definition: { type: "string" },
                  example: { type: "string" },
                  labels: { type: "array", items: { type: "string" } },
                  synonyms: {
                    type: "object",
                    properties: {
                      common: { type: "array", item: "string" },
                      informal: { type: "array", item: "string" },
                      rare: { type: "array", item: "string" },
                    },
                  },
                },
              },
            };
            return acc;
          }, {}),
        },
      },
      translations: {
        type: "object",
        properties: {
          ...Object.values(PART_OF_SPEECH).reduce((acc, pos) => {
            // @ts-ignore
            acc[pos] = {
              type: "array",
              items: {
                type: "object",
                properties: {
                  translation: { type: "string" },
                  reverseTranslations: {
                    type: "array",
                    items: { type: "string" },
                  },
                  frequency: { type: "string" },
                },
              },
            };
            return acc;
          }, {}),
        },
      },
    },
  },
  400: {
    type: "object",
    properties: {
      error: { type: "string" },
      message: { type: "string" },
    },
  },
};
