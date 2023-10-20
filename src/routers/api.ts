import type { FastifyPluginCallback } from "fastify";

import { pagePool } from "../browser/pagepool";
import { parsePage } from "../parser/parser";

type Options = {
	text: string;
	from: string;
	to: string;
	lite: boolean;
};

const handler = async (request: any, reply: any) => {
	const options = {
		...request.query,
		...request.body,
	};
	const { token, text, from = "auto", to = "es", lite = false } = options;

	if (!token || token !== process.env.TOKEN) {
		reply
			.code(400)
			.header("Content-Type", "application/json; charset=utf-8")
			.send({
				error: 1,
				message: "token is required",
			});
		return;
	}

	if (!text) {
		reply
			.code(400)
			.header("Content-Type", "application/json; charset=utf-8")
			.send({
				error: 1,
				message: "text is required",
			});
		return;
	}

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
				// iso: res.fromISO,
				pronunciation: res.fromPronunciation,
				didYouMean: res.fromDidYouMean,
				suggestions: res.fromSuggestions,
			},
			definitions: res.definitions,
			examples: res.examples,
			translations: res.translations,
		};

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
	} catch (e) {
		throw e;
	} finally {
		pagePool.releasePage(page);
	}
};

export default ((fastify, opts, done) => {
	fastify.route<{
		Querystring: Options;
	}>({
		method: "GET",
		url: "/",
		schema: {
			querystring: {
				token: { type: "string" },
				text: { type: "string" },
				from: { type: "string" },
				to: { type: "string" },
				lite: { type: "boolean" },
			},
		},
		handler,
	});

	fastify.route<{
		Body: Options;
	}>({
		method: "POST",
		url: "/",
		schema: {
			body: {
				token: { type: "string" },
				text: { type: "string" },
				from: { type: "string" },
				to: { type: "string" },
				lite: { type: "boolean" },
			},
		},
		handler,
	});

	done();
}) as FastifyPluginCallback;
