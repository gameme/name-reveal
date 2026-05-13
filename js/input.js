window.App = window.App || {};

App.Input = {
    pointers: new Map(),

    update(id, clientX, clientY) {
        const DPR = App.DPR;
        const p = this.pointers.get(id);
        if (p) {
            p.prevX = p.x;
            p.prevY = p.y;
            p.x = clientX * DPR;
            p.y = clientY * DPR;
        } else {
            const x = clientX * DPR;
            const y = clientY * DPR;
            this.pointers.set(id, { id, x, y, prevX: x, prevY: y });
        }
    },

    remove(id) {
        this.pointers.delete(id);
        App.Strings.clearLocksForPointer(id);
    },

    clear() {
        this.pointers.clear();
        App.Strings.locks.clear();
    },

    bindEvents(canvas) {
        canvas.addEventListener('mousemove', (e) => this.update('mouse', e.clientX, e.clientY));
        canvas.addEventListener('mouseleave', () => this.remove('mouse'));
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                this.update(touch.identifier, touch.clientX, touch.clientY);
            }
        }, { passive: false });
        canvas.addEventListener('touchend', (e) => {
            for (const touch of e.changedTouches) {
                this.remove(touch.identifier);
            }
        });
        canvas.addEventListener('touchcancel', () => this.clear());
    }
};
