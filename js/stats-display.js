// stats-display.js
import { calculateMSE, calculatePSNR } from './compression-utils.js';
import { decompressAndVisualize } from './visualization.js';

export function displayCompressionResults(
    method,
    originalImage,
    compressedData,
    dimensions,
    compressedSize
) {
    const { width, height, paddedWidth, paddedHeight } = dimensions;
    
    const compressionRatio = (width * height * 4 / compressedSize).toFixed(2);
    const mse = calculateMSE(originalImage, compressedData, width, height, paddedWidth, paddedHeight);
    const psnr = calculatePSNR(mse);

    document.getElementById(`${method}-stats`).textContent = `
        Compression ratio: ${compressionRatio}:1
        MSE: ${mse.toFixed(2)}
        PSNR: ${psnr.toFixed(2)} dB
    `;

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
}