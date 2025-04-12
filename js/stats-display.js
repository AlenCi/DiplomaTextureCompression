// stats-display.js
import { decompressAndVisualize } from './visualization.js';
import { DDSHandler } from '../shared/dds-handler.js';

export function displayCompressionResults(method, originalImage, compressedData, dimensions, compressedSize) {
    const { width, height, paddedWidth, paddedHeight } = dimensions;
    
  
    const statsElement = document.getElementById(`${method}-stats`);
  

    // Add download button
    const downloadButton = document.createElement('button');
    downloadButton.textContent = `Download ${method}.dds`;
    downloadButton.className = 'download-btn';
    downloadButton.onclick = () => DDSHandler.downloadDDS(compressedData, width, height, `${method}.dds`);
    statsElement.appendChild(downloadButton);

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
}