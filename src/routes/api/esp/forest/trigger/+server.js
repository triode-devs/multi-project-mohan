import { json } from '@sveltejs/kit';
import { updateFirebaseData, getFirebaseData } from '$lib/firebase.js';
import { broadcastForestEvent } from '$lib/forest-sse.js';

/**
 * Simplified / Fake ESP32 Trigger Endpoint for Demos & Broken Sensors
 * Supports triggering single or multiple concurrent hazards per node:
 * - "tree_cut_sound" / "sound"
 * - "tree_cut_vibration" / "vibration"
 * - "tree_cut_both"
 * - "toxic_gas" / "toxic"
 * - "fire" / "flame"
 * - "clear" / "safe"
 */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const rawState = String(body.state || body.status || body.event || body.mode || body.trigger || 'clear').toLowerCase().trim();
		const nodeId = String(body.nodeId || body.id || 'NODE-F01').trim().toUpperCase();

		const existing = (await getFirebaseData(`forest/nodes/${nodeId}`)) || {};
		const zone = String(body.zone || body.location || existing.zone || `Sector 4B - North Ridge`).trim();

		let activeHazards = Array.isArray(existing.activeHazards) ? [...existing.activeHazards] : [];

		let fireDetected = existing.fireDetected || false;
		let toxicGasDetected = existing.toxicGasDetected || false;
		let soundDetected = existing.soundDetected || false;
		let vibrationDetected = existing.vibrationDetected || false;

		let temp = Number((26 + Math.random() * 4).toFixed(1));
		let smoke = Math.floor(20 + Math.random() * 25);
		let toxicGasPpm = Math.floor(15 + Math.random() * 30);
		let soundDecibels = Number((35 + Math.random() * 15).toFixed(1));
		let vibrationLevel = Number((0.1 + Math.random() * 0.4).toFixed(2));
		let hazardDesc = 'Status normal';
		let logLevel = 'INFO';

		if (rawState.includes('clear') || rawState.includes('safe')) {
			activeHazards = [];
			fireDetected = false;
			toxicGasDetected = false;
			soundDetected = false;
			vibrationDetected = false;
			hazardDesc = 'No tree cutting, gas, or fire hazards detected. Status Clear.';
		} else {
			if (rawState.includes('sound') || rawState === 'tree_cut_sound') {
				if (!activeHazards.includes('Logging')) activeHazards.push('Logging');
				soundDetected = true;
				soundDecibels = Number((85 + Math.random() * 12).toFixed(1));
				hazardDesc = 'Illegal Tree Cutting Detected via Chainsaw Acoustic Sound Sensor';
				logLevel = 'DANGER';
			}
			
			if (rawState.includes('vib') || rawState === 'tree_cut_vibration') {
				if (!activeHazards.includes('Logging')) activeHazards.push('Logging');
				vibrationDetected = true;
				vibrationLevel = Number((7.0 + Math.random() * 5.0).toFixed(2));
				hazardDesc = 'Illegal Tree Cutting Detected via SW-420 Ground Vibration Sensor';
				logLevel = 'DANGER';
			}
			
			if (rawState.includes('both') || rawState.includes('tree_cut_both')) {
				if (!activeHazards.includes('Logging')) activeHazards.push('Logging');
				soundDetected = true;
				vibrationDetected = true;
				soundDecibels = Number((88 + Math.random() * 10).toFixed(1));
				vibrationLevel = Number((8.5 + Math.random() * 4.0).toFixed(2));
				hazardDesc = 'Critical Tree Cutting Detected via BOTH Chainsaw Sound & SW-420 Vibration Sensors';
				logLevel = 'DANGER';
			}
			
			if (rawState.includes('toxic') || rawState.includes('gas')) {
				if (!activeHazards.includes('Toxic Gas')) activeHazards.push('Toxic Gas');
				toxicGasDetected = true;
				toxicGasPpm = Math.floor(340 + Math.random() * 180);
				hazardDesc = `Toxic Gas Accumulation Alert (MQ-135 Sensor: ${toxicGasPpm} PPM)`;
				logLevel = 'WARNING';
			}
			
			if (rawState.includes('fire') || rawState.includes('flame')) {
				if (!activeHazards.includes('Fire')) activeHazards.push('Fire');
				fireDetected = true;
				temp = Number((62 + Math.random() * 20).toFixed(1));
				smoke = Math.floor(480 + Math.random() * 300);
				hazardDesc = `Wildfire / Thermal Flame Alert Detected! (Temp: ${temp}°C, Smoke: ${smoke} PPM)`;
				logLevel = 'DANGER';
			}
		}

		const status = activeHazards.length > 0 ? activeHazards[0] : 'Safe';
		const alarmBuzzer = (status !== 'Safe') ? 'ON' : 'OFF';

		const nodeData = {
			id: nodeId,
			nodeId,
			zone,
			status,
			activeHazards,
			fireDetected,
			toxicGasPpm,
			toxicGasDetected,
			soundDetected,
			vibrationDetected,
			treeCuttingDetected: soundDetected || vibrationDetected,
			sensors: {
				temp,
				humidity: Math.floor(55 + Math.random() * 15),
				smoke,
				toxicGasPpm,
				soundDecibels,
				vibrationLevel
			},
			comms: existing.comms || 'ESP32 Wi-Fi',
			battery: existing.battery || '95%',
			lastUpdated: new Date().toISOString()
		};

		// 1. Save state to Firebase Realtime Database
		await updateFirebaseData(`forest/nodes/${nodeId}`, nodeData);

		// 2. Save log record to Firebase Realtime Database
		const logId = `log-${Date.now()}`;
		const telemetryLog = {
			id: logId,
			nodeId,
			zone,
			time: new Date().toLocaleTimeString(),
			level: logLevel,
			type: status === 'Safe' ? 'ESP Trigger Clear' : `TRIGGER (${status})`,
			text: `ESP32 Trigger [${rawState}] (${nodeId} • ${zone}): ${hazardDesc}`
		};
		await updateFirebaseData(`forest/logs/${logId}`, telemetryLog);

		// 3. Broadcast real-time Server-Sent Event (SSE) to all open UI clients!
		broadcastForestEvent({
			type: 'TELEMETRY_ALERT',
			nodeId,
			zone,
			status,
			activeHazards,
			hazardDesc,
			fireDetected,
			toxicGasDetected,
			toxicGasPpm,
			soundDetected,
			vibrationDetected,
			treeCuttingDetected: soundDetected || vibrationDetected,
			soundDecibels,
			vibrationLevel,
			temp,
			node: nodeData,
			log: telemetryLog,
			timestamp: new Date().toISOString()
		});

		return json({
			success: true,
			trigger: rawState,
			firebasePath: `/forest/nodes/${nodeId}`,
			message: `ESP32 trigger state '${rawState}' converted to randomized telemetry for ${zone} (${nodeId})`,
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
	return json({
		success: true,
		message: 'ESP32 trigger endpoint ready. Send POST with JSON { "state": "tree_cut_sound" }'
	});
}
