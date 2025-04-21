import { GPUSetup } from './gpu-setup.js';
import { displayOriginalImage, clearResults } from './visualization.js';
import { FileHandler } from './file-handler.js';
import { createTexture, createUniformBuffer, setupCompression, executeCompression } from './gpu-helpers.js';
import { displayCompressionResults } from './stats-display.js';
import { DDSHandler } from '../shared/dds-handler.js';
import { decompressAndVisualize } from './visualization.js';
let gpuSetup, originalImage;

document.addEventListener('DOMContentLoaded', () => {
    // Check for WebGPU support
    if (!navigator.gpu) {
        const warningDiv = document.getElementById('webgpu-warning');
        warningDiv.style.display = 'block';
    }
});

async function init() {
    gpuSetup = new GPUSetup();
    await gpuSetup.init();

    new FileHandler((image) => {
        originalImage = image;
        clearResults();
        displayOriginalImage(originalImage);
    });

    document.getElementById('compress-btn').addEventListener('click', async () => {
        // Existing compression logic
        await compressAllMethods();
    
        // Make stats visible
        document.querySelectorAll('.stats').forEach(stat => {
            stat.style.display = 'block';
        });
    });
    document.getElementById('dds-upload').addEventListener('change', handleDDSUpload);
}

async function handleDDSUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        console.log("Loading DDS file...");
        const ddsData = await DDSHandler.loadDDS(file);
        
        // Use the static canvas element
        const canvas = document.getElementById('dds-decompressed');
        
        // Show the DDS section
        document.getElementById('dds-section').style.display = 'block';
        
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

    const methods = ['pca', 'basic', 'random', 'cluster'];
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
    
    const useMSE = document.getElementById('use-mse')?.checked ? 1 : 0;
    const useDither = document.getElementById('use-dither')?.checked ? 1 : 0;
    
    const uniformBuffer = createUniformBuffer(device, method, iterations, useMSE, useDither);
    
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