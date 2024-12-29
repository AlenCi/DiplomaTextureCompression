// test/scripts/run_compression_test.js
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { CompressionCore } from "../../shared/compression-core.js";
import { CompressionHandler } from "../../shared/compression-handler.js";
import { DDSHandler } from "../../shared/dds-handler.js";
import { DecompressionHandler } from "../../shared/decompression-handler.js";
import { ImageQualityMetrics } from "../../shared/image-quality-metrics.js";

const COMPRESSONATOR_PATH = "C:\\Compressonator_4.5.52\\bin\\CLI\\compressonatorcli.exe";

class CompressionTester {
    constructor() {
        this.testDir = dirname(fromFileUrl(import.meta.url));
        this.imagesDir = join(this.testDir, '..', 'images');
        this.resultsDir = join(this.testDir, '..', 'results');
        this.compressedDir = join(this.resultsDir, 'compressed');
        this.metricsDir = join(this.resultsDir, 'metrics');
        this.device = null;
        this.compressionCore = null;
        this.compressionHandler = null;
        this.currentImageData = null;
    }

    async init() {

        await ensureDir(this.resultsDir);
        await ensureDir(this.compressedDir);
        await ensureDir(this.metricsDir);

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU not supported");
        }
        
        this.device = await adapter.requestDevice();
        const shaderSources = await this.loadShaders();
        this.compressionCore = new CompressionCore(this.device);
        await this.compressionCore.init(shaderSources);
        this.compressionHandler = new CompressionHandler(this.device, this.compressionCore);
    }

    async cleanup() {
        if (this.device) {
            this.device.destroy();
        }
    }

    async loadShaders() {
        const shadersDir = join(this.testDir, '..', '..', 'shared', 'shaders');
        return {
            pca: await Deno.readTextFile(join(shadersDir, 'bc1-compress-pca.wgsl')),
            basic: await Deno.readTextFile(join(shadersDir, 'bc1-compress-basic.wgsl')),
            random: await Deno.readTextFile(join(shadersDir, 'bc1-compress-random.wgsl')),
            cluster: await Deno.readTextFile(join(shadersDir, 'bc1-compress-cluster.wgsl'))
        };
    }

    async calculateMetrics(compressedData, width, height) {
        const decompressedPixels = DecompressionHandler.decompress(
            compressedData,
            width,
            height,
            Math.ceil(width / 4) * 4,
            Math.ceil(height / 4) * 4
        );
        console.log("Got decompressed")

        const originalData = this.currentImageData.data;
        let mse = 0;
        const pixelCount = width * height;

        // Batch process pixels for better performance
        const batchSize = 1024;
        for (let batch = 0; batch < pixelCount * 4; batch += batchSize * 4) {
            const endBatch = Math.min(batch + batchSize * 4, pixelCount * 4);
            for (let i = batch; i < endBatch; i += 4) {
                const origR = originalData[i] / 255.0;
                const origG = originalData[i + 1] / 255.0;
                const origB = originalData[i + 2] / 255.0;
                
                const decompR = decompressedPixels[i] / 255.0;
                const decompG = decompressedPixels[i + 1] / 255.0;
                const decompB = decompressedPixels[i + 2] / 255.0;

                const diffR = origR - decompR;
                const diffG = origG - decompG;
                const diffB = origB - decompB;

                mse += diffR * diffR + diffG * diffG + diffB * diffB;
            }
        }

        mse /= (pixelCount * 3);
        const psnr = mse > 0 ? -10.0 * Math.log10(mse) : 100.0;
        console.log("Got mse stuff")

        const ssim = ImageQualityMetrics.calculateSSIM(
            originalData,
            decompressedPixels,
            width,
            height
        );

        return { 
            ssim, 
            mse: mse * 255 * 255,
            psnr 
        };
    }

    async runOurCompressor(config) {
        console.log(`Running ${config.method} with parameters:`, config.parameters);
        
        const startTime = performance.now();
        
        try {
            const result = await this.compressionHandler.compressImage(
                this.currentImageData,  
                config.method,
                config.parameters
            );
            const endTime = performance.now();

            const filename = this.currentImagePath.split(/[\/\\]/).pop();
            const outputPath = join(this.compressedDir, 
                `${filename}_${config.method}_${
                    Object.entries(config.parameters || {}).map(([k,v]) => `${k}${v}`).join('_')
                }.dds`);
            console.log("Writing dds")

            await DDSHandler.writeDDS(outputPath, result.width, result.height, result.compressedData);

            console.log("Got dds")
            // Calculate metrics before releasing GPU resources
            const metrics = await this.calculateMetrics(
                result.compressedData,
                result.width,
                result.height
            );
            return {
                method: config.method,
                parameters: config.parameters,
                metrics: {
                    compressionTime: endTime - startTime,
                    compressedSize: result.compressedSize,
                    ...metrics
                }
            };
        } catch (error) {
            console.error(`Error compressing with ${config.method}:`, error);
            throw error;
        }
    }

    async runCompressonator(config = {}) {
        const filename = this.currentImagePath.split(/[\/\\]/).pop();
        const outputPath = join(this.compressedDir, 
            `${filename}_compressonator${
                config.refineSteps ? `_refine${config.refineSteps}` : ''
            }${config.useGPU ? '_gpu' : ''}.dds`);
        const logPath = join(this.metricsDir, `compressonator_${Date.now()}.txt`);
        
        const startTime = performance.now();
        
        const cmd = [
            COMPRESSONATOR_PATH,
            "-fd", "BC1",
        ];
    
        if (config.useGPU) {
            cmd.push("-EncodeWith", "GPU");
        }
    
        cmd.push(
            this.currentImagePath,
            outputPath,
            "-log",
            "-logfile", logPath
        );
    
        if (config.refineSteps) {
            cmd.push("-RefineSteps", config.refineSteps.toString());
        }
    
        const process = new Deno.Command(cmd[0], {
            args: cmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });
        
        const { code, stdout, stderr } = await process.output();
        const endTime = performance.now();
    
        if (code !== 0) {
            const errorOutput = new TextDecoder().decode(stderr);
            console.error("Compressonator stderr:", errorOutput);
            throw new Error(`Compressonator failed with code ${code}`);
        }
    
        const ddsData = await DDSHandler.readDDS(outputPath);
        const metrics = await this.calculateMetrics(
            ddsData.compressedData,
            ddsData.width,
            ddsData.height
        );
    
        return {
            method: "compressonator",
            parameters: config,
            metrics: {
                compressionTime: endTime - startTime,
                compressedSize: (await Deno.stat(outputPath)).size,
                ...metrics
            }
        };
    }

    async runTestSuite() {
        const testImages = [];
        for await (const entry of Deno.readDir(this.imagesDir)) {
            if (entry.isFile && (entry.name.endsWith('.png') || entry.name.endsWith('.jpg'))) {
                testImages.push(join(this.imagesDir, entry.name));
            }
        }

        const configs = [
            { method: 'pca', parameters: { dither: false, powerIter: 8 }},
            { method: 'cluster', parameters: { dither: false, powerIter: 8 }},
            { method: 'basic', parameters: { dither: false, powerIter: 8 }},
        ];

        const compressonatorConfigs = [
            { useGPU: false },
            { useGPU: true },
            { useGPU: true, refineSteps: 2 }
        ];

        const allResults = [];
        
        for (const imagePath of testImages) {
            console.log(`\nTesting image: ${imagePath}`);
            
            // Load image once per test image
            this.currentImagePath = imagePath;
            this.currentImageData = await this.compressionHandler.loadImage(imagePath);
            
            const imageResults = [];
            
            // Test our methods
            for (const config of configs) {
                try {
                    const result = await this.runOurCompressor(config);
                    imageResults.push(result);
                } catch (error) {
                    console.error(`Error with ${config.method}:`, error);
                }
                
                // Force GPU sync and garbage collection
                await this.device.queue.onSubmittedWorkDone();
            }

            // Test Compressonator
            for (const config of compressonatorConfigs) {
                try {
                    const result = await this.runCompressonator(config);
                    imageResults.push(result);
                } catch (error) {
                    console.error(`Error with Compressonator:`, error);
                }
            }

            allResults.push({
                image: imagePath,
                results: imageResults
            });

            // Clear image data after each image is processed
            this.currentImageData = null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await Deno.writeTextFile(
            join(this.metricsDir, `results_${timestamp}.json`),
            JSON.stringify(allResults, null, 2)
        );

        return allResults;
    }
}

async function main() {
    const tester = new CompressionTester();
    try {
        await tester.init();
        const results = await tester.runTestSuite();
        
        // Print results summary
        for (const imageResults of results) {
            console.log(`\nResults for ${imageResults.image}:`);
            for (const result of imageResults.results) {
                console.log(`\n${result.method}:`);
                console.log("Parameters:", result.parameters);
                console.log("Metrics:", {
                    PSNR: result.metrics.psnr.toFixed(2),
                    MSE: result.metrics.mse.toFixed(2),
                    SSIM: result.metrics.ssim.toFixed(4),
                    "Time (ms)": result.metrics.compressionTime.toFixed(0),
                    "Size (bytes)": result.metrics.compressedSize
                });
            }
        }
    } catch (error) {
        console.error("Test failed:", error);
        throw error;
    } finally {
        await tester.cleanup();
    }
}

if (import.meta.main) {
    main();
}