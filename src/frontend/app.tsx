import { Hono } from "hono";
import { Document } from "./ssr/document.js";
import { TopView } from "./components/top.js";

const app = new Hono();

app.get("/", (c) => {
  return c.redirect("/login");
});

app.get("/demo", (c) => {
  const messages = ["Good Morning", "Good Evening", "Good Night"];
  return c.html(
    <Document initialData={{ messages }}>
      <TopView messages={messages} />
    </Document>,
  );
});

export default app;
