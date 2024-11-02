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