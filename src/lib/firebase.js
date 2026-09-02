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
 * Fetch data from Firebase Realtime Database at path
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
 * Delete node at path in Firebase Realtime Database
 */
export async function deleteFirebaseData(path) {
	const cleanPath = path.replace(/^\/+|\/+$/g, '');
	const url = `${BASE_URL}/${cleanPath}.json`;
	try {
		const res = await fetch(url, {
			method: 'DELETE'
		});
		if (!res.ok) throw new Error(`Firebase DELETE failed with status ${res.status}`);
		return await res.json();
	} catch (err) {
		console.error(`Firebase DELETE error for /${cleanPath}:`, err);
		return null;
	}
}

/**
 * Seed initial default structure into Firebase if paths are empty
 */
export async function ensureFirebaseSeeded() {
	const forestData = await getFirebaseData('forest');
	if (!forestData) {
		await setFirebaseData('forest', {
			status: { hazardLevel: 'MODERATE', activeRangers: 8, sensorsOnline: 42, totalSensors: 45, weather: { temperature: '31°C', humidity: '45%', windSpeed: '14 km/h' } },
			nodes: {
				'ESP-N01': { id: 'ESP-N01', zone: 'North Ridge', status: 'Fire', battery: '85%', comms: 'Wi-Fi', sensors: { temp: 68.4, hum: 18, smoke: 850, gas: 120, vibration: 0, acoustic: 45 } },
				'ESP-N02': { id: 'ESP-N02', zone: 'East Boundary', status: 'Logging', battery: '92%', comms: 'LoRa', sensors: { temp: 29.1, hum: 65, smoke: 40, gas: 90, vibration: 12.5, acoustic: 105 } }
			},
			alerts: {
				'fa-101': { id: 'fa-101', nodeId: 'ESP-N01', zone: 'North Ridge', hazardType: 'Forest Fire Thermal Spike', severity: 'HIGH', status: 'Active', createdAt: new Date().toISOString() }
			}
		});
	}

	const airData = await getFirebaseData('air-quality');
	if (!airData) {
		await setFirebaseData('air-quality', {
			aqi: 65,
			category: 'MODERATE',
			lastUpdated: new Date().toISOString(),
			metrics: { pm25: '11.2 µg/m³', pm10: '24.5 µg/m³', co2: '415 ppm', tvoc: '0.08 ppm', temperature: '24.5°C', humidity: '52%' },
			nodes: {
				'NODE-01': { id: 'NODE-01', location: 'Seminar Hall-1', type: 'Indoor', aqi: 45, co2: 850, pm25: 12, co: 1.2, no2: 15, status: 'Good', fanStatus: 'OFF' }
			}
		});
	}
}

export default firebaseConfig;
