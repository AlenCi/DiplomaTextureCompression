// test/scripts/run_compression_test.js
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { CompressionCore } from "../../shared/compression-core.js";
import { CompressionHandler } from "../../shared/compression-handler.js";
import { DDSHandler } from "../../shared/dds-handler.js";
// import { DecompressionHandler } from "../../shared/decompression-handler.js";
// import { ImageQualityMetrics } from "../../shared/image-quality-metrics.js";

const COMPRESSONATOR_PATH = "C:\\Compressonator_4.5.52\\bin\\CLI\\compressonatorcli.exe";
const NVCOMPRESS_PATH = "C:\\Program Files\\NVIDIA Corporation\\NVIDIA Texture Tools\\nvcompress.exe";

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
        this.currentImagePath = null;
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

    async runImageMetrics(originalPath, compressedPath) {
        // Run SSIM
        const ssimCmd = [
            "pyiqa",
            "ssim",
            "-t", originalPath,
            "-r", compressedPath
        ];

        // Run PSNR
        const psnrCmd = [
            "pyiqa",
            "psnr",
            "-t", originalPath,
            "-r", compressedPath
        ];

        const metrics = {
            ssim: 0.0,
            psnr: 0.0
        };

        // Run SSIM measurement
        const ssimProcess = new Deno.Command(ssimCmd[0], {
            args: ssimCmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });

        const ssimResult = await ssimProcess.output();
        if (ssimResult.code !== 0) {
            const err = new TextDecoder().decode(ssimResult.stderr);
            console.error("pyiqa SSIM error:", err);
            throw new Error(`pyiqa SSIM failed with code ${ssimResult.code}`);
        }

        const ssimOutput = new TextDecoder().decode(ssimResult.stdout);
        const ssimMatch = ssimOutput.match(/ssim.*?\b(\d+(\.\d+)?)/i);
        if (ssimMatch) {
            metrics.ssim = parseFloat(ssimMatch[1]);
        } else {
            console.warn("Could not parse SSIM from pyiqa output:", ssimOutput);
        }

        // Run PSNR measurement
        const psnrProcess = new Deno.Command(psnrCmd[0], {
            args: psnrCmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });

        const psnrResult = await psnrProcess.output();
        if (psnrResult.code !== 0) {
            const err = new TextDecoder().decode(psnrResult.stderr);
            console.error("pyiqa PSNR error:", err);
            throw new Error(`pyiqa PSNR failed with code ${psnrResult.code}`);
        }

        const psnrOutput = new TextDecoder().decode(psnrResult.stdout);
        const psnrMatch = psnrOutput.match(/psnr.*?\b(\d+(\.\d+)?)/i);
        if (psnrMatch) {
            metrics.psnr = parseFloat(psnrMatch[1]);
        } else {
            console.warn("Could not parse PSNR from pyiqa output:", psnrOutput);
        }

        return metrics;
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
            const outputDDS = join(
                this.compressedDir, 
                `${filename}_${config.method}_${
                    Object.entries(config.parameters || {})
                        .map(([k,v]) => `${k}${v}`)
                        .join('_')
                }.dds`
            );
            console.log("Writing dds");

            await DDSHandler.writeDDS(outputDDS, result.width, result.height, result.compressedData);

            console.log("Got dds");

            const metrics = await this.runImageMetrics(this.currentImagePath, outputDDS);

            return {
                method: config.method,
                parameters: config.parameters,
                metrics: {
                    compressionTime: endTime - startTime,
                    compressedSize: result.compressedData.byteLength,
                    ssim: metrics.ssim,
                    psnr: metrics.psnr
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
    
        const metrics = await this.runImageMetrics(this.currentImagePath, outputPath);

        return {
            method: "compressonator",
            parameters: config,
            metrics: {
                compressionTime: endTime - startTime,
                compressedSize: (await Deno.stat(outputPath)).size,
                ssim: metrics.ssim,
                psnr: metrics.psnr
            }
        };
    }

    async runNVCompress(config = {}) {

        const filename = this.currentImagePath.split(/[\/\\]/).pop();
        const outputPath = join(
            this.compressedDir,
            `${filename}_nvcompress${
                config.fast ? '_fast' : ''
            }.dds`
        );

        const cmd = [NVCOMPRESS_PATH];
        
        if (config.fast) {
            cmd.push("-fast");
        } else if (config.highest) {
            cmd.push("-highest");
        } 

        cmd.push("-bc1");

        // cmd.push("-color");

        cmd.push(this.currentImagePath);
        cmd.push(outputPath);

        const startTime = performance.now();
        
        const process = new Deno.Command(cmd[0], {
            args: cmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });

        const { code, stdout, stderr } = await process.output();
        const endTime = performance.now();

        if (code !== 0) {
            const errorOutput = new TextDecoder().decode(stderr);
            console.error("nvcompress stderr:", errorOutput);
            throw new Error(`nvcompress failed with code ${code}`);
        }

        const metrics = await this.runImageMetrics(this.currentImagePath, outputPath);

        return {
            method: "nvcompress",
            parameters: config,
            metrics: {
                compressionTime: endTime - startTime,
                compressedSize: (await Deno.stat(outputPath)).size,
                ssim: metrics.ssim,
                psnr: metrics.psnr
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
            { method: 'pca', parameters: { dither: false}},
            { method: 'cluster', parameters: { dither: false}},
            { method: 'basic', parameters: { dither: false}},
        ];

        const compressonatorConfigs = [
            { useGPU: false },
            { useGPU: true },
            { useGPU: true, refineSteps: 2 }
        ];

        const nvcompressConfigs = [
            { fast: true },
            { highest: true }
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

             // Test Nvidia
            for (const config of nvcompressConfigs) {
                try {
                    const result = await this.runNVCompress(config);
                    imageResults.push(result);
                } catch (error) {
                    console.error(`Error with NV Compress:`, error);
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
        
        // Track totals for averaging
        const methodAverages = new Map();
        const methodCounts = new Map();
        
        // Process results and collect totals
        for (const imageResults of results) {
            console.log(`\nResults for ${imageResults.image}:`);
            for (const result of imageResults.results) {
                const methodKey = JSON.stringify({
                    method: result.method,
                    parameters: result.parameters
                });
                
                if (!methodAverages.has(methodKey)) {
                    methodAverages.set(methodKey, {
                        ssim: 0,
                        psnr: 0,
                        time: 0,
                        size: 0
                    });
                    methodCounts.set(methodKey, 0);
                }
                
                const averages = methodAverages.get(methodKey);
                averages.ssim += result.metrics.ssim;
                averages.psnr += result.metrics.psnr;
                averages.time += result.metrics.compressionTime;
                averages.size += result.metrics.compressedSize;
                methodCounts.set(methodKey, methodCounts.get(methodKey) + 1);
                
                console.log(`\n${result.method}:`);
                console.log("Parameters:", result.parameters);
                console.log("Metrics:", {
                    SSIM: result.metrics.ssim.toFixed(4),
                    PSNR: result.metrics.psnr.toFixed(4),
                    "Time (ms)": result.metrics.compressionTime.toFixed(0),
                    "Size (bytes)": result.metrics.compressedSize
                });
            }
        }
        
        // Calculate averages and prepare for JSON
        const averagesForJson = [];
        for (const [methodKey, totals] of methodAverages) {
            const count = methodCounts.get(methodKey);
            const { method, parameters } = JSON.parse(methodKey);
            
            const averageMetrics = {
                ssim: totals.ssim / count,
                psnr: totals.psnr / count,
                compressionTime: totals.time / count,
                compressedSize: Math.round(totals.size / count)
            };
            
            averagesForJson.push({
                method,
                parameters,
                metrics: averageMetrics
            });
            
            // Console output
            console.log(`\n${method}:`);
            console.log("Parameters:", parameters);
            console.log("Average Metrics:", {
                SSIM: averageMetrics.ssim.toFixed(4),
                PSNR: averageMetrics.psnr.toFixed(4),
                "Time (ms)": averageMetrics.compressionTime.toFixed(0),
                "Size (bytes)": averageMetrics.compressedSize
            });
        }
        
        // Prepare final results object with both individual results and averages
        const finalResults = {
            timestamp: new Date().toISOString(),
            individualResults: results,
            averages: averagesForJson
        };
        
        // Write to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await Deno.writeTextFile(
            join(tester.metricsDir, `results_${timestamp}.json`),
            JSON.stringify(finalResults, null, 2)
        );

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
