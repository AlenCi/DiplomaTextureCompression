// test/scripts/run_compression_test.js
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { CompressionCore } from "../../shared/compression-core.js";
import { CompressionHandler } from "../../shared/compression-handler.js";
import { DDSHandler } from "../../shared/dds-handler.js";
import { DecompressionHandler } from "../../shared/decompression-handler.js";
// import { ImageQualityMetrics } from "../../shared/image-quality-metrics.js";
import { decode as decodePng } from "https://deno.land/x/pngs/mod.ts";
const COMPRESSONATOR_PATH = "C:\\Compressonator_4.5.52\\bin\\CLI\\compressonatorcli.exe";
const NVCOMPRESS_PATH = "C:\\Program Files\\NVIDIA Corporation\\NVIDIA Texture Tools\\nvcompress.exe";
function rgbToCielab(r, g, b) {
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        console.error(`Invalid RGB input: (${r}, ${g}, ${b})`);
        return { L: 0, a: 0, b: 0 };
    }

    const linearize = (v) => {
        v = v / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };

    const rLin = linearize(r);
    const gLin = linearize(g);
    const bLin = linearize(b);

    const X = 0.4124 * rLin + 0.3576 * gLin + 0.1805 * bLin;
    const Y = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
    const Z = 0.0193 * rLin + 0.1192 * gLin + 0.9505 * bLin;

    const Xn = 0.95047;
    const Yn = 1.0;
    const Zn = 1.08883;

    const f = (t) => {
        const delta = 6 / 29;
        return t > Math.pow(delta, 3) ? Math.pow(t, 1/3) : (t / (3 * delta * delta)) + (4 / 29);
    };

    const fx = f(X / Xn);
    const fy = f(Y / Yn);
    const fz = f(Z / Zn);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bStar = 200 * (fy - fz); // Renamed to avoid conflict with parameter 'b'

    if (isNaN(L) || isNaN(a) || isNaN(bStar)) {
        console.error(`CIELAB calculation failed: L=${L}, a=${a}, b=${bStar}`);
        return { L: 0, a: 0, b: 0 };
    }

    return { L, a, b: bStar }; // Return with 'b' as the key
}
function calculateDeltaE(lab1, lab2) {
    const deltaL = lab2.L - lab1.L;
    const deltaA = lab2.a - lab1.a;
    const deltaB = lab2.b - lab1.b; // Uses 'b' from the returned object
    return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}
const SHADER_PRESETS = {
    pca: {
        quality: {
            useMSE: 0,      
            useDither: 0,   
            useRefinement: 1 
        },
        speed: {
            useMSE: 1,      
            useDither: 0,   
            useRefinement: 0 
        },
        balanced: {
            useMSE: 1,      
            useDither: 0,   
            useRefinement: 1
        }
    },
    cluster: {
        quality: {
            useMSE: 0,
            useDither: 0,
            useRefinement: 1
        },
        speed: {
            useMSE: 1,
            useDither: 0,
            useRefinement: 0
        },
        balanced: {
            useMSE: 1,
            useDither: 0,
            useRefinement: 1
        }
    },
    random: {
        quality: {
            iterations: 2000,
            useMSE: 0,
            useDither: 0,
            useRefinement: 0
        },
        speed: {
            iterations: 5000,
            useMSE: 0,
            useDither: 0,
            useRefinement: 1
        },
        balanced: {
            iterations: 10000,
            useMSE: 0,
            useDither: 0,
            useRefinement: 1
        }
    },
    basic: {
        quality: {
            useMSE: 0,
            useDither: 0,
            useRefinement: 1
        },
        speed: {
            useMSE: 1,
            useDither: 0,
            useRefinement: 0
        },
        balanced: {
            useMSE: 1,
            useDither: 0,
            useRefinement: 1
        }
    }
};

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
        const metrics = {
            ssim: 0.0,
            psnr: 0.0,
            cielabDeltaE: 0.0
        };
    
        // Existing SSIM
        const ssimCmd = ["pyiqa", "ssim", "-t", originalPath, "-r", compressedPath];
        const ssimProcess = new Deno.Command(ssimCmd[0], {
            args: ssimCmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });
        const ssimResult = await ssimProcess.output();
        if (ssimResult.code === 0) {
            const ssimOutput = new TextDecoder().decode(ssimResult.stdout);
            const ssimMatch = ssimOutput.match(/ssim.*?\b(\d+(\.\d+)?)/i);
            if (ssimMatch) metrics.ssim = parseFloat(ssimMatch[1]);
        }
    
        // Existing PSNR
        const psnrCmd = ["pyiqa", "psnr", "-t", originalPath, "-r", compressedPath];
        const psnrProcess = new Deno.Command(psnrCmd[0], {
            args: psnrCmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });
        const psnrResult = await psnrProcess.output();
        if (psnrResult.code === 0) {
            const psnrOutput = new TextDecoder().decode(psnrResult.stdout);
            const psnrMatch = psnrOutput.match(/psnr.*?\b(\d+(\.\d+)?)/i);
            if (psnrMatch) metrics.psnr = parseFloat(psnrMatch[1]);
        }
    
        // Preprocess DDS to PNG
        const ddsData = await DDSHandler.readDDS(compressedPath);
        const compPixels = DecompressionHandler.decompress(
            ddsData.compressedData,
            ddsData.width,
            ddsData.height,
            Math.ceil(ddsData.width / 4) * 4,
            Math.ceil(ddsData.height / 4) * 4
        );
        const tempPngPath = join(this.compressedDir, "temp_decompressed.png");
        await DecompressionHandler.saveImage(compPixels, ddsData.width, ddsData.height, tempPngPath);
    
        // Python script for Delta E
        const deltaECmd = ["python", "C:\\Users\\Alen\\Desktop\\Diploma\\delta_e.py", originalPath, tempPngPath];
        const deltaEProcess = new Deno.Command(deltaECmd[0], {
            args: deltaECmd.slice(1),
            stdout: "piped",
            stderr: "piped"
        });
        const deltaEResult = await deltaEProcess.output();
        if (deltaEResult.code === 0) {
            const deltaEOutput = new TextDecoder().decode(deltaEResult.stdout);
            metrics.cielabDeltaE = parseFloat(deltaEOutput.trim());
            console.log(`Python Delta E: ${metrics.cielabDeltaE.toFixed(4)}`);
        } else {
            console.error("Python Delta E failed:", new TextDecoder().decode(deltaEResult.stderr));
        }
    
        // Clean up temp file
        await Deno.remove(tempPngPath);
    
        return metrics;
    }
    async calculateCielabDeltaE(originalPath, compressedPath) {
        console.log(`Calculating CIELAB for ${originalPath} vs ${compressedPath}`);
    
        // Load original image using PNG decoding (since compressionHandler.loadImage might be the issue)
        const origPixels = decodePng(await Deno.readFile(originalPath)).image;
        const ddsData = await DDSHandler.readDDS(compressedPath);
        const compPixels = DecompressionHandler.decompress(
            ddsData.compressedData, ddsData.width, ddsData.height,
            Math.ceil(ddsData.width / 4) * 4, Math.ceil(ddsData.height / 4) * 4
        );
    
        let totalDeltaE = 0;
        const pixelCount = Math.min(origPixels.length, compPixels.length) / 4;
    
        for (let i = 0; i < pixelCount * 4; i += 4) {
            const origLab = rgbToCielab(origPixels[i], origPixels[i + 1], origPixels[i + 2]);
            const compLab = rgbToCielab(compPixels[i], compPixels[i + 1], compPixels[i + 2]);
            totalDeltaE += calculateDeltaE(origLab, compLab);
        }
    
        const avgDeltaE = totalDeltaE / pixelCount;
        console.log(`Average CIELAB Delta E: ${avgDeltaE.toFixed(4)}`);
        return avgDeltaE;
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
    
            await DDSHandler.writeDDS(outputDDS, result.width, result.height, result.compressedData);
            
            // Add zoomed portion saving
            const zoomPath = await this.saveZoomedPortion(
                result.compressedData,
                result.width,
                result.height,
                config.method,
                config.parameters
            );
    
            const metrics = await this.runImageMetrics(this.currentImagePath, outputDDS);
    
            return {
                method: config.method,
                parameters: config.parameters,
                zoomPath: zoomPath,
                metrics: {
                    compressionTime: endTime - startTime,
                    compressedSize: result.compressedData.byteLength,
                    ssim: metrics.ssim,
                    psnr: metrics.psnr,
                    cielabDeltaE: metrics.cielabDeltaE
                }
            };
        } catch (error) {
            console.error(`Error compressing with ${config.method}:`, error);
            throw error;
        }
    }

    async parseNVCompressOutput(stdout, stderr) {
        // Initialize metrics
        const metrics = {
            compressionTime: null,
            mse: null,
            psnr: null,
            ssim: null,
            // Add timing breakdown
            timingBreakdown: {
                initTime: 0,
                totalTime: 0
            }
        };

        // Find initialization time
        const initMatch = stdout.match(/nvtt::Context\(\) time: (\d+\.?\d*) seconds/);
        const initTime = initMatch ? parseFloat(initMatch[1]) * 1000 : 0; // Convert to ms
        metrics.timingBreakdown.initTime = initTime;

        // Find total time
        const totalMatch = stdout.match(/Total processing time: (\d+\.?\d*) seconds/);
        const totalTime = totalMatch ? parseFloat(totalMatch[1]) * 1000 : 0; // Convert to ms
        metrics.timingBreakdown.totalTime = totalTime;

        // Calculate actual compression time (total - init)
        if (totalTime > 0 && initTime > 0) {
            metrics.compressionTime = totalTime - initTime;
        }

        return metrics;
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
        ...(config.useGPU ? ["-EncodeWith", "GPU"] : []),
        this.currentImagePath,
        outputPath,
        "-log",
        "-logfile", logPath,
        ...(config.refineSteps ? ["-RefineSteps", config.refineSteps.toString()] : [])
    ];

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

    const toolMetrics = await this.parseCompressonatorOutput(logPath);
    const ddsData = await DDSHandler.readDDS(outputPath);
    
    // Add zoomed portion saving
    const zoomPath = await this.saveZoomedPortion(
        ddsData.compressedData,
        ddsData.width,
        ddsData.height,
        "compressonator",
        config
    );

    const metrics = await this.runImageMetrics(this.currentImagePath, outputPath);

    return {
        method: "compressonator",
        parameters: config,
        zoomPath: zoomPath,
        metrics: {
            compressionTime: toolMetrics.compressionTime,
            compressedSize: (await Deno.stat(outputPath)).size,
            ssim: metrics.ssim,
            psnr: metrics.psnr,
            cielabDeltaE: metrics.cielabDeltaE
        }
    };
}
    async  runNVCompress(config = {}) {
        const filename = this.currentImagePath.split(/[\/\\]/).pop();
        const outputPath = join(this.compressedDir, `${filename}_nvcompress${config.fast ? '_fast' : ''}.dds`);
    
        // Measure I/O time specifically
        const measureIOTime = async () => {
            const start = performance.now();
            const data = await Deno.readFile(this.currentImagePath);
            await Deno.writeFile(outputPath, data);
            return performance.now() - start;
        };
    
        // Basic command setup
        const baseCmd = [
            NVCOMPRESS_PATH,
            "--no-mips",
            "-bc1"
        ];
    
        if (config.fast) {
            baseCmd.push("-fast");
        } else if (config.highest) {
            baseCmd.push("-highest");
        }
    
        // Warmup phase
        console.log("\nPerforming warmup pass...");
        await new Deno.Command(baseCmd[0], {
            args: [...baseCmd.slice(1), this.currentImagePath, outputPath],
            stdout: "piped",
            stderr: "piped"
        }).output();
    
        // Multiple measurement passes
        const NUM_PASSES = 10; // Increased from 5
        const timings = [];
        const ioTimings = [];
    
        console.log("Running measurement passes...");
        for (let i = 0; i < NUM_PASSES; i++) {
            // Measure I/O
            ioTimings.push(await measureIOTime());
    
            // Measure compression
            const iterationPath = join(this.compressedDir, `${filename}_nvcompress_iter${i}.dds`);
            const cmd = [...baseCmd, this.currentImagePath, iterationPath];
    
            const startTime = performance.now();
            await new Deno.Command(cmd[0], {
                args: cmd.slice(1),
                stdout: "piped",
                stderr: "piped"
            }).output();
            const endTime = performance.now();
    
            timings.push(endTime - startTime);
    
            // Cleanup
            if (i < NUM_PASSES - 1) {
                await Deno.remove(iterationPath);
            } else {
                await Deno.rename(iterationPath, outputPath);
            }
        }
    
        // Calculate statistics
        const sortedTimings = [...timings].sort((a, b) => a - b);
        const sortedIOTimings = [...ioTimings].sort((a, b) => a - b);
        
        // Remove outliers (top and bottom 20%)
        const trimStart = Math.floor(NUM_PASSES * 0.2);
        const trimEnd = NUM_PASSES - trimStart;
        const trimmedTimings = sortedTimings.slice(trimStart, trimEnd);
        const trimmedIOTimings = sortedIOTimings.slice(trimStart, trimEnd);
    
        // Calculate statistics
        const medianTiming = trimmedTimings[Math.floor(trimmedTimings.length / 2)];
        const medianIO = trimmedIOTimings[Math.floor(trimmedIOTimings.length / 2)];
        const avgTiming = trimmedTimings.reduce((a, b) => a + b) / trimmedTimings.length;
        const stdDev = Math.sqrt(
            trimmedTimings.reduce((sq, n) => sq + Math.pow(n - avgTiming, 2), 0) / 
            (trimmedTimings.length - 1)
        );

        const ddsData = await DDSHandler.readDDS(outputPath);
    
    // Add zoomed portion saving
    const zoomPath = await this.saveZoomedPortion(
        ddsData.compressedData,
        ddsData.width,
        ddsData.height,
        "nvcompress",
        config
    );
    
        // Get quality metrics
        const metrics = await this.runImageMetrics(this.currentImagePath, outputPath);
        const compressedSize = (await Deno.stat(outputPath)).size;
        const inputSize = (await Deno.stat(this.currentImagePath)).size;
    
        console.log(`\nNVIDIA Compression Timing Analysis:
    - Median Raw Time: ${medianTiming.toFixed(3)}ms
    - Measured I/O Time: ${medianIO.toFixed(3)}ms
    - Estimated Pure Compression: ${(medianTiming - medianIO).toFixed(3)}ms
    - Standard Deviation: ${stdDev.toFixed(3)}ms
    - Raw Timings: ${timings.map(t => t.toFixed(3)).join(', ')}ms
    - I/O Timings: ${ioTimings.map(t => t.toFixed(3)).join(', ')}ms
    - Input Size: ${(inputSize/1024).toFixed(2)}KB
    - Output Size: ${(compressedSize/1024).toFixed(2)}KB`);
    
        return {
            method: "nvcompress",
            parameters: config,
            metrics: {
                compressionTime: medianTiming - medianIO,
                rawTime: medianTiming,
                ioTime: medianIO,
                stdDev: stdDev,
                timings: trimmedTimings,
                ioTimings: trimmedIOTimings,
                compressedSize: compressedSize,
                ssim: metrics.ssim,
                psnr: metrics.psnr,
                inputSize: inputSize,
                cielabDeltaE: metrics.cielabDeltaE
            }
        };
    }

    async saveZoomedPortion(compressedData, width, height, methodName, parameters) {
        const filename = this.currentImagePath.split(/[\/\\]/).pop();
        
        // Define zoom region (example: center 64x64 pixels)
        const ZOOM_SIZE = 64;
        const zoomX = 200;
        const zoomY = 220;
    
        // Decompress the full image
        const decompressed = DecompressionHandler.decompress(
            new Uint32Array(compressedData.buffer),
            width,
            height,
            Math.ceil(width / 4) * 4,
            Math.ceil(height / 4) * 4
        );
    
        // Extract zoomed portion
        const zoomedPixels = new Uint8Array(ZOOM_SIZE * ZOOM_SIZE * 4);
        for (let y = 0; y < ZOOM_SIZE; y++) {
            for (let x = 0; x < ZOOM_SIZE; x++) {
                const srcIdx = ((zoomY + y) * width + (zoomX + x)) * 4;
                const dstIdx = (y * ZOOM_SIZE + x) * 4;
                zoomedPixels[dstIdx] = decompressed[srcIdx];
                zoomedPixels[dstIdx + 1] = decompressed[srcIdx + 1];
                zoomedPixels[dstIdx + 2] = decompressed[srcIdx + 2];
                zoomedPixels[dstIdx + 3] = decompressed[srcIdx + 3];
            }
        }
    
        // Save zoomed portion
        const zoomPath = join(
            this.compressedDir,
            `${filename}_${methodName}_zoom_${
                Object.entries(parameters || {})
                    .map(([k,v]) => `${k}${v}`)
                    .join('_')
            }.png`
        );
        
        await DecompressionHandler.saveImage(zoomedPixels, ZOOM_SIZE, ZOOM_SIZE, zoomPath);
        return zoomPath;
    }

    async parseCompressonatorOutput(logPath) {
        try {
            const logContent = await Deno.readTextFile(logPath);
            const metrics = {
                compressionTime: 0,
                mse: 0,
                psnr: 0,
                ssim: 0
            };

            // Parse time in seconds from "Total time(s): X.XXX" line
            const timeMatch = logContent.match(/Total time\(s\): (\d+\.\d+)/);
            if (timeMatch) {
                metrics.compressionTime = parseFloat(timeMatch[1]) * 1000; // Convert to ms
            }

            // Parse MSE
            const mseMatch = logContent.match(/MSE\s*: (\d+\.\d+)/);
            if (mseMatch) {
                metrics.mse = parseFloat(mseMatch[1]);
            }

            // Parse PSNR
            const psnrMatch = logContent.match(/PSNR\s*: (\d+\.\d+)/);
            if (psnrMatch) {
                metrics.psnr = parseFloat(psnrMatch[1]);
            }

            // Parse SSIM
            const ssimMatch = logContent.match(/SSIM\s*: (\d+\.\d+)/);
            if (ssimMatch) {
                metrics.ssim = parseFloat(ssimMatch[1]);
            }

            return metrics;
        } catch (error) {
            console.error("Error parsing Compressonator log:", error);
            throw error;
        }
    }

    async runTestSuite() {
        const testImages = [];
        for await (const entry of Deno.readDir(this.imagesDir)) {
            if (entry.isFile && (entry.name.endsWith('.png') || entry.name.endsWith('.jpg'))) {
                testImages.push(join(this.imagesDir, entry.name));
            }
        }

        const configs = [
            // PCA configurations
            { method: 'pca', parameters: SHADER_PRESETS.pca.quality },
            { method: 'pca', parameters: SHADER_PRESETS.pca.speed },
            { method: 'pca', parameters: SHADER_PRESETS.pca.balanced },
            
            // Cluster configurations
            { method: 'cluster', parameters: SHADER_PRESETS.cluster.quality },
            { method: 'cluster', parameters: SHADER_PRESETS.cluster.speed },
            { method: 'cluster', parameters: SHADER_PRESETS.cluster.balanced },
            
            // Random configurations
            { method: 'random', parameters: SHADER_PRESETS.random.quality },
            { method: 'random', parameters: SHADER_PRESETS.random.speed },
            { method: 'random', parameters: SHADER_PRESETS.random.balanced },
            
            // Basic configurations
            { method: 'basic', parameters: SHADER_PRESETS.basic.quality },
            { method: 'basic', parameters: SHADER_PRESETS.basic.speed },
            { method: 'basic', parameters: SHADER_PRESETS.basic.balanced }
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
                        cielabDeltaE: 0,
                        time: 0,
                        size: 0
                    });
                    methodCounts.set(methodKey, 0);
                }
                
                const averages = methodAverages.get(methodKey);
                averages.ssim += result.metrics.ssim;
                averages.psnr += result.metrics.psnr;
                averages.cielabDeltaE += result.metrics.cielabDeltaE;  
                averages.time += result.metrics.compressionTime;
                averages.size += result.metrics.compressedSize;
                methodCounts.set(methodKey, methodCounts.get(methodKey) + 1);
                
                console.log(`\n${result.method}:`);
                console.log("Parameters:", result.parameters);
                console.log("Metrics:", {
                    SSIM: result.metrics.ssim.toFixed(4),
                    PSNR: result.metrics.psnr.toFixed(4),
                    "CIELAB Delta E": result.metrics.cielabDeltaE.toFixed(4),  
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
                cielabDeltaE: totals.cielabDeltaE / count, 
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
                "CIELAB Delta E": averageMetrics.cielabDeltaE.toFixed(4),  
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