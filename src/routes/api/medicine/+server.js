import { json } from '@sveltejs/kit';
import { getFirebaseData, updateFirebaseData } from '$lib/firebase.js';

export async function GET() {
	try {
		const firebaseData = await getFirebaseData('medicine');
		
		let itemsObj = {};
		if (firebaseData) {
			itemsObj = firebaseData.data || firebaseData.inventory || firebaseData;
		}

		// Normalize items object to array
		const inventory = Object.values(itemsObj).filter(item => typeof item === 'object' && item !== null && item.name);
		
		const totalItems = inventory.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
		const actionNeededCount = inventory.filter(item => item.status === 'Expired' || item.status === 'Low Stock').length;

		const alerts = inventory
			.filter(item => item.status === 'Expired' || item.status === 'Low Stock')
			.map(item => ({
				id: `alt-${item.id}`,
				title: `${item.name} is ${item.status}`,
				type: item.status === 'Expired' ? 'danger' : 'warning',
				desc: item.status === 'Expired' ? `Expired on ${item.expiry}` : `Low Stock: ${item.count} unit(s) left`
			}));

		return json({
			success: true,
			firebasePath: '/medicine',
			stats: {
				totalItems,
				actionNeededCount,
				totalTypes: inventory.length
			},
			alerts,
			inventory
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { id, name, type, count, expiry, status } = body;

		const itemId = id || String(Date.now());
		const newItem = {
			id: itemId,
			name: name || 'New Medicine Tag',
			type: type || 'RFID',
			count: Number(count) || 1,
			expiry: expiry || '2027-12-31',
			status: status || 'Fresh'
		};

		await updateFirebaseData(`medicine/data/${itemId}`, newItem);

		return json({
			success: true,
			message: 'Medicine inventory updated in Firebase /medicine',
			item: newItem
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
