import { GET as handleSseGet } from '../sse/+server.js';

export function GET(event) {
	return handleSseGet(event);
}
