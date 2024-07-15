function clamp(x, low, high) {
    return Math.min(Math.max(x, low), high);
}

function mix(x, y, a) {
    a = clamp(a, 0, 1);
    return x * (1 - a) + y * a;
}

function remap01(x, low, high) {
    return clamp((x - low) / (high - low), 0, 1);
}

function remap(x, lowIn, highIn, lowOut, highOut) {
    return mix(lowOut, highOut, remap01(x, lowIn, highIn));
}

export {clamp, mix, remap01, remap};