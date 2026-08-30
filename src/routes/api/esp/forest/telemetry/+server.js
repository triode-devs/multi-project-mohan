import { json } from '@sveltejs/kit';
import { updateFirebaseData } from '$lib/firebase.js';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { nodeId, zone, temp, hum, smoke, gas, vibration, acoustic, battery, comms } = body;

		const id = nodeId || `ESP-N0${Math.floor(Math.random() * 5) + 1}`;
		const nodeZone = zone || 'Sector 4B';

		const t = Number(temp) || 28.0;
		const s = Number(smoke) || 30;
		const g = Number(gas) || 80;
		const v = Number(vibration) || 0.0;
		const a = Number(acoustic) || 40;

		let status = 'Safe';
		let hazardTitle = '';

		if (t > 50.0 || s > 500) {
			status = 'Fire';
			hazardTitle = 'Forest Fire Thermal Spike / Heavy Smoke';
		} else if (v > 5.0 || a > 90) {
			status = 'Logging';
			hazardTitle = 'Illegal Logging Chainsaw Acoustic Signature';
		} else if (g > 300) {
			status = 'Toxic Gas';
			hazardTitle = 'Toxic Gas Accumulation Breached Limits';
		}

		const nodeTelemetry = {
			id,
			nodeId: id,
			zone: nodeZone,
			status,
			battery: battery || '95%',
			comms: comms || 'Wi-Fi',
			sensors: { temp: t, hum: Number(hum) || 60, smoke: s, gas: g, vibration: v, acoustic: a },
			updatedAt: new Date().toISOString()
		};

		// 1. Update node telemetry in Firebase at /forest/nodes/{id}
		await updateFirebaseData(`forest/nodes/${id}`, nodeTelemetry);

		// 2. If hazard detected, create alert in Firebase at /forest/alerts/{alertId}
		let createdAlert = null;
		if (status !== 'Safe') {
			const alertId = `fa-${Date.now()}`;
			createdAlert = {
				id: alertId,
				nodeId: id,
				zone: nodeZone,
				hazardType: hazardTitle,
				severity: status === 'Fire' ? 'HIGH' : 'MEDIUM',
				status: 'Active',
				createdAt: new Date().toISOString()
			};
			await updateFirebaseData(`forest/alerts/${alertId}`, createdAlert);
		}

		return json({
			success: true,
			firebasePath: `/forest/nodes/${id}`,
			message: 'ESP32 telemetry saved to Firebase /forest',
			telemetry: nodeTelemetry,
			alertCreated: createdAlert
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
