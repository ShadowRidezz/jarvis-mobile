// The on-phone brain runs here, off the page's thread, so the orb and the UI stay smooth while it thinks.
import { WebWorkerMLCEngineHandler } from "./vendor/web-llm.js";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
