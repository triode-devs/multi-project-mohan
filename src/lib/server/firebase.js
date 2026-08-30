import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin Service Account Credentials Configuration
 */
export const firebaseCredentials = {
	projectId: process.env.FIREBASE_PROJECT_ID || 'multi-projects-demo',
	clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk@multi-projects-demo.iam.gserviceaccount.com',
	privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
};

let dbInstance = null;
let isRealFirebase = false;

try {
	if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
		if (getApps().length === 0) {
			initializeApp({
				credential: cert(firebaseCredentials)
			});
		}
		dbInstance = getFirestore();
		isRealFirebase = true;
		console.log('🔥 Firebase Admin SDK initialized successfully.');
	}
} catch (err) {
	console.warn('⚠️ Firebase Admin SDK initialization deferred, using fallback store:', err.message);
}

// In-Memory Fallback Data Store for local testing / offline state
const memoryStore = {
	medicine_inventory: [
		{ id: '1', name: 'Amoxicillin 250mg', type: 'RFID', count: 14, expiry: '2027-05-10', status: 'Fresh', updatedAt: new Date().toISOString() },
		{ id: '2', name: 'Vitamin C 500mg', type: 'QR', count: 30, expiry: '2026-11-20', status: 'Fresh', updatedAt: new Date().toISOString() },
		{ id: '3', name: 'Paracetamol 500mg', type: 'RFID', count: 2, expiry: '2027-01-15', status: 'Low Stock', updatedAt: new Date().toISOString() },
		{ id: '4', name: 'Aspirin 500mg', type: 'RFID', count: 10, expiry: '2026-07-12', status: 'Expired', updatedAt: new Date().toISOString() }
	],
	medicine_alerts: [
		{ id: 'a1', title: 'Aspirin 500mg expired on 2026-07-12', type: 'danger', timestamp: '1 hour ago', acknowledged: false },
		{ id: 'a2', title: 'Paracetamol 500mg running low (2 units left)', type: 'warning', timestamp: '10 mins ago', acknowledged: false }
	],
	forest_nodes: [
		{ 
			id: 'ESP-N01', nodeId: 'ESP-N01', zone: 'North Ridge', status: 'Fire', battery: '85%', comms: 'Wi-Fi',
			sensors: { temp: 68.4, hum: 18, smoke: 850, gas: 120, vibration: 0, acoustic: 45 }, updatedAt: new Date().toISOString()
		},
		{ 
			id: 'ESP-N02', nodeId: 'ESP-N02', zone: 'East Boundary', status: 'Logging', battery: '92%', comms: 'LoRa',
			sensors: { temp: 29.1, hum: 65, smoke: 40, gas: 90, vibration: 12.5, acoustic: 105 }, updatedAt: new Date().toISOString()
		},
		{ 
			id: 'ESP-N03', nodeId: 'ESP-N03', zone: 'River Basin', status: 'Toxic Gas', battery: '78%', comms: 'Wi-Fi',
			sensors: { temp: 26.5, hum: 70, smoke: 450, gas: 450, vibration: 0, acoustic: 30 }, updatedAt: new Date().toISOString()
		},
		{ 
			id: 'ESP-N04', nodeId: 'ESP-N04', zone: 'Pine Valley', status: 'Safe', battery: '100%', comms: 'Wi-Fi',
			sensors: { temp: 27.2, hum: 62, smoke: 25, gas: 80, vibration: 0.1, acoustic: 35 }, updatedAt: new Date().toISOString()
		}
	],
	forest_alerts: [
		{ id: 'fa-1', nodeId: 'ESP-N01', zone: 'North Ridge', hazardType: 'Forest Fire Thermal Spike', severity: 'HIGH', status: 'Active', createdAt: new Date().toISOString() },
		{ id: 'fa-2', nodeId: 'ESP-N02', zone: 'East Boundary', hazardType: 'Chainsaw Acoustic Signature', severity: 'MEDIUM', status: 'Dispatched Patrol', createdAt: new Date().toISOString() }
	],
	air_quality_nodes: [
		{ id: 'NODE-01', nodeId: 'NODE-01', location: 'Chemistry Lab', type: 'Indoor', aqi: 45, co2: 850, pm25: 12, co: 1.2, no2: 15, status: 'Good', fanStatus: 'OFF', updatedAt: new Date().toISOString() },
		{ id: 'NODE-02', nodeId: 'NODE-02', location: 'Main Gate Parking', type: 'Outdoor', aqi: 135, co2: 450, pm25: 85, co: 5.4, no2: 60, status: 'Poor', fanStatus: 'ON', updatedAt: new Date().toISOString() },
		{ id: 'NODE-03', nodeId: 'NODE-03', location: 'Block B Rooftop', type: 'Outdoor', aqi: 30, co2: 410, pm25: 8, co: 0.5, no2: 10, status: 'Good', fanStatus: 'OFF', updatedAt: new Date().toISOString() },
		{ id: 'NODE-04', nodeId: 'NODE-04', location: 'Student Cafeteria', type: 'Indoor', aqi: 110, co2: 1250, pm25: 45, co: 2.1, no2: 25, status: 'Poor', fanStatus: 'ON', updatedAt: new Date().toISOString() }
	],
	air_quality_logs: []
};

/**
 * Universal Collection Getter (Firestore / Fallback)
 */
export async function getCollection(collectionName) {
	if (isRealFirebase && dbInstance) {
		try {
			const snapshot = await dbInstance.collection(collectionName).get();
			return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
		} catch (err) {
			console.error(`Firebase fetch failed for ${collectionName}:`, err);
		}
	}
	return memoryStore[collectionName] || [];
}

/**
 * Universal Document Setter / Updater (Firestore / Fallback)
 */
export async function saveDocument(collectionName, docId, data) {
	const timestamped = { ...data, updatedAt: new Date().toISOString() };
	if (isRealFirebase && dbInstance) {
		try {
			await dbInstance.collection(collectionName).doc(docId).set(timestamped, { merge: true });
			return timestamped;
		} catch (err) {
			console.error(`Firebase save failed for ${collectionName}/${docId}:`, err);
		}
	}

	if (!memoryStore[collectionName]) memoryStore[collectionName] = [];
	const index = memoryStore[collectionName].findIndex(item => item.id === docId || item.nodeId === docId);
	if (index >= 0) {
		memoryStore[collectionName][index] = { ...memoryStore[collectionName][index], ...timestamped };
	} else {
		memoryStore[collectionName].push({ id: docId, ...timestamped });
	}
	return timestamped;
}

export const db = dbInstance;
