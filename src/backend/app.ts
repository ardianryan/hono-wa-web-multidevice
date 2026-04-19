import { Hono } from "hono";
import { router } from "./routes.js";

const app = new Hono();
app.route("/", router);

export default app;
