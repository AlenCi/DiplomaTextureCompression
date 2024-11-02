// main.js
import { calculateMSE, calculatePSNR, getDecompressedColor, color565To888 } from './compression-utils.js';
import { GPUSetup } from './gpu-setup.js';
import { displayOriginalImage, decompressAndVisualize, clearResults } from './visualization.js';
import { FileHandler } from './file-handler.js';
import { createTexture, createUniformBuffer } from './gpu-helpers.js';

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

    const compressedSize = (paddedWidth / 4) * (paddedHeight / 4) * 8;
    const compressedBuffer = device.createBuffer({
        size: compressedSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const bindGroup = device.createBindGroup({
        layout: gpuSetup.getBindGroupLayout(),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: compressedBuffer } }
        ]
    });

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(gpuSetup.getPipeline(method));
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(Math.ceil(width / 32), Math.ceil(height / 32));
    computePass.end();

    const gpuReadBuffer = device.createBuffer({
        size: compressedSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    commandEncoder.copyBufferToBuffer(compressedBuffer, 0, gpuReadBuffer, 0, compressedSize);
    device.queue.submit([commandEncoder.finish()]);

    await gpuReadBuffer.mapAsync(GPUMapMode.READ);
    const compressedData = new Uint32Array(gpuReadBuffer.getMappedRange());

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