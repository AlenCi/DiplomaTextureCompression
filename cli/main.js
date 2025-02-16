// cli/main.js
import { CompressionCore } from '../shared/compression-core.js';
import { CompressionHandler } from '../shared/compression-handler.js';
import { DDSHandler } from '../shared/dds-handler.js';
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";
import { DecompressionHandler } from '../shared/decompression-handler.js';

async function loadShaders() {
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const shadersDir = join(currentDir, '..', 'shared', 'shaders');
    
    console.log("Loading shaders from:", shadersDir);
    
    try {
        const basicShaderPath = join(shadersDir, 'bc1-compress-basic.wgsl');
        const pcaShaderPath = join(shadersDir, 'bc1-compress-pca.wgsl');
        const randomShaderPath = join(shadersDir, 'bc1-compress-random.wgsl');
        const clusterShaderPath = join(shadersDir, 'bc1-compress-cluster.wgsl');
        
        const shaderSources = {
            pca: await Deno.readTextFile(pcaShaderPath),
            basic: await Deno.readTextFile(basicShaderPath),
            random: await Deno.readTextFile(randomShaderPath),
            cluster: await Deno.readTextFile(clusterShaderPath),
        };

        return shaderSources;
    } catch (error) {
        console.error("Error loading shaders:", error);
        throw error;
    }
}

function printUsage() {
    console.log(`
Usage:
    Compression:   deno run --unstable --allow-read --allow-write cli/main.js compress <input-image> <output-dds> [method] [options]
    Decompression: deno run --unstable --allow-read --allow-write cli/main.js decompress <input-dds> <output-image>

Methods: pca (default), basic, random, cluster

Options:
    --iterations=<number>    Number of iterations for random method (default: 1000)
    --use-mse               Use Mean Squared Error for color comparison
    --use-dither           Apply dithering during compression
    --use-refinement       Enable endpoint refinement
    `);
}

function parseOptions(args) {
    const options = {
        iterations: 1000,
        useMSE: 0,
        useDither: 0,
        useRefinement: 0
    };

    for (let i = 4; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--iterations=')) {
            options.iterations = parseInt(arg.split('=')[1]);
        } else if (arg === '--use-mse') {
            options.useMSE = 1;
        } else if (arg === '--use-dither') {
            options.useDither = 1;
        } else if (arg === '--use-refinement') {
            options.useRefinement = 1;
        }
    }

    return options;
}

async function compress(inputPath, outputPath, method = 'pca', parameters = {}) {
    try {
        console.log(`Compressing ${inputPath} to ${outputPath} using ${method} method with parameters:`, parameters);
        
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU not supported");
        }
        
        const device = await adapter.requestDevice();
        console.log("WebGPU initialized successfully");

        const shaderSources = await loadShaders();
        console.log("Shaders loaded successfully");
        
        const compressionCore = new CompressionCore(device);
        await compressionCore.init(shaderSources);
        console.log("Compression core initialized");
        
        const handler = new CompressionHandler(device, compressionCore);
        console.log("Compression handler created");
        
        console.log("Starting image compression...");
        const result = await handler.compressImage(inputPath, method, parameters);
        
        console.log("Compression complete, saving to DDS...");
        await DDSHandler.writeDDS(outputPath, result.width, result.height, result.compressedData);
        
        console.log("Operation complete!");
        
    } catch (error) {
        console.error("Compression failed with error:", error);
        throw error;
    }
}

async function decompress(inputPath, outputPath) {
    try {
        console.log(`Decompressing ${inputPath} to ${outputPath}...`);
        
        const ddsData = await DDSHandler.readDDS(inputPath);
        console.log(`Loaded DDS file: ${ddsData.width}x${ddsData.height}`);

        console.log('Decompressing data...');
        const pixels = DecompressionHandler.decompress(
            ddsData.compressedData,
            ddsData.width,
            ddsData.height
        );

        console.log('Saving decompressed image...');
        await DecompressionHandler.saveImage(
            pixels,
            ddsData.width,
            ddsData.height,
            outputPath
        );

        console.log('Decompression complete!');
    } catch (error) {
        console.error("Decompression failed:", error);
        throw error;
    }
}

async function main() {
    const args = Deno.args;
    
    if (args.length < 3) {
        printUsage();
        Deno.exit(1);
    }

    const command = args[0];
    const inputPath = args[1];
    const outputPath = args[2];
    
    try {
        switch (command) {
            case 'compress': {
                const method = args[3] || 'pca';
                if (!['pca', 'basic', 'random', 'cluster'].includes(method)) {
                    throw new Error(`Invalid method: ${method}`);
                }
                
                const parameters = parseOptions(args);
                await compress(inputPath, outputPath, method, parameters);
                break;
            }
            case 'decompress': {
                await decompress(inputPath, outputPath);
                break;
            }
            default: {
                console.error(`Unknown command: ${command}`);
                printUsage();
                Deno.exit(1);
            }
        }
    } catch (error) {
        console.error("Error:", error.message);
        Deno.exit(1);
    }
}

main();