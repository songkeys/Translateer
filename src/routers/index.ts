import type { FastifyPluginCallback } from "fastify";
import path from "path";
import { ROOT } from "../parser/constants";

export default ((fastify, opt, done) => {
	fastify.register(require("@fastify/static"), {
		root: path.join(ROOT, "public"),
	});
	done();
}) as FastifyPluginCallback;
