// web/visualization.js
import { DecompressionCore } from '../shared/decompression-core.js';

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

    // Use the shared decompression core
    const pixels = DecompressionCore.decompress(compressedData, width, height, paddedWidth, paddedHeight);
    
    // Create ImageData and render to canvas
    const imageData = new ImageData(width, height);
    imageData.data.set(pixels);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
}

export function clearResults() {
    const canvases = [
        document.getElementById('original-canvas'),
        document.getElementById('pca-canvas'),
        document.getElementById('basic-canvas'),
        document.getElementById('random-canvas'),
        document.getElementById('cluster-canvas')
    ];
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    const stats = document.querySelectorAll('.stats');
    stats.forEach(stat => {
        stat.textContent = '';
    });
}