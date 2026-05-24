window.App = window.App || {};

App.Cache = (function() {
    const DPR = App.DPR;
    let photoCanvas = null;
    let photoRadius = 0;
    let dedCanvas = null;
    let dedSize = 0;

    function invalidate() {
        photoRadius = 0;
        dedSize = 0;
    }

    window.addEventListener('resize', invalidate);

    function circularPhoto(img, radius) {
        if (photoCanvas && photoRadius === radius) return photoCanvas;
        const size = radius * 2;
        if (!photoCanvas) photoCanvas = document.createElement('canvas');
        photoCanvas.width = size;
        photoCanvas.height = size;
        const ctx = photoCanvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 2 * DPR, 0, Math.PI * 2);
        ctx.clip();
        const imgAspect = img.width / img.height;
        let drawW, drawH;
        if (imgAspect > 1) { drawH = size; drawW = size * imgAspect; }
        else { drawW = size; drawH = size / imgAspect; }
        ctx.drawImage(img, radius - drawW / 2, radius - drawH / 2, drawW, drawH);
        photoRadius = radius;
        return photoCanvas;
    }

    function text(font, content, color) {
        if (dedCanvas && dedSize === font) return dedCanvas;
        if (!dedCanvas) dedCanvas = document.createElement('canvas');

        // Pull the px font size out of the font shorthand for sizing the scratch.
        const sizeMatch = font.match(/(\d+(?:\.\d+)?)\s*px/);
        const fontPx = sizeMatch ? parseFloat(sizeMatch[1]) : 16;

        // Safari/WebKit 26.5 returns a fallback value (e.g. 41px regardless of
        // which emoji) for measureText().width AND actualBoundingBox* on emoji
        // glyphs, so we can't trust the API for layout. Render into an oversize
        // scratch with textAlign='left' (textAlign='center' is also broken for
        // emoji on that build), then pixel-scan the alpha channel to find the
        // true ink rectangle and copy a tight crop into the cached canvas.
        const oversize = Math.ceil(fontPx * 4);
        const PAD = Math.ceil(fontPx * 0.5);
        const scratch = document.createElement('canvas');
        scratch.width = oversize;
        scratch.height = oversize;
        const sctx = scratch.getContext('2d');
        sctx.font = font;
        sctx.textAlign = 'left';
        sctx.textBaseline = 'middle';
        sctx.fillStyle = color || 'rgba(255, 240, 210, 1)';
        sctx.fillText(content, PAD, oversize / 2);

        const data = sctx.getImageData(0, 0, oversize, oversize).data;
        let minX = oversize, maxX = -1, minY = oversize, maxY = -1;
        for (let y = 0; y < oversize; y++) {
            const row = y * oversize;
            for (let x = 0; x < oversize; x++) {
                if (data[(row + x) * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0) {
            // No ink — collapse to a 1×1 transparent canvas.
            dedCanvas.width = 1;
            dedCanvas.height = 1;
            dedSize = font;
            return dedCanvas;
        }

        // Tight crop with a 2px halo for antialiased edges and the shadow blur.
        const HALO = 2;
        const newW = (maxX - minX + 1) + HALO * 2;
        const newH = (maxY - minY + 1) + HALO * 2;
        dedCanvas.width = newW;
        dedCanvas.height = newH;
        const dctx = dedCanvas.getContext('2d');
        dctx.drawImage(scratch, minX - HALO, minY - HALO, newW, newH, 0, 0, newW, newH);

        dedSize = font;
        return dedCanvas;
    }

    return { invalidate, circularPhoto, text };
})();
