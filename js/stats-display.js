// stats-display.js
import { calculateMSE, calculatePSNR, calculateSSIM  } from './compression-utils.js';
import { decompressAndVisualize } from './visualization.js';
import { DDSHandler } from '../shared/dds-handler.js';

export function displayCompressionResults(method, originalImage, compressedData, dimensions, compressedSize) {
    const { width, height, paddedWidth, paddedHeight } = dimensions;
    
    const compressionRatio = (width * height * 4 / compressedSize).toFixed(2);
    const mse = calculateMSE(originalImage, compressedData, width, height, paddedWidth, paddedHeight);
    const psnr = calculatePSNR(mse);
    const ssim = calculateSSIM(originalImage, compressedData, width, height, paddedWidth, paddedHeight);

    const statsElement = document.getElementById(`${method}-stats`);
    statsElement.textContent = `
        Compression ratio: ${compressionRatio}:1
        MSE: ${mse.toFixed(2)}
        PSNR: ${psnr.toFixed(2)} dB
        SSIM: ${ssim.toFixed(2)}
   
    `;

    // Add download button
    const downloadButton = document.createElement('button');
    downloadButton.textContent = `Download ${method}.dds`;
    downloadButton.className = 'download-btn';
    downloadButton.onclick = () => DDSHandler.downloadDDS(compressedData, width, height, `${method}.dds`);
    statsElement.appendChild(downloadButton);

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
}