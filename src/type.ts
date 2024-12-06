import type { JWTPayload } from "jose";

export type Variables = {
	connectionId: string;
};

export interface AppBindings {
	Variables: Variables;
	Bindings: Env;
}

export interface AuthPayload extends JWTPayload {
	connectionId: string;
}

export interface MessageData {
	from: string;
	to: string;
	content: string;
}
