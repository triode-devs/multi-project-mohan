import { POST as handleTriggerPost, GET as handleTriggerGet } from '../trigger/+server.js';

export async function POST(event) {
	return handleTriggerPost(event);
}

export async function GET(event) {
	return handleTriggerGet(event);
}
