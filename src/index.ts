import { Hono } from "hono";
import * as jose from "jose";
import { Context, Next } from "hono";
import { cors } from "hono/cors";

import { WebSocketServer } from "@/web-socket-server";
import { AppBindings, AuthPayload, MessageData } from "@/type";

const app = new Hono<AppBindings>();
const api = new Hono<AppBindings>();

api.use(
	"*",
	cors({
		origin: ["http://localhost:5173"],
		allowHeaders: ["*"],
		allowMethods: ["*"],
		maxAge: 3600,
		credentials: true,
	}),
);

const doRouter = new Hono<AppBindings>();

// connect
doRouter.get("/connect", authMiddleware, async (c) => {
	const upgradeHeader = c.req.header("Upgrade");
	if (upgradeHeader !== "websocket") {
		return c.json({ error: "Not a WebSocket request" }, 400);
	}
	const url = new URL(c.req.url);
	url.searchParams.set("connectionId", c.var.connectionId);
	const id = c.env.WEBSOCKET_SERVER.idFromName("foo");
	const stub = c.env.WEBSOCKET_SERVER.get(id);
	const req = new Request(url.toString(), {
		headers: c.req.raw.headers,
	});
	return stub.fetch(req);
});

async function authMiddleware(c: Context<AppBindings>, next: Next) {
	let token: string | undefined = undefined;
	const authHeader = c.req.header("Authorization");
	if (authHeader && authHeader.startsWith("Bearer ")) {
		token = authHeader.split(" ")[1];
	}
	if (!token) {
		token = c.req.query("token");
	}
	if (!token) {
		return c.json({ error: "Missing token" }, 401);
	}
	try {
		const secret = new TextEncoder().encode(c.env.JWT_SECRET);
		const { payload } = await jose.jwtVerify(token, secret);
		const { connectionId } = payload as AuthPayload;
		if (!connectionId) {
			return c.json({ error: "Invalid token payload" }, 401);
		}
		c.set("connectionId", connectionId);
		return next();
	} catch (error) {
		return c.json({ error: "Invalid token" }, 401);
	}
}

api.get("/me", authMiddleware, async (c) => {
	const connectionId = c.var.connectionId;
	return c.json({ connectionId });
});

api.get("/online", async (c) => {
	const id = c.env.WEBSOCKET_SERVER.idFromName("foo");
	const stub = c.env.WEBSOCKET_SERVER.get(id);
	const users = await stub.getOnlineUsers();
	return c.json(users);
});

api.post("/signin/anonymous", async (c) => {
	const secret = new TextEncoder().encode(c.env.JWT_SECRET);
	const connectionId = crypto.randomUUID();
	const token = await new jose.SignJWT({ connectionId })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("24h")
		.sign(secret);
	return c.json({ token, connectionId });
});

app.route("/", doRouter);
app.route("/", api);

export { WebSocketServer };

export default {
	fetch: app.fetch,
	async queue(batch, env): Promise<void> {
		const messages = batch.messages;
		for (const message of messages) {
			console.log(message);
			message.ack();
		}
	},
} satisfies ExportedHandler<Env>;
