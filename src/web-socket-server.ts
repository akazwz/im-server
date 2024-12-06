import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { drizzle, DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import * as schema from "./db/schema";
import { MessageData } from "./type";

export class WebSocketServer extends DurableObject {
	storage: DurableObjectStorage;
	env: Env;
	db: DrizzleSqliteDODatabase<typeof schema>;
	currentlyConntectedWebSockets: number;
	app: Hono = new Hono();

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.storage = state.storage;
		this.env = env;
		this.db = drizzle(state.storage, { logger: false, schema: schema });
		this.currentlyConntectedWebSockets = 0;
		migrate(this.db, migrations);

		this.app.get("/connect", async (c) => {
			const connectionId = c.req.query("connectionId") as string;
			return this.connectWebSocket(connectionId);
		});
	}
	async fetch(request: Request) {
		return this.app.fetch(request);
	}
	async getOnlineUsers() {
		const clients = this.ctx.getWebSockets();
		let users = clients.map((client) => {
			const { connectionId } = client.deserializeAttachment() as {
				connectionId: string;
			};
			return connectionId;
		});
		users = [...new Set(users)];
		return users;
	}
	async connectWebSocket(connectionId: string) {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		server.serializeAttachment({
			connectionId,
		});
		this.ctx.acceptWebSocket(server, [connectionId]);
		this.currentlyConntectedWebSockets++;
		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const msg = JSON.parse(message as string) as MessageData;
		if (!msg.to || msg.to === "") {
			return;
		}
		const { connectionId } = ws.deserializeAttachment() as {
			connectionId: string;
		};
		msg.from = connectionId;
		// 套娃，发送消息。 这个 do 可以和用户当前连接的不是同一个 do。只需要有个 kv 记录一下每个用户连接在哪个 do上就好
		const id = this.env.WEBSOCKET_SERVER.idFromName("foo");
		const stub = this.env.WEBSOCKET_SERVER.get(id);
		await stub.sendMessage(msg);
		// 发送到队列，做后续处理， 比如存入数据库
		await this.env.QUEUE.send(msg);
	}

	async sendMessage(msg: MessageData) {
		// 这里能获取相关的所有连接。解决用户多终端问题
		const clients = this.ctx.getWebSockets(msg.to);
		for (const client of clients) {
			client.send(JSON.stringify(msg));
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		this.currentlyConntectedWebSockets--;
	}
}
