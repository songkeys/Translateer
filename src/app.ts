import Fastify from "fastify";
import PagePool from "./browser/pagepool";

const fastify = Fastify({ logger: true });

const { PAGE_COUNT = "5", PORT = "8999" } = process.env;

(async () => {
	console.log("connecting to puppeteer...");

	console.log("connected");

	console.log("initializing pages...");

	await new PagePool(parseInt(PAGE_COUNT, 10)).init();

	console.log("ready");

	fastify.register(require("./routers/api").default, { prefix: "/api" });
	fastify.register(require("./routers/index").default, { prefix: "/" });

	try {
		await fastify.listen({
			port: Number(PORT),
			host: "0.0.0.0",
		});
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
})();
