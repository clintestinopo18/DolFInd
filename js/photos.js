// Private storage: every download is subject to the bucket's access policies.
window.reportPhotos = {
    async compress(file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Choose a JPG, PNG, or WebP image.');
        }
        if (file.size > 2 * 1024 * 1024) throw new Error('Choose a photo smaller than 2 MB.');
        const bitmap = await createImageBitmap(file);
        try {
            const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Photo is too large. Try a smaller image.');
            return blob;
        } finally { bitmap.close(); }
    },
    async upload(blob, userId) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error } = await window.supabaseClient.storage.from('report-photos')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
        if (error) throw new Error(`Photo upload failed: ${error.message}. Check that the photo storage setup has been completed.`);
        return path;
    },
    mount(card, item) {
        const media = document.createElement('div');
        media.className = 'report-media';
        media.textContent = item.image_url ? 'Loading photo…' : 'No photo attached';
        card.prepend(media);
        if (!item.image_url) return;
        // Only storage paths are supported; do not fetch arbitrary external URLs.
        if (!/^[a-f0-9-]+\/[a-f0-9-]+\.jpg$/.test(item.image_url)) {
            media.textContent = 'Photo unavailable';
            return;
        }
        window.supabaseClient.storage.from('report-photos').download(item.image_url)
            .then(({ data, error }) => {
                if (error) throw error;
                if (!media.isConnected) return;
                const url = URL.createObjectURL(data);
                const img = document.createElement('img');
                img.alt = `Photo of ${item.title}`;
                img.onload = () => URL.revokeObjectURL(url);
                img.onerror = () => { URL.revokeObjectURL(url); media.textContent = 'Photo unavailable'; };
                img.src = url;
                media.classList.add('has-photo');
                media.replaceChildren(img);
            }).catch(() => { media.textContent = 'Photo unavailable'; });
    }
};
