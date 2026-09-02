/**
 * ForestGuard Server-Sent Events (SSE) Broadcaster
 * Manages active browser SSE stream connections and broadcasts real-time hazard alerts instantly.
 */
const clients = new Set();

export function addSseClient(controller) {
	clients.add(controller);
}

export function removeSseClient(controller) {
	clients.delete(controller);
}

export function broadcastForestEvent(eventData) {
	const message = `data: ${JSON.stringify(eventData)}\n\n`;
	const encoder = new TextEncoder();
	const encoded = encoder.encode(message);

	for (const controller of clients) {
		try {
			controller.enqueue(encoded);
		} catch (err) {
			clients.delete(controller);
		}
	}
}

// Keep-alive heartbeat every 15 seconds to prevent browser connection timeouts
if (typeof setInterval !== 'undefined') {
	setInterval(() => {
		const ping = new TextEncoder().encode(':keepalive\n\n');
		for (const controller of clients) {
			try {
				controller.enqueue(ping);
			} catch (err) {
				clients.delete(controller);
			}
		}
	}, 15000);
}
