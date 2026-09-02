import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData, deleteFirebaseData } from '$lib/firebase.js';
import { broadcastForestEvent } from '$lib/forest-sse.js';

export async function GET() {
	try {
		const forestData = (await getFirebaseData('forest')) || {};
		
		const nodesObj = forestData.nodes || {};
		const nodes = Object.values(nodesObj).filter(n => typeof n === 'object' && n !== null && n.nodeId);

		const logsObj = forestData.logs || {};
		const logs = Object.values(logsObj).filter(l => typeof l === 'object' && l !== null && l.text);

		const criticalAlerts = nodes.filter(n => n.status !== 'Safe');
		const safeNodes = nodes.filter(n => n.status === 'Safe');

		return json({
			success: true,
			firebasePath: '/forest',
			system: 'ForestGuard Illegal Logging & Wildfire Protection System',
			stats: {
				totalNodes: nodes.length,
				criticalAlertsCount: criticalAlerts.length,
				safeNodesCount: safeNodes.length,
				rangersActive: forestData.rangersActive || 8
			},
			nodes,
			logs: logs.slice(-25).reverse()
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { action, nodeId, zone, status, fireDetected, toxicGasPpm, soundDetected, vibrationDetected, temp, hazardType } = body;

		const targetNodeId = String(nodeId || 'NODE-F01').trim().toUpperCase();
		const targetZone = String(zone || 'Sector 4B - North Ridge').trim();

		// Action: Resolve single alert for a specific node
		if (action === 'RESOLVE_ALERT' || action === 'clear') {
			const existing = (await getFirebaseData(`forest/nodes/${targetNodeId}`)) || {};
			const targetHazard = String(hazardType || body.hazard || '').trim(); // e.g. 'Logging', 'Toxic Gas', 'Fire'

			let activeHazards = Array.isArray(existing.activeHazards) ? [...existing.activeHazards] : (existing.status && existing.status !== 'Safe' ? [existing.status] : []);

			if (targetHazard) {
				activeHazards = activeHazards.filter(h => h.toLowerCase() !== targetHazard.toLowerCase());
			} else {
				activeHazards = [];
			}

			const isStillLogging = activeHazards.includes('Logging');
			const isStillGas = activeHazards.includes('Toxic Gas');
			const isStillFire = activeHazards.includes('Fire');

			const newStatus = activeHazards.length > 0 ? activeHazards[0] : 'Safe';

			const resolvedNode = {
				...existing,
				id: targetNodeId,
				nodeId: targetNodeId,
				zone: existing.zone || targetZone,
				status: newStatus,
				activeHazards,
				fireDetected: isStillFire,
				toxicGasDetected: isStillGas,
				soundDetected: isStillLogging,
				vibrationDetected: isStillLogging,
				treeCuttingDetected: isStillLogging,
				toxicGasPpm: isStillGas ? (existing.toxicGasPpm || 380) : 25,
				temp: isStillFire ? (existing.temp || 65) : 28.0,
				sensors: {
					...(existing.sensors || {}),
					temp: isStillFire ? (existing.sensors?.temp || 65) : 28.0,
					toxicGasPpm: isStillGas ? (existing.sensors?.toxicGasPpm || 380) : 25,
					soundDecibels: isStillLogging ? (existing.sensors?.soundDecibels || 88) : 38.0,
					vibrationLevel: isStillLogging ? (existing.sensors?.vibrationLevel || 8.5) : 0.2
				},
				lastUpdated: new Date().toISOString()
			};

			await updateFirebaseData(`forest/nodes/${targetNodeId}`, resolvedNode);

			const logId = `log-${Date.now()}`;
			const resolveLog = {
				id: logId,
				nodeId: targetNodeId,
				zone: existing.zone || targetZone,
				time: new Date().toLocaleTimeString(),
				level: 'SUCCESS',
				type: 'Alert Resolved',
				text: `Hazard alert ${targetHazard ? '\'' + targetHazard + '\'' : ''} resolved by operator for ${existing.zone || targetZone} (${targetNodeId}). Status: ${newStatus}`
			};
			await updateFirebaseData(`forest/logs/${logId}`, resolveLog);

			// Broadcast Real-time SSE Resolution Event to ALL connected UI windows!
			broadcastForestEvent({
				type: 'NODE_UPDATED',
				nodeId: targetNodeId,
				zone: existing.zone || targetZone,
				status: newStatus,
				activeHazards,
				node: resolvedNode,
				log: resolveLog,
				timestamp: new Date().toISOString()
			});

			return json({
				success: true,
				message: `Hazard alert resolved for ${targetNodeId}`,
				node: resolvedNode,
				log: resolveLog
			});
		}

		if (action === 'dispatch') {
			const alertId = `dispatch-${Date.now()}`;
			const dispatchLog = {
				id: alertId,
				nodeId: targetNodeId,
				zone: targetZone,
				time: new Date().toLocaleTimeString(),
				level: 'SUCCESS',
				type: 'Ranger Dispatch',
				text: `Ranger patrol team dispatched to ${targetZone} (${targetNodeId})`
			};

			await updateFirebaseData(`forest/logs/${alertId}`, dispatchLog);

			// Broadcast SSE Dispatch Event
			broadcastForestEvent({
				type: 'RANGER_DISPATCH',
				nodeId: targetNodeId,
				zone: targetZone,
				log: dispatchLog,
				timestamp: new Date().toISOString()
			});

			return json({
				success: true,
				firebasePath: `/forest/logs/${alertId}`,
				message: `Ranger team dispatched to ${targetZone}`,
				log: dispatchLog
			});
		}

		// Configure or create new Forest Zone Node
		const existing = (await getFirebaseData(`forest/nodes/${targetNodeId}`)) || {};

		const isFire = fireDetected ?? (Number(temp) > 50);
		const isGas = (Number(toxicGasPpm) > 300) || (body.toxicGasDetected ?? false);
		const isLogging = (soundDetected ?? false) || (vibrationDetected ?? false) || (body.treeCuttingDetected ?? false);

		const activeHazards = [];
		if (isFire) activeHazards.push('Fire');
		if (isGas) activeHazards.push('Toxic Gas');
		if (isLogging) activeHazards.push('Logging');

		let computedStatus = status;
		if (!computedStatus) {
			computedStatus = activeHazards.length > 0 ? activeHazards[0] : 'Safe';
		}

		const updatedNode = {
			id: targetNodeId,
			nodeId: targetNodeId,
			zone: targetZone,
			status: computedStatus,
			activeHazards,
			fireDetected: Boolean(isFire),
			toxicGasPpm: Number(toxicGasPpm) || existing.toxicGasPpm || 25,
			soundDetected: Boolean(soundDetected),
			vibrationDetected: Boolean(vibrationDetected),
			temp: Number(temp) || existing.temp || 28.0,
			comms: existing.comms || 'ESP32 Wi-Fi',
			battery: existing.battery || '95%',
			lastUpdated: new Date().toISOString()
		};

		// Save Node to Firebase /forest/nodes/{nodeId}
		await updateFirebaseData(`forest/nodes/${targetNodeId}`, updatedNode);

		// Record Log in Firebase /forest/logs/{logId}
		const logId = `log-${Date.now()}`;
		const isNew = !existing.zone;
		const newLog = {
			id: logId,
			nodeId: targetNodeId,
			zone: targetZone,
			time: new Date().toLocaleTimeString(),
			level: computedStatus === 'Safe' ? 'INFO' : 'WARNING',
			type: isNew ? 'Zone Configured' : 'UI Action',
			text: isNew
				? `New forest node '${targetZone}' (${targetNodeId}) configured in Firebase`
				: `UI updated ${targetZone} (${targetNodeId}): Status ${computedStatus}`
		};
		await updateFirebaseData(`forest/logs/${logId}`, newLog);

		// Broadcast SSE Event
		broadcastForestEvent({
			type: 'NODE_UPDATED',
			nodeId: targetNodeId,
			zone: targetZone,
			status: computedStatus,
			activeHazards,
			node: updatedNode,
			log: newLog,
			timestamp: new Date().toISOString()
		});

		return json({
			success: true,
			firebasePath: `/forest/nodes/${targetNodeId}`,
			message: `Forest node '${targetZone}' (${targetNodeId}) saved to Firebase`,
			node: updatedNode,
			log: newLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function DELETE({ url, request }) {
	try {
		let nodeId = url.searchParams.get('nodeId') || url.searchParams.get('id');
		if (!nodeId) {
			const body = await request.json().catch(() => ({}));
			nodeId = body.nodeId || body.id;
		}

		if (!nodeId) {
			return json({ success: false, error: 'Missing nodeId to delete' }, { status: 400 });
		}

		await deleteFirebaseData(`forest/nodes/${nodeId}`);

		const logId = `log-${Date.now()}`;
		const deleteLog = {
			id: logId,
			nodeId,
			time: new Date().toLocaleTimeString(),
			level: 'DANGER',
			type: 'Node Deleted',
			text: `Forest node ${nodeId} deleted from monitoring system`
		};
		await updateFirebaseData(`forest/logs/${logId}`, deleteLog);

		broadcastForestEvent({
			type: 'NODE_DELETED',
			nodeId,
			timestamp: new Date().toISOString()
		});

		return json({
			success: true,
			message: `Node ${nodeId} deleted from Firebase /forest`,
			deletedId: nodeId,
			log: deleteLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
