/**
 * Firebase Configuration Credentials
 */
export const firebaseConfig = {
	apiKey: "AIzaSyDQmgBJmy-lynZHkkbP7dkNw6_QB88vwWo",
	authDomain: "xtension-46aea.firebaseapp.com",
	databaseURL: "https://xtension-46aea-default-rtdb.firebaseio.com",
	projectId: "xtension-46aea",
	storageBucket: "xtension-46aea.firebasestorage.app",
	messagingSenderId: "477839484255",
	appId: "1:477839484255:web:2362ca2bb0fd2c77a182ea",
	measurementId: "G-0MBZG491RY"
};

const BASE_URL = firebaseConfig.databaseURL;

/**
 * Fetch data from Firebase Realtime Database at path (e.g., 'medicine', 'forest', 'air-quality')
 */
export async function getFirebaseData(path) {
	const cleanPath = path.replace(/^\/+|\/+$/g, '');
	const url = `${BASE_URL}/${cleanPath}.json`;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Firebase GET failed with status ${res.status}`);
		return await res.json();
	} catch (err) {
		console.error(`Firebase GET error for /${cleanPath}:`, err);
		return null;
	}
}

/**
 * Replace entire data at path in Firebase Realtime Database
 */
export async function setFirebaseData(path, data) {
	const cleanPath = path.replace(/^\/+|\/+$/g, '');
	const url = `${BASE_URL}/${cleanPath}.json`;
	try {
		const res = await fetch(url, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) throw new Error(`Firebase PUT failed with status ${res.status}`);
		return await res.json();
	} catch (err) {
		console.error(`Firebase PUT error for /${cleanPath}:`, err);
		return null;
	}
}

/**
 * Update (merge) data at path in Firebase Realtime Database
 */
export async function updateFirebaseData(path, data) {
	const cleanPath = path.replace(/^\/+|\/+$/g, '');
	const url = `${BASE_URL}/${cleanPath}.json`;
	try {
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) throw new Error(`Firebase PATCH failed with status ${res.status}`);
		return await res.json();
	} catch (err) {
		console.error(`Firebase PATCH error for /${cleanPath}:`, err);
		return null;
	}
}

/**
 * Seed initial default structure into Firebase if paths are empty
 */
export async function ensureFirebaseSeeded() {
	// 1. Ensure /forest path in Firebase
	const forestData = await getFirebaseData('forest');
	if (!forestData) {
		console.log('🌲 Seeding /forest data into Firebase...');
		await setFirebaseData('forest', {
			status: {
				hazardLevel: 'MODERATE',
				activeRangers: 8,
				sensorsOnline: 42,
				totalSensors: 45,
				weather: { temperature: '31°C', humidity: '45%', windSpeed: '14 km/h' }
			},
			nodes: {
				'ESP-N01': { id: 'ESP-N01', zone: 'North Ridge', status: 'Fire', battery: '85%', comms: 'Wi-Fi', sensors: { temp: 68.4, hum: 18, smoke: 850, gas: 120, vibration: 0, acoustic: 45 } },
				'ESP-N02': { id: 'ESP-N02', zone: 'East Boundary', status: 'Logging', battery: '92%', comms: 'LoRa', sensors: { temp: 29.1, hum: 65, smoke: 40, gas: 90, vibration: 12.5, acoustic: 105 } },
				'ESP-N03': { id: 'ESP-N03', zone: 'River Basin', status: 'Toxic Gas', battery: '78%', comms: 'Wi-Fi', sensors: { temp: 26.5, hum: 70, smoke: 450, gas: 450, vibration: 0, acoustic: 30 } },
				'ESP-N04': { id: 'ESP-N04', zone: 'Pine Valley', status: 'Safe', battery: '100%', comms: 'Wi-Fi', sensors: { temp: 27.2, hum: 62, smoke: 25, gas: 80, vibration: 0.1, acoustic: 35 } }
			},
			alerts: {
				'fa-101': { id: 'fa-101', nodeId: 'ESP-N01', zone: 'North Ridge', hazardType: 'Forest Fire Thermal Spike', severity: 'HIGH', status: 'Active', createdAt: new Date().toISOString() },
				'fa-102': { id: 'fa-102', nodeId: 'ESP-N02', zone: 'East Boundary', hazardType: 'Chainsaw Acoustic Signature', severity: 'MEDIUM', status: 'Dispatched Patrol', createdAt: new Date().toISOString() }
			}
		});
	}

	// 2. Ensure /air-quality path in Firebase
	const airData = await getFirebaseData('air-quality');
	if (!airData) {
		console.log('💨 Seeding /air-quality data into Firebase...');
		await setFirebaseData('air-quality', {
			aqi: 65,
			category: 'MODERATE',
			lastUpdated: new Date().toISOString(),
			metrics: { pm25: '11.2 µg/m³', pm10: '24.5 µg/m³', co2: '415 ppm', tvoc: '0.08 ppm', temperature: '24.5°C', humidity: '52%' },
			nodes: {
				'NODE-01': { id: 'NODE-01', location: 'Chemistry Lab', type: 'Indoor', aqi: 45, co2: 850, pm25: 12, co: 1.2, no2: 15, status: 'Good', fanStatus: 'OFF' },
				'NODE-02': { id: 'NODE-02', location: 'Main Gate Parking', type: 'Outdoor', aqi: 135, co2: 450, pm25: 85, co: 5.4, no2: 60, status: 'Poor', fanStatus: 'ON' },
				'NODE-03': { id: 'NODE-03', location: 'Block B Rooftop', type: 'Outdoor', aqi: 30, co2: 410, pm25: 8, co: 0.5, no2: 10, status: 'Good', fanStatus: 'OFF' },
				'NODE-04': { id: 'NODE-04', location: 'Student Cafeteria', type: 'Indoor', aqi: 110, co2: 1250, pm25: 45, co: 2.1, no2: 25, status: 'Poor', fanStatus: 'ON' }
			}
		});
	}
}

export default firebaseConfig;
