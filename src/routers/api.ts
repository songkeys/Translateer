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

      let response: Record<string, any>;
      try {
        const res = await parsePage(page, { text, from, to, lite });
        response = {
          result: res.result,
          pronunciation: res.pronunciation,
          from: {
            iso: res.fromISO,
            pronunciation: res.fromPronunciation,
            didYouMean: res.fromDidYouMean,
            suggestions: res.fromSuggestions,
          },
          definitions: res.definitions,
          examples: res.examples,
          translations: res.translations,
        };
      } catch (e) {
        throw e;
      } finally {
        pagePool.releasePage(page);
      }

      Object.keys(response).forEach((key) => {
        if (
          response[key] === undefined ||
          (typeof response[key] === "object" &&
            Object.keys(response[key]).length === 0) ||
          (Array.isArray(response[key]) && response[key].length === 0)
        )
          delete response[key];
      });

      reply
        .code(200)
        .header("Content-Type", "application/json; charset=utf-8")
        .send(response);
    }
  );

  done();
}) as FastifyPluginCallback;
