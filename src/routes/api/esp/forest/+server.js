import { json } from '@sveltejs/kit';
import { POST as handleTelemetryPost, GET as handleTelemetryGet } from './telemetry/+server.js';
import { POST as handleTriggerPost } from './trigger/+server.js';

export async function POST(event) {
	try {
		const clone = event.request.clone();
		const body = await clone.json().catch(() => ({}));

		// If ESP32 sends simplified trigger/state string, route to trigger generator
		if (body.state || body.trigger || body.event || body.mode) {
			return handleTriggerPost(event);
		}

		return handleTelemetryPost(event);
	} catch (err) {
		return handleTelemetryPost(event);
	}
}

export async function GET(event) {
	return handleTelemetryGet(event);
}
