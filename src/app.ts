import Fastify from "fastify";
import PagePool from "./pagepool";
import puppeteer from "./puppeteer";

const fastify = Fastify({ logger: true });

const { PUPPETEER_WS_ENDPOINT, PAGE_COUNT = "5", PORT = 8999 } = process.env;

(async () => {
  const browser = PUPPETEER_WS_ENDPOINT
    ? await puppeteer.connect({ browserWSEndpoint: PUPPETEER_WS_ENDPOINT })
    : await puppeteer.launch({ headless: false, slowMo: 8 });

  console.log("connected");

  console.log("initializing pages...");
  await new PagePool(browser, parseInt(PAGE_COUNT, 10)).init();

  console.log("ready");

  fastify.register(require("./routers/api").default, { prefix: "/api" });
  fastify.register(require("./routers/index").default, { prefix: "/" });

  try {
    await fastify.listen(PORT, "0.0.0.0");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();
