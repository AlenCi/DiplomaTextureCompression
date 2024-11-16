// shared/compression-handler.js

import { decode as decodePng } from "https://deno.land/x/pngs/mod.ts";
import { Image } from "https://deno.land/x/imagescript/mod.ts";

export class CompressionHandler {
    constructor(device, compressionCore) {
        this.device = device;
        this.compressionCore = compressionCore;
    }

    async loadImage(path) {
        try {
            console.log("Reading file:", path);
            const fileData = await Deno.readFile(path);
            console.log("File size:", fileData.length, "bytes");
            
            // Get file extension
            const ext = path.toLowerCase().split('.').pop();
            console.log("File extension:", ext);

            let width, height, imageData;

            if (ext === 'png') {
                console.log("Decoding PNG...");
                const decoded = decodePng(fileData);
                width = decoded.width;
                height = decoded.height;
                imageData = decoded.image;
            } else {
                console.log("Decoding image using ImageScript...");
                const image = await Image.decode(fileData);
                width = image.width;
                height = image.height;
                
                // Convert ImageScript format to raw RGBA
                imageData = new Uint8Array(width * height * 4);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const pixel = image.getRGBAAt(x + 1, y + 1); // ImageScript uses 1-based indexing
                        const i = (y * width + x) * 4;
                        imageData[i] = pixel[0];     // R
                        imageData[i + 1] = pixel[1]; // G
                        imageData[i + 2] = pixel[2]; // B
                        imageData[i + 3] = pixel[3]; // A
                    }
                }
            }

            console.log("Image decoded:", {
                width,
                height,
                dataLength: imageData.length
            });
            
            return {
                width,
                height,
                data: imageData
            };
        } catch (error) {
            console.error("Error loading image:", error);
            throw error;
        }
    }

    createInputTexture(imageData, width, height) {
        try {
            console.log("Creating texture for dimensions:", width, "x", height);
            const paddedWidth = Math.ceil(width / 4) * 4;
            const paddedHeight = Math.ceil(height / 4) * 4;
            console.log("Padded dimensions:", paddedWidth, "x", paddedHeight);

            const texture = this.device.createTexture({
                size: [paddedWidth, paddedHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });

            // Create padded data
            console.log("Creating padded data array...");
            const paddedData = new Uint8Array(paddedWidth * paddedHeight * 4);
            
            console.log("Copying image data...");
            // Copy original image data with padding
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcPos = (y * width + x) * 4;
                    const dstPos = (y * paddedWidth + x) * 4;
                    paddedData[dstPos] = imageData[srcPos];     // R
                    paddedData[dstPos + 1] = imageData[srcPos + 1]; // G
                    paddedData[dstPos + 2] = imageData[srcPos + 2]; // B
                    paddedData[dstPos + 3] = imageData[srcPos + 3]; // A
                }
            }

            console.log("Writing texture data...");
            this.device.queue.writeTexture(
                { texture },
                paddedData,
                { bytesPerRow: paddedWidth * 4, rowsPerImage: paddedHeight },
                { width: paddedWidth, height: paddedHeight }
            );

            return { texture, paddedWidth, paddedHeight };
        } catch (error) {
            console.error("Error creating texture:", error);
            throw error;
        }
    }

    async compressImage(path, method, iterations = 1000) {
        try {
            console.log("Starting compression for:", path);
            // Load the image
            const { width, height, data } = await this.loadImage(path);
            console.log("Image loaded successfully");
            
            // Create input texture
            const { texture, paddedWidth, paddedHeight } = this.createInputTexture(data, width, height);
            console.log("Input texture created");

            // Create uniform buffer for random method
            console.log("Creating buffers for method:", method);
            let uniformBuffer;
            if (method === 'random') {
                uniformBuffer = this.device.createBuffer({
                    size: 4,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([iterations]));
            } else {
                uniformBuffer = this.device.createBuffer({
                    size: 4,
                    usage: GPUBufferUsage.UNIFORM
                });
            }

            // Create output buffer
            const compressedSize = (paddedWidth / 4) * (paddedHeight / 4) * 8;
            console.log("Compressed size will be:", compressedSize, "bytes");
            const compressedBuffer = this.device.createBuffer({
                size: compressedSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });

            // Create bind group
            console.log("Creating bind group");
            const bindGroup = this.device.createBindGroup({
                layout: this.compressionCore.getBindGroupLayout(),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: texture.createView() },
                    { binding: 2, resource: { buffer: compressedBuffer } }
                ]
            });

            // Run compression
            console.log("Running compression pipeline");
            const commandEncoder = this.device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.compressionCore.getPipeline(method));
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(Math.ceil(width / 32), Math.ceil(height / 32));
            computePass.end();

            // Create buffer for reading results
            console.log("Creating read buffer");
            const gpuReadBuffer = this.device.createBuffer({
                size: compressedSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            commandEncoder.copyBufferToBuffer(compressedBuffer, 0, gpuReadBuffer, 0, compressedSize);
            this.device.queue.submit([commandEncoder.finish()]);

            console.log("Waiting for GPU buffer mapping");
            await gpuReadBuffer.mapAsync(GPUMapMode.READ);
            const compressedData = new Uint32Array(gpuReadBuffer.getMappedRange());

            // Create a copy of the data since we need to unmap the buffer
            console.log("Creating final data copy");
            const resultData = new Uint32Array(compressedData);
            gpuReadBuffer.unmap();

            return {
                width,
                height,
                paddedWidth,
                paddedHeight,
                compressedData: resultData,
                compressedSize
            };
        } catch (error) {
            console.error("Error in compression process:", error);
            throw error;
        }
    }
}