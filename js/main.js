// main.js
import { GPUSetup } from './gpu-setup.js';
import { displayOriginalImage, clearResults } from './visualization.js';
import { FileHandler } from './file-handler.js';
import { createTexture, createUniformBuffer, setupCompression, executeCompression } from './gpu-helpers.js';
import { displayCompressionResults } from './stats-display.js';
import { DDSImportHandler } from '../shared/dds-import-handler.js';
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
        const ddsData = await DDSImportHandler.loadDDS(file);
        
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

    const methods = ['pca', 'basic', 'random'];
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


function downloadDDS(compressedData, width, height, filename) {
    // DDS constants
    const DDS_MAGIC = 0x20534444;
    const DDSD_CAPS = 0x1;
    const DDSD_HEIGHT = 0x2;
    const DDSD_WIDTH = 0x4;
    const DDSD_PIXELFORMAT = 0x1000;
    const DDSD_LINEARSIZE = 0x80000;
    const DDPF_FOURCC = 0x4;
    const FOURCC_DXT1 = 0x31545844;
    const DDSCAPS_TEXTURE = 0x1000;

    const headerSize = 128;
    const dataSize = compressedData.byteLength;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint32(offset, DDS_MAGIC, true); offset += 4;
    view.setUint32(offset, 124, true); offset += 4;
    
    const flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE;
    view.setUint32(offset, flags, true); offset += 4;
    
    view.setUint32(offset, height, true); offset += 4;
    view.setUint32(offset, width, true); offset += 4;
    view.setUint32(offset, Math.max(1, Math.floor((width + 3) / 4) * 8), true); offset += 4;
    
    // depth, mipmapcount
    offset += 8;
    
    // reserved1[11]
    offset += 44;
    
    // pixel format
    view.setUint32(offset, 32, true); offset += 4;
    view.setUint32(offset, DDPF_FOURCC, true); offset += 4;
    view.setUint32(offset, FOURCC_DXT1, true); offset += 4;
    
    // RGB bit count and masks
    offset += 20;
    
    // caps
    view.setUint32(offset, DDSCAPS_TEXTURE, true); offset += 4;
    
    // caps2, caps3, caps4, reserved2
    offset += 16;

    // Copy compressed data
    new Uint8Array(buffer, headerSize).set(new Uint8Array(compressedData.buffer));

    // Create and trigger download
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

init();