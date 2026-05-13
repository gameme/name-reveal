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
        const ctx = dedCanvas.getContext('2d');
        ctx.font = font;
        const measured = ctx.measureText(content);
        const h = Math.ceil(parseInt(font) * 2) || 60;
        const w = Math.ceil(measured.width) + 4;
        dedCanvas.width = w;
        dedCanvas.height = h;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color || 'rgba(255, 240, 210, 1)';
        ctx.fillText(content, w / 2, h / 2);
        dedSize = font;
        return dedCanvas;
    }

    return { invalidate, circularPhoto, text };
})();
