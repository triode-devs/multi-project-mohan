import { addSseClient, removeSseClient } from '$lib/forest-sse.js';
import { getFirebaseData } from '$lib/firebase.js';

export function GET() {
	let controllerRef = null;

	const stream = new ReadableStream({
		async start(controller) {
			controllerRef = controller;
			addSseClient(controller);

			try {
				// Fetch current state from Firebase to push down the single stream call immediately!
				const forestData = (await getFirebaseData('forest')) || {};
				const nodesObj = forestData.nodes || {};
				const nodes = Object.values(nodesObj).filter(n => typeof n === 'object' && n !== null && n.nodeId);
				const logsObj = forestData.logs || {};
				const logs = Object.values(logsObj).filter(l => typeof l === 'object' && l !== null && l.text);

				const initMessage = `data: ${JSON.stringify({ 
					type: 'INITIAL_DATA', 
					message: 'ForestGuard Realtime SSE Stream Active',
					nodes,
					logs: logs.slice(-25).reverse(),
					timestamp: new Date().toISOString()
				})}\n\n`;

				controller.enqueue(new TextEncoder().encode(initMessage));
			} catch (err) {
				const fallback = `data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Stream Active' })}\n\n`;
				controller.enqueue(new TextEncoder().encode(fallback));
			}
		},
		cancel() {
			if (controllerRef) {
				removeSseClient(controllerRef);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': '*',
			'X-Accel-Buffering': 'no'
		}
	});
}

export function OPTIONS() {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': '*'
		}
	});
}
