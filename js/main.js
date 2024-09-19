let device, pipelines, bindGroupLayout, originalImage;

async function init() {
    const adapter = await navigator.gpu?.requestAdapter();
    device = await adapter.requestDevice();

    await setupWebGPUCompression();

    document.getElementById('image-upload').addEventListener('change', handleFileUpload);
    document.getElementById('compress-btn').addEventListener('click', compressAllMethods);
}

async function setupWebGPUCompression() {
    const shaderModules = {
        pca: await device.createShaderModule({
            code: await fetch('shaders/bc1-compress-pca.wgsl').then(res => res.text())
        }),
        basic: await device.createShaderModule({
            code: await fetch('shaders/bc1-compress-basic.wgsl').then(res => res.text())
        }),
        random: await device.createShaderModule({
            code: await fetch('shaders/bc1-compress-random.wgsl').then(res => res.text())
        })
    };

    bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
    });

    pipelines = {
        pca: createPipeline(shaderModules.pca),
        basic: createPipeline(shaderModules.basic),
        random: createPipeline(shaderModules.random)
    };
}

function createPipeline(shaderModule) {
    return device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        compute: { module: shaderModule, entryPoint: 'main' }
    });
}

async function compressAllMethods() {
    if (!originalImage) return;

    clearResults(); 

    const methods = ['pca', 'basic', 'random'];
    const iterations = parseInt(document.getElementById('iterations').value);

    displayOriginalImage();

    for (const method of methods) {
        await compressImageWebGPU(method, iterations);
    }
}

function displayOriginalImage() {
    const canvas = document.getElementById('original-canvas');
    const ctx = canvas.getContext('2d');
    
    const maxDimension = 800; 
    const scale = Math.min(1, maxDimension / Math.max(originalImage.width, originalImage.height));
    
    canvas.width = originalImage.width * scale;
    canvas.height = originalImage.height * scale;
    
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
}

async function compressImageWebGPU(method, iterations) {
    const { width, height } = originalImage;
    const paddedWidth = Math.ceil(width / 4) * 4;
    const paddedHeight = Math.ceil(height / 4) * 4;

    const texture = device.createTexture({
        size: [paddedWidth, paddedHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paddedWidth;
    tempCanvas.height = paddedHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(originalImage, 0, 0);

    device.queue.copyExternalImageToTexture(
        { source: tempCanvas },
        { texture: texture },
        [paddedWidth, paddedHeight]
    );

    let uniformBuffer;
    // TODO: make this better
    if (method === 'random') {
        uniformBuffer = device.createBuffer({
            size: 32, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([
            width, height, iterations, paddedWidth, paddedHeight
        ]));
    } else {
        uniformBuffer = device.createBuffer({
            size: 16, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([width, height, paddedWidth, paddedHeight]));
    }

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

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(pipelines[method]);
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
    const mse = calculateMSE(originalImage, compressedData, width, height,paddedWidth,paddedHeight);
    const psnr = calculatePSNR(mse);

    document.getElementById(`${method}-stats`).textContent = `
        Compression ratio: ${compressionRatio}:1
        MSE: ${mse.toFixed(2)}
        PSNR: ${psnr.toFixed(2)} dB
    `;

    decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, `${method}-canvas`);
    visualizeError(originalImage, compressedData, width, height, paddedWidth, paddedHeight, `${method}-error-canvas`);
    gpuReadBuffer.unmap();
}

function calculateMSE(original, compressed, width, height, paddedWidth, paddedHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = paddedWidth;
    canvas.height = paddedHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, paddedWidth, paddedHeight).data;
    
    let mse = 0;
    for (let y = 0; y < paddedHeight; y++) {
        for (let x = 0; x < paddedWidth; x++) {
            const i = (y * paddedWidth + x) * 4;
            const blockIndex = (Math.floor(y / 4) * (paddedWidth / 4) + Math.floor(x / 4)) * 2;
            const pixelIndex = (y % 4) * 4 + (x % 4);
            const color0 = compressed[blockIndex] & 0xFFFF;
            const color1 = compressed[blockIndex] >> 16;
            const lookupTable = compressed[blockIndex + 1];
            const colorIndex = (lookupTable >> (pixelIndex * 2)) & 0x3;
            
            const decompressedColor = getDecompressedColor(color0, color1, colorIndex);
            
            for (let j = 0; j < 3; j++) {
                const diff = originalData[i + j] - decompressedColor[j];
                mse += diff * diff;
            }
        }
    }
    
    return mse / (paddedWidth * paddedHeight * 3);
}

function calculatePSNR(mse) {
    return 10 * Math.log10(255 * 255 / mse);
}

function getDecompressedColor(color0, color1, colorIndex) {
    const c0 = color565To888(color0);
    const c1 = color565To888(color1);
    
    switch (colorIndex) {
        case 0: return c0;
        case 1: return c1;
        case 2: return c0.map((v, i) => Math.round((2 * v + c1[i]) / 3));
        case 3: return c0.map((v, i) => Math.round((v + 2 * c1[i]) / 3));
    }
}

function color565To888(color) {
    const r = (color >> 11) & 0x1F;
    const g = (color >> 5) & 0x3F;
    const b = color & 0x1F;
    return [
        (r << 3) | (r >> 2),
        (g << 2) | (g >> 4),
        (b << 3) | (b >> 2)
    ];
}

function decompressAndVisualize(compressedData, width, height, paddedWidth, paddedHeight, canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    
    const maxDimension = 1200; 
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    const imageData = ctx.createImageData(paddedWidth, paddedHeight);

    for (let blockY = 0; blockY < paddedHeight / 4; blockY++) {
        for (let blockX = 0; blockX < paddedWidth / 4; blockX++) {
            const blockIndex = (blockY * (paddedWidth / 4) + blockX) * 2;
            const color0 = compressedData[blockIndex] & 0xFFFF;
            const color1 = compressedData[blockIndex] >> 16;
            const lookupTable = compressedData[blockIndex + 1];
            
            const palette = [
                color565To888(color0),
                color565To888(color1),
                color565To888(color0).map((v, i) => Math.round((2 * v + color565To888(color1)[i]) / 3)),
                color565To888(color0).map((v, i) => Math.round((v + 2 * color565To888(color1)[i]) / 3))
            ];
            
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const colorIndex = (lookupTable >> ((y * 4 + x) * 2)) & 0x3;
                    const color = palette[colorIndex];
                    
                    const imageX = blockX * 4 + x;
                    const imageY = blockY * 4 + y;
                    const i = (imageY * paddedWidth + imageX) * 4;
                    imageData.data.set(color, i);
                    imageData.data[i + 3] = 255;
                }
            }
        }
    }
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paddedWidth;
    tempCanvas.height = paddedHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
}

function clearResults() {
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    const stats = document.querySelectorAll('.stats');
    stats.forEach(stat => {
        stat.textContent = '';
    });
}

function visualizeError(original, compressed, width, height, paddedWidth, paddedHeight, canvasId) {
    // TODO
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            originalImage = new Image();
            originalImage.onload = function() {
                clearResults();
                displayOriginalImage();
            }
            originalImage.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}
init();