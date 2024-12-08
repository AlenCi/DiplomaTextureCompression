// main.js
import { GPUSetup } from './gpu-setup.js';
import { displayOriginalImage, clearResults } from './visualization.js';
import { FileHandler } from './file-handler.js';
import { createTexture, createUniformBuffer, setupCompression, executeCompression } from './gpu-helpers.js';
import { displayCompressionResults } from './stats-display.js';
import { DDSHandler } from '../shared/dds-handler.js';
import { decompressAndVisualize } from './visualization.js';
let gpuSetup, originalImage;

async function init() {
    gpuSetup = new GPUSetup();
    await gpuSetup.init();

    new FileHandler((image) => {
        originalImage = image;
        clearResults();
        displayOriginalImage(originalImage);
    });

    document.getElementById('compress-btn').addEventListener('click', compressAllMethods);
    document.getElementById('dds-upload').addEventListener('change', handleDDSUpload);
}

async function handleDDSUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        console.log("Loading DDS file...");
        const ddsData = await DDSHandler.loadDDS(file);
        
        // Create a new section for the decompressed image
        const container = document.createElement('div');
        container.className = 'compression-method';
        
        const title = document.createElement('h3');
        title.textContent = 'Decompressed DDS';
        container.appendChild(title);

        const canvas = document.createElement('canvas');
        canvas.id = 'dds-decompressed';
        container.appendChild(canvas);

        // Add it to the page
        document.getElementById('compression-container').appendChild(container);

        // Decompress and display
        decompressAndVisualize(
            ddsData.compressedData,
            ddsData.width,
            ddsData.height,
            Math.ceil(ddsData.width / 4) * 4,
            Math.ceil(ddsData.height / 4) * 4,
            'dds-decompressed'
        );

        console.log("DDS decompression complete");
    } catch (error) {
        console.error("Error loading DDS:", error);
        alert(`Error loading DDS file: ${error.message}`);
    }
}


async function compressAllMethods() {
    if (!originalImage) return;

    clearResults();

    const methods = ['pca', 'basic', 'random','cluster'];
    const iterations = parseInt(document.getElementById('iterations').value);

    displayOriginalImage(originalImage);

    for (const method of methods) {
        await compressImageWebGPU(method, iterations);
    }
}

async function compressImageWebGPU(method, iterations) {
    const device = gpuSetup.getDevice();
    const { width, height } = originalImage;
    const paddedWidth = Math.ceil(width / 4) * 4;
    const paddedHeight = Math.ceil(height / 4) * 4;
    const dimensions = { width, height, paddedWidth, paddedHeight };

    const texture = createTexture(device, paddedWidth, paddedHeight, originalImage);
    const uniformBuffer = createUniformBuffer(device, method, iterations);
    
    const { compressedBuffer, bindGroup, compressedSize } = setupCompression(
        device,
        gpuSetup.getBindGroupLayout(),
        paddedWidth,
        paddedHeight,
        texture,
        uniformBuffer
    );

    const { compressedData, gpuReadBuffer } = await executeCompression(
        device,
        gpuSetup.getPipeline(method),
        bindGroup,
        compressedBuffer,
        width,
        height,
        compressedSize
    );

    

    displayCompressionResults(method, originalImage, compressedData, dimensions, compressedSize);
    gpuReadBuffer.unmap();
}


init();