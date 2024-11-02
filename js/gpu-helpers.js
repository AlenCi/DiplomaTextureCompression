// gpu-helpers.js

export function createTexture(device, width, height, paddedWidth, paddedHeight, image) {
    const texture = device.createTexture({
        size: [paddedWidth, paddedHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paddedWidth;
    tempCanvas.height = paddedHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(image, 0, 0);

    device.queue.copyExternalImageToTexture(
        { source: tempCanvas },
        { texture: texture },
        [paddedWidth, paddedHeight]
    );

    return texture;
}

export function createUniformBuffer(device, method, iterations) {
    if (method === 'random') {
        const buffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(buffer, 0, new Uint32Array([iterations]));
        return buffer;
    } else {
        return device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM
        });
    }
}

export function setupCompression(device, bindGroupLayout, paddedWidth, paddedHeight, texture, uniformBuffer) {
    const compressedSize = (paddedWidth / 4) * (paddedHeight / 4) * 8;
    
    const compressedBuffer = device.createBuffer({
        size: compressedSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: compressedBuffer } }
        ]
    });

    return { compressedBuffer, bindGroup, compressedSize };
}

export async function executeCompression(device, pipeline, bindGroup, compressedBuffer, width, height, compressedSize) {
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(pipeline);
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
    
    const result = {
        compressedData,
        gpuReadBuffer
    };
    
    return result;
}