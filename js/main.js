// main.js
import { calculateMSE, calculatePSNR, getDecompressedColor, color565To888 } from './compression-utils.js';
import { GPUSetup } from './gpu-setup.js';
import { displayOriginalImage, decompressAndVisualize, clearResults } from './visualization.js';
import { FileHandler } from './file-handler.js';
import { createTexture, createUniformBuffer, setupCompression, executeCompression } from './gpu-helpers.js';

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

    const texture = createTexture(device, width, height, paddedWidth, paddedHeight, originalImage);
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

    const compressionRatio = (width * height * 4 / compressedSize).toFixed(2);
    const mse = calculateMSE(originalImage, compressedData, width, height, paddedWidth, paddedHeight);
    const psnr = calculatePSNR(mse);

    document.getElementById(`${method}-stats`).textContent = `
        Compression ratio: ${compressionRatio}:1
        MSE: ${mse.toFixed(2)}
        PSNR: ${psnr.toFixed(2)} dB
    `;

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
    gpuReadBuffer.unmap();
}

init();