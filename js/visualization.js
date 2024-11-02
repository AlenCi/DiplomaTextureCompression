// visualization.js

export function displayOriginalImage(originalImage) {
    const canvas = document.getElementById('original-canvas');
    const ctx = canvas.getContext('2d');
    
    const maxDimension = 800;
    const scale = Math.min(1, maxDimension / Math.max(originalImage.width, originalImage.height));
    
    canvas.width = originalImage.width * scale;
    canvas.height = originalImage.height * scale;
    
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
}

export function decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    
    const maxDimension = 1200;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    const imageData = ctx.createImageData(paddedWidth, paddedHeight);

    for (let blockY = 0; blockY < paddedHeight / 4; blockY++) {
        for (let blockX = 0; blockX < paddedWidth / 4; blockX++) {
            const blockIndex = (blockY * (paddedWidth / 4) + blockX) * 2;
            const color0 = compressedData[blockIndex] & 0xFFFF;
            const color1 = compressedData[blockIndex] >> 16;
            const lookupTable = compressedData[blockIndex + 1];
            
            const palette = [
                color565To888(color0),
                color565To888(color1),
                color565To888(color0).map((v, i) => Math.round((2 * v + color565To888(color1)[i]) / 3)),
                color565To888(color0).map((v, i) => Math.round((v + 2 * color565To888(color1)[i]) / 3))
            ];
            
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const colorIndex = (lookupTable >> ((y * 4 + x) * 2)) & 0x3;
                    const color = palette[colorIndex];
                    
                    const imageX = blockX * 4 + x;
                    const imageY = blockY * 4 + y;
                    const i = (imageY * paddedWidth + imageX) * 4;
                    imageData.data.set(color, i);
                    imageData.data[i + 3] = 255;
                }
            }
        }
    }
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paddedWidth;
    tempCanvas.height = paddedHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
}

export function clearResults() {
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    const stats = document.querySelectorAll('.stats');
    stats.forEach(stat => {
        stat.textContent = '';
    });
}

function color565To888(color) {
    const r = (color >> 11) & 0x1F;
    const g = (color >> 5) & 0x3F;
    const b = color & 0x1F;
    return [
        (r << 3) | (r >> 2),
        (g << 2) | (g >> 4),
        (b << 3) | (b >> 2)
    ];
}