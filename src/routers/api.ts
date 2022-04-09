import type { FastifyPluginCallback } from "fastify";

import { pagePool } from "../browser/pagepool";
import { parsePage } from "../parser/parser";

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

      let result, examples, definitions, translations;
      try {
        const res = await parsePage(page, { text, from, to, lite });
        result = res.result;
        examples = res.examples;
        definitions = res.definitions;
        translations = res.translations;
      } catch (e) {
        throw e;
      } finally {
        pagePool.releasePage(page);
      }

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
