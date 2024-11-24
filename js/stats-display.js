// stats-display.js
import { calculateMSE, calculatePSNR } from './compression-utils.js';
import { decompressAndVisualize } from './visualization.js';
import { DDSWebHandler } from '../shared/dds-web-handler.js';

export function displayCompressionResults(method, originalImage, compressedData, dimensions, compressedSize) {
    const { width, height, paddedWidth, paddedHeight } = dimensions;
    
    const compressionRatio = (width * height * 4 / compressedSize).toFixed(2);
    const mse = calculateMSE(originalImage, compressedData, width, height, paddedWidth, paddedHeight);
    const psnr = calculatePSNR(mse);

    const statsElement = document.getElementById(`${method}-stats`);
    statsElement.textContent = `
        Compression ratio: ${compressionRatio}:1
        MSE: ${mse.toFixed(2)}
        PSNR: ${psnr.toFixed(2)} dB
    `;

    // Add download button
    const downloadButton = document.createElement('button');
    downloadButton.textContent = `Download ${method}.dds`;
    downloadButton.className = 'download-btn';
    downloadButton.onclick = () => DDSWebHandler.downloadDDS(compressedData, width, height, `${method}.dds`);
    statsElement.appendChild(downloadButton);

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
}