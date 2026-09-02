import { json } from '@sveltejs/kit';
import { updateFirebaseData, getFirebaseData } from '$lib/firebase.js';
import { broadcastForestEvent } from '$lib/forest-sse.js';

/**
 * ESP32 Endpoint: ForestGuard Sensor Telemetry
 * Receives:
 * - Fire Detection (flame sensor / temperature / smoke)
 * - Toxic Gas Detection (MQ-135 / gas PPM)
 * - Tree Cutting Detection (sound sensor / decibels / SW-420 vibration sensor)
 * Supports multiple concurrent active hazards per node!
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const nodeId = String(body.nodeId || body.id || 'NODE-F01').trim().toUpperCase();

		const existing = (await getFirebaseData(`forest/nodes/${nodeId}`)) || {};
		const zone = String(body.zone || body.location || existing.zone || `Forest Zone ${nodeId}`).trim();

		// 1. Fire Detection Sensors (Flame Sensor / Temp / Smoke)
		const flameDetected = Boolean(body.flameDetected ?? body.flame ?? body.fireDetected ?? false);
		const temp = Number(body.temperature ?? body.temp ?? 28.0);
		const smoke = Number(body.smoke ?? body.smokePpm ?? 30);

		// 2. Toxic Gas Sensors (MQ-135 Gas Sensor)
		const toxicGasPpm = Number(body.toxicGasPpm ?? body.gasPpm ?? body.gas ?? 25);
		const toxicGasDetected = Boolean(body.toxicGasDetected ?? (toxicGasPpm > 300));

		// 3. Tree Cutting Sensors (Chainsaw Sound & SW-420 Vibration Sensor)
		const soundDetected = Boolean(body.soundDetected ?? body.soundAlert ?? (Number(body.soundDecibels ?? body.acoustic ?? 40) > 80));
		const vibrationDetected = Boolean(body.vibrationDetected ?? body.vibrationAlert ?? (Number(body.vibrationLevel ?? body.vibration ?? 0) > 5.0));
		const treeCuttingDetected = Boolean(body.treeCuttingDetected ?? (soundDetected || vibrationDetected));

		// Compute Multiple Active Hazards Array
		const activeHazards = [];
		if (flameDetected || temp > 50.0 || smoke > 400) activeHazards.push('Fire');
		if (toxicGasDetected || toxicGasPpm > 300) activeHazards.push('Toxic Gas');
		if (treeCuttingDetected || soundDetected || vibrationDetected) activeHazards.push('Logging');

		const status = activeHazards.length > 0 ? activeHazards[0] : 'Safe';
		let hazardDesc = activeHazards.length > 0 
			? `Hazard alerts detected: ${activeHazards.join(', ')}`
			: 'All forest parameters normal';
		let logLevel = activeHazards.length > 0 ? 'DANGER' : 'INFO';

		// Alarm / Siren Relay Command for ESP32
		const alarmBuzzer = (status !== 'Safe') ? 'ON' : 'OFF';

		const nodeData = {
			id: nodeId,
			nodeId,
			zone,
			status,
			activeHazards,
			fireDetected: flameDetected || (temp > 50.0),
			toxicGasPpm,
			toxicGasDetected,
			soundDetected,
			vibrationDetected,
			treeCuttingDetected,
			sensors: {
				temp,
				humidity: Number(body.humidity ?? body.hum ?? 60),
				smoke,
				toxicGasPpm,
				soundDecibels: Number(body.soundDecibels ?? body.acoustic ?? (soundDetected ? 85 : 40)),
				vibrationLevel: Number(body.vibrationLevel ?? body.vibration ?? (vibrationDetected ? 7.5 : 0))
			},
			comms: body.comms || existing.comms || 'ESP32 Wi-Fi',
			battery: body.battery || existing.battery || '95%',
			lastUpdated: new Date().toISOString()
		};

		// 1. Save telemetry node to Firebase Realtime Database at /forest/nodes/{nodeId}
		await updateFirebaseData(`forest/nodes/${nodeId}`, nodeData);

		// 2. Store Telemetry Log in Firebase /forest/logs/{logId}
		const logId = `log-${Date.now()}`;
		const telemetryLog = {
			id: logId,
			nodeId,
			zone,
			time: new Date().toLocaleTimeString(),
			level: logLevel,
			type: status === 'Safe' ? 'ESP32 Telemetry' : `HAZARD (${status})`,
			text: `ESP32 packet (${nodeId} • ${zone}): ${hazardDesc}`
		};
		await updateFirebaseData(`forest/logs/${logId}`, telemetryLog);

		// 3. Broadcast Instant Server-Sent Event (SSE) to all connected UI clients!
		broadcastForestEvent({
			type: 'TELEMETRY_ALERT',
			nodeId,
			zone,
			status,
			activeHazards,
			hazardDesc,
			node: nodeData,
			log: telemetryLog,
			timestamp: new Date().toISOString()
		});

		return json({
			success: true,
			firebasePath: `/forest/nodes/${nodeId}`,
			message: `ESP32 Telemetry stored in Firebase & broadcasted via SSE for ${zone} (${nodeId})`,
			node: nodeData,
			command: {
				nodeId,
				status,
				alarmBuzzer,
				sirenRelay: alarmBuzzer
			},
			log: telemetryLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function GET({ url }) {
	try {
		const nodeId = url.searchParams.get('nodeId') || 'NODE-F01';
		const nodeData = (await getFirebaseData(`forest/nodes/${nodeId}`)) || {};
		return json({
			success: true,
			node: nodeData
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
