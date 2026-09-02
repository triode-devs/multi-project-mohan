import { json } from '@sveltejs/kit';
import { updateFirebaseData, getFirebaseData } from '$lib/firebase.js';

/**
 * ESP32 Endpoint: Air Quality & CO2 Telemetry
 * Accepts telemetry for any configured ESP32 Node ID (e.g. NODE-01, NODE-02, NODE-LIBRARY)
 * Updates place node telemetry and appends structured log to Firebase.
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const nodeId = String(body.nodeId || body.id || 'NODE-01').trim().toUpperCase();

		// Fetch place configuration from Firebase
		const existingNode = (await getFirebaseData(`air-quality/nodes/${nodeId}`)) || {};
		const location = String(body.location || existingNode.location || `Location ${nodeId}`).trim();
		const type = String(body.type || existingNode.type || 'Indoor Auditorium').trim();

		const co2 = Number(body.co2 ?? body.co2_ppm ?? 850);
		let aqi = body.aqi !== undefined ? Number(body.aqi) : Math.round(co2 / 18.8);

		let status = 'Good';
		if (aqi > 100 || co2 > 1000) {
			status = 'Unhealthy';
		} else if (aqi > 50) {
			status = 'Moderate';
		}

		// Automatic Exhaust Ventilation / Cooling Fan Relay logic
		const fanStatus = body.fanStatus || ((status === 'Unhealthy' || co2 > 1000) ? 'ON' : 'OFF');

		const telemetryData = {
			id: nodeId,
			nodeId,
			location,
			type,
			co2,
			aqi,
			status,
			fanStatus,
			lastUpdated: new Date().toISOString()
		};

		// Save telemetry node to Firebase Realtime Database
		await updateFirebaseData(`air-quality/nodes/${nodeId}`, telemetryData);

		// Append telemetry log to Firebase /air-quality/logs
		const logId = `log-${Date.now()}`;
		const newLog = {
			id: logId,
			nodeId,
			location,
			time: new Date().toLocaleTimeString(),
			level: fanStatus === 'ON' ? 'WARNING' : 'SUCCESS',
			type: 'ESP32 Telemetry',
			text: `Packet from ${nodeId} (${location}): CO₂ ${co2} ppm, AQI ${aqi}, Fan Relay: ${fanStatus}`
		};
		await updateFirebaseData(`air-quality/logs/${logId}`, newLog);

		return json({
			success: true,
			firebasePath: `/air-quality/nodes/${nodeId}`,
			message: `ESP32 Air Quality data saved to Firebase for node ${nodeId} (${location})`,
			node: telemetryData,
			command: {
				nodeId,
				fanRelay: fanStatus,
				fanStatus
			}
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function GET({ url }) {
	try {
		const nodeId = url.searchParams.get('nodeId') || 'NODE-01';
		const nodeData = (await getFirebaseData(`air-quality/nodes/${nodeId}`)) || {};
		return json({
			success: true,
			node: nodeData
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
