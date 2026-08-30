import { json } from '@sveltejs/kit';
import { updateFirebaseData } from '$lib/firebase.js';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { tagUid, name, type, count, expiry, loadCellWeight } = body;

		const itemId = tagUid || `med-${Date.now()}`;
		const itemCount = count !== undefined ? Number(count) : loadCellWeight ? Math.max(1, Math.round(loadCellWeight / 10)) : 1;
		
		const now = new Date();
		const expDate = expiry ? new Date(expiry) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		
		let status = 'Fresh';
		if (expDate < now) {
			status = 'Expired';
		} else if (itemCount <= 2) {
			status = 'Low Stock';
		}

		const itemData = {
			id: itemId,
			tagUid: tagUid || itemId,
			name: name || 'Scanned ESP32 Tag',
			type: type || 'RFID',
			count: itemCount,
			expiry: expDate.toISOString().split('T')[0],
			status,
			updatedAt: now.toISOString()
		};

		// Save directly into Firebase Realtime Database at /medicine/data/{itemId}
		await updateFirebaseData(`medicine/data/${itemId}`, itemData);

		return json({
			success: true,
			firebasePath: `/medicine/data/${itemId}`,
			message: 'ESP32 RFID/QR scan stored in Firebase /medicine',
			item: itemData
		});
	} catch (err) {
		return json({ success: false, error: err.message }, { status: 500 });
	}
}
