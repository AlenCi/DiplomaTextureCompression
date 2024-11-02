// compression-utils.js

export function calculateMSE(original, compressed, width, height, paddedWidth, paddedHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = paddedWidth;
    canvas.height = paddedHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, paddedWidth, paddedHeight).data;
    
    let mse = 0;
    for (let y = 0; y < paddedHeight; y++) {
        for (let x = 0; x < paddedWidth; x++) {
            const i = (y * paddedWidth + x) * 4;
            const blockIndex = (Math.floor(y / 4) * (paddedWidth / 4) + Math.floor(x / 4)) * 2;
            const pixelIndex = (y % 4) * 4 + (x % 4);
            const color0 = compressed[blockIndex] & 0xFFFF;
            const color1 = compressed[blockIndex] >> 16;
            const lookupTable = compressed[blockIndex + 1];
            const colorIndex = (lookupTable >> (pixelIndex * 2)) & 0x3;
            
            const decompressedColor = getDecompressedColor(color0, color1, colorIndex);
            
            for (let j = 0; j < 3; j++) {
                const diff = originalData[i + j] - decompressedColor[j];
                mse += diff * diff;
            }
        }
    }
    
    return mse / (paddedWidth * paddedHeight * 3);
}

export function calculatePSNR(mse) {
    return 10 * Math.log10(255 * 255 / mse);
}

export function getDecompressedColor(color0, color1, colorIndex) {
    const c0 = color565To888(color0);
    const c1 = color565To888(color1);
    
    switch (colorIndex) {
        case 0: return c0;
        case 1: return c1;
        case 2: return c0.map((v, i) => Math.round((2 * v + c1[i]) / 3));
        case 3: return c0.map((v, i) => Math.round((v + 2 * c1[i]) / 3));
    }
}

export function color565To888(color) {
    const r = (color >> 11) & 0x1F;
    const g = (color >> 5) & 0x3F;
    const b = color & 0x1F;
    return [
        (r << 3) | (r >> 2),
        (g << 2) | (g >> 4),
        (b << 3) | (b >> 2)
    ];
}