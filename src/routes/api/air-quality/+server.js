import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData } from '$lib/firebase.js';

export async function GET() {
	try {
		const airQuality = (await getFirebaseData('air-quality')) || {};
		
		let nodesObj = airQuality.nodes || {};
		let nodesList = Object.values(nodesObj).filter(n => typeof n === 'object' && n !== null);

		// Default to Seminar Hall-1 (NODE-01) or first available node
		let nodeData = nodesObj['NODE-01'] || nodesObj['node-01'] || nodesList[0] || null;

		let logs = airQuality.logs ? Object.values(airQuality.logs) : [];

		return json({
			success: true,
			firebasePath: '/air-quality',
			system: 'Smart Campus Air Quality Monitor',
			node: nodeData,
			nodes: nodesList,
			logs: logs.slice(-20).reverse()
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { action, nodeId, location, type, co2, aqi, fanStatus, status } = body;

		const targetNodeId = String(nodeId || 'NODE-01').trim().toUpperCase();
		const placeName = String(location || 'Seminar Hall-1').trim();
		const placeType = String(type || 'Indoor Auditorium').trim();

		const existing = (await getFirebaseData(`air-quality/nodes/${targetNodeId}`)) || {};

		const currentCo2 = co2 !== undefined ? Number(co2) : (existing.co2 !== undefined ? existing.co2 : 850);
		const currentAqi = aqi !== undefined ? Number(aqi) : (co2 !== undefined ? Math.round(currentCo2 / 18.8) : (existing.aqi !== undefined ? existing.aqi : 45));
		
		let computedStatus = status;
		if (!computedStatus) {
			computedStatus = currentAqi <= 50 ? 'Good' : (currentAqi <= 100 ? 'Moderate' : 'Unhealthy');
		}

		let computedFanStatus = fanStatus;
		if (!computedFanStatus) {
			computedFanStatus = (currentCo2 > 1000 || currentAqi > 100) ? 'ON' : 'OFF';
		}

		const updatedNode = {
			id: targetNodeId,
			nodeId: targetNodeId,
			location: placeName,
			type: placeType,
			co2: currentCo2,
			aqi: currentAqi,
			status: computedStatus,
			fanStatus: computedFanStatus,
			lastUpdated: new Date().toISOString()
		};

		// Save configured node to Firebase Realtime Database
		await updateFirebaseData(`air-quality/nodes/${targetNodeId}`, updatedNode);

		// Format and store structured log in Firebase /air-quality/logs
		const logId = `log-${Date.now()}`;
		const isCreate = action === 'CREATE_PLACE' || !existing.location;
		
		const newLog = {
			id: logId,
			nodeId: targetNodeId,
			location: placeName,
			time: new Date().toLocaleTimeString(),
			level: isCreate ? 'SUCCESS' : (computedFanStatus === 'ON' ? 'WARNING' : 'INFO'),
			type: isCreate ? 'Place Configured' : 'UI Update',
			text: isCreate 
				? `New place '${placeName}' configured with ESP32 Node ID: ${targetNodeId}`
				: `${placeName} (${targetNodeId}) updated: CO₂ ${currentCo2} ppm, AQI ${currentAqi}, Fan: ${computedFanStatus}`
		};
		await updateFirebaseData(`air-quality/logs/${logId}`, newLog);

		return json({
			success: true,
			firebasePath: `/air-quality/nodes/${targetNodeId}`,
			message: `Place '${placeName}' (${targetNodeId}) saved to Firebase /air-quality`,
			node: updatedNode,
			log: newLog
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
