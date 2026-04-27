import { render } from "hono/jsx/dom";
import { TopView } from "../components/top.js";
import type { InitialData } from "../ssr/document.js";

const getInitialData = (): InitialData => {
  const el = document.getElementById("__INITIAL_DATA__");
  if (!el?.textContent) return { messages: [] };
  try {
    return JSON.parse(el.textContent) as InitialData;
  } catch {
    return { messages: [] };
  }
};

const mount = () => {
  const root = document.getElementById("app");
  if (!root) return;
  const data = getInitialData();
  render(<TopView messages={data.messages} />, root);
};

mount();