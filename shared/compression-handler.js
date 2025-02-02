// shared/compression-handler.js

import { decode as decodePng } from "https://deno.land/x/pngs/mod.ts";
import { Image } from "https://deno.land/x/imagescript/mod.ts";

export class CompressionHandler {
    constructor(device, compressionCore) {
        this.device = device;
        this.compressionCore = compressionCore;
        console.log("CompressionHandler initialized with device and core");
    }


async loadImage(path) {
    try {
        console.log("\n=== Loading Image ===");
        console.log("Reading file:", path);
        const fileData = await Deno.readFile(path);
        console.log("File size:", fileData.length, "bytes");
        
        const ext = path.toLowerCase().split('.').pop();
        console.log("File extension:", ext);

        let width, height, imageData;

        if (ext === 'png') {
            console.log("Decoding PNG...");
            const decoded = decodePng(fileData);
            width = decoded.width;
            height = decoded.height;
            
            // Create proper RGBA array
            imageData = new Uint8Array(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = (y * width + x) * 3; // PNG is RGB
                    const dstIdx = (y * width + x) * 4; // We want RGBA
                    imageData[dstIdx] = decoded.image[srcIdx];     // R
                    imageData[dstIdx + 1] = decoded.image[srcIdx + 1]; // G
                    imageData[dstIdx + 2] = decoded.image[srcIdx + 2]; // B
                    imageData[dstIdx + 3] = 255;  // A (fully opaque)
                }
            }
            console.log("PNG decoded successfully");
        }else {
            console.log("Decoding image using ImageScript...");
            const image = await Image.decode(fileData);
            width = image.width;
            height = image.height;
            
            imageData = new Uint8Array(width * height * 4);
            console.log("Converting to RGBA format...");
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const pixel = image.getRGBAAt(x + 1, y + 1);
                    const i = (y * width + x) * 4;
                    imageData[i] = pixel[0];     // R
                    imageData[i + 1] = pixel[1]; // G
                    imageData[i + 2] = pixel[2]; // B
                    imageData[i + 3] = pixel[3]; // A
                }
            }
            console.log("Image conversion complete");
        }


        // console.log("Verifying image data:", {
        //     width,
        //     height,
        //     actualDataLength: imageData.length,
        //     calculatedPixels: width * height,
        //     bytesPerPixel: 4
        // });

        // Remove strict validation and trust the PNG decoder
        if (!imageData || !width || !height) {
            throw new Error("Invalid image data - missing required properties");
        }

        console.log("Image loaded successfully:", {
            width,
            height,
            dataLength: imageData.length,
            bytesPerPixel: 4,
            totalPixels: width * height
        });

        // Log sample of pixel data for verification
        const samplePixels = [];
        for (let i = 0; i < Math.min(4, imageData.length/4); i++) {
            samplePixels.push({
                index: i,
                rgba: [
                    imageData[i*4],
                    imageData[i*4 + 1],
                    imageData[i*4 + 2],
                    imageData[i*4 + 3]
                ]
            });
        }
        console.log("Sample of first few pixels:", samplePixels);
        
        return { width, height, data: imageData };
    } catch (error) {
        console.error("Error loading image:", error);
        throw error;
    }
}
    createInputTexture(imageData, width, height) {
        try {
            console.log("\n=== Creating Input Texture ===");
            
            // Calculate dimensions
            const paddedWidth = Math.ceil(width / 4) * 4;
            const paddedHeight = Math.ceil(height / 4) * 4;
            
            console.log("Texture dimensions:", {
                original: { width, height },
                padded: { width: paddedWidth, height: paddedHeight },
                padding: {
                    rightPadding: paddedWidth - width,
                    bottomPadding: paddedHeight - height
                }
            });

            // Create texture
            const texture = this.device.createTexture({
                size: [paddedWidth, paddedHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | 
                       GPUTextureUsage.COPY_DST | 
                       GPUTextureUsage.RENDER_ATTACHMENT
            });

            // Calculate aligned buffer sizes
            const bytesPerPixel = 4;
            const unalignedBytesPerRow = paddedWidth * bytesPerPixel;
            const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;

            console.log("Buffer alignment:", {
                unalignedBytesPerRow,
                alignedBytesPerRow,
                alignment: alignedBytesPerRow - unalignedBytesPerRow
            });

            // Create aligned data buffer
            const alignedData = new Uint8Array(alignedBytesPerRow * paddedHeight);
            console.log("Created aligned buffer of size:", alignedData.length);

            // Copy and pad the image data
            console.log("Copying image data with padding...");
            for (let y = 0; y < paddedHeight; y++) {
                for (let x = 0; x < paddedWidth; x++) {
                    const dstPos = y * alignedBytesPerRow + x * bytesPerPixel;
                    
                    if (x < width && y < height) {
                        // Copy actual image data
                        const srcPos = (y * width + x) * bytesPerPixel;
                        alignedData[dstPos] = imageData[srcPos];        // R
                        alignedData[dstPos + 1] = imageData[srcPos + 1];// G
                        alignedData[dstPos + 2] = imageData[srcPos + 2];// B
                        alignedData[dstPos + 3] = imageData[srcPos + 3];// A
                    } else {
                        // Fill padding with transparent black
                        alignedData[dstPos] = 0;     // R
                        alignedData[dstPos + 1] = 0; // G
                        alignedData[dstPos + 2] = 0; // B
                        alignedData[dstPos + 3] = 0; // A
                    }
                }
            }

            // Verify data alignment
            if (alignedData.length % 256 !== 0) {
                console.warn("Warning: Final buffer size is not 256-byte aligned");
            }

            // Write to texture
            console.log("Writing to texture...");
            this.device.queue.writeTexture(
                { texture },
                alignedData,
                { 
                    bytesPerRow: alignedBytesPerRow,
                    rowsPerImage: paddedHeight
                },
                { 
                    width: paddedWidth,
                    height: paddedHeight
                }
            );

            return { texture, paddedWidth, paddedHeight };
        } catch (error) {
            console.error("Error creating texture:", error);
            throw error;
        }
    }

    async compressImage(pathOrData, method, parameters = {}) {
        try {
            console.log("\n=== Starting Image Compression ===");
            console.log("Compression method:", method);
            console.log("parameters:", parameters);

            // Load or use provided image data
            let width, height, data;
            if (typeof pathOrData === 'string') {
                const imageData = await this.loadImage(pathOrData);
                width = imageData.width;
                height = imageData.height;
                data = imageData.data;
            } else {
                width = pathOrData.width;
                height = pathOrData.height;
                data = pathOrData.data;
            }

            // Create input texture
            const { texture, paddedWidth, paddedHeight } = 
                this.createInputTexture(data, width, height);

            // Calculate compression parameters
            const workgroupSize = 8;
            const blocksWide = Math.ceil(paddedWidth / 4);
            const blocksHigh = Math.ceil(paddedHeight / 4);
            const dispatchWidth = Math.ceil(blocksWide / workgroupSize);
            const dispatchHeight = Math.ceil(blocksHigh / workgroupSize);

            console.log("Compression parameters:", {
                originalDimensions: { width, height },
                paddedDimensions: { width: paddedWidth, height: paddedHeight },
                blocks: { wide: blocksWide, high: blocksHigh },
                dispatch: { width: dispatchWidth, height: dispatchHeight },
                workgroupSize
            });

            // Create uniform buffer
            const uniformBuffer = this.device.createBuffer({
                size: 16, // 4 x u32
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            console.log(method)


        const uniformData = new Uint32Array([
            parameters.iterations || 0, 
            parameters.useMSE || 0,
            parameters.useDither || 0,
            parameters.useRefinement || 0
        ]);
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            // Create output buffer
            const compressedSize = blocksWide * blocksHigh * 8; // 8 bytes per block
            console.log("Output buffer size:", compressedSize, "bytes");

            const compressedBuffer = this.device.createBuffer({
                size: compressedSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });

            // Create bind group
            const bindGroup = this.device.createBindGroup({
                layout: this.compressionCore.getBindGroupLayout(),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: texture.createView() },
                    { binding: 2, resource: { buffer: compressedBuffer } }
                ]
            });

            // Execute compression
            console.log("Executing compression pipeline...");
            const commandEncoder = this.device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.compressionCore.getPipeline(method));
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(dispatchWidth, dispatchHeight);
            computePass.end();

            // Read results
            const gpuReadBuffer = this.device.createBuffer({
                size: compressedSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            commandEncoder.copyBufferToBuffer(
                compressedBuffer, 0, 
                gpuReadBuffer, 0, 
                compressedSize
            );

            this.device.queue.submit([commandEncoder.finish()]);

            // Wait for GPU completion
            console.log("Waiting for GPU completion...");
            await gpuReadBuffer.mapAsync(GPUMapMode.READ);
            
            // Get compressed data
            const compressedData = new Uint32Array(gpuReadBuffer.getMappedRange());
            
            // Analyze compressed data
            const nonZeroCount = Array.from(compressedData).filter(x => x !== 0).length;
            console.log("Compressed data analysis:", {
                totalBlocks: blocksWide * blocksHigh,
                dataLength: compressedData.length,
                nonZeroElements: nonZeroCount,
                firstBlock: Array.from(compressedData.slice(0, 2)),
                lastBlock: Array.from(compressedData.slice(-2))
            });

            // Create final data copy
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
            console.error("Compression error:", error);
            throw error;
        }
    }
}