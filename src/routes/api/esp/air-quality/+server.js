import { json } from '@sveltejs/kit';
import { POST as handleTelemetryPost, GET as handleTelemetryGet } from './telemetry/+server.js';

export async function POST(event) {
	return handleTelemetryPost(event);
}

export async function GET(event) {
	return handleTelemetryGet(event);
}
