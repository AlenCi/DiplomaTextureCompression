// cli/main.js
import { CompressionCore } from '../shared/compression-core.js';
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";

async function loadShaders() {
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const shadersDir = join(currentDir, '..', 'shared', 'shaders');
    
    console.log("Loading shaders from:", shadersDir);
    
    try {
        const basicShaderPath = join(shadersDir, 'bc1-compress-basic.wgsl');
        const pcaShaderPath = join(shadersDir, 'bc1-compress-pca.wgsl');
        const randomShaderPath = join(shadersDir, 'bc1-compress-random.wgsl');
        
        const shaderSources = {
            pca: await Deno.readTextFile(pcaShaderPath),
            basic: await Deno.readTextFile(basicShaderPath),
            random: await Deno.readTextFile(randomShaderPath)
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
    Compression:   deno run --unstable --allow-read --allow-write cli/main.js compress <input-image> <output-dds> [method] [iterations]
    Decompression: deno run --unstable --allow-read --allow-write cli/main.js decompress <input-dds> <output-image>

Methods: pca (default), basic, random
Iterations (for random method): number (default: 1000)
    `);
}

async function loadImage(path) {
    // For now, we'll just read the file
    // We'll implement proper image loading in the next step
    console.log("Loading image:", path);
    return null;
}

async function saveDDS(compressedData, width, height, outputPath) {
    // We'll implement DDS file saving in the next step
    console.log("Saving DDS:", outputPath);
}

async function compress(inputPath, outputPath, method = 'pca', iterations = 1000) {
    console.log(`Compressing ${inputPath} to ${outputPath} using ${method} method...`);
    
    // TODO: Implement compression
}

async function decompress(inputPath, outputPath) {
    console.log(`Decompressing ${inputPath} to ${outputPath}...`);
    
    // TODO: Implement decompression
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
                const iterations = args[4] ? parseInt(args[4]) : 1000;
                
                if (!['pca', 'basic', 'random'].includes(method)) {
                    throw new Error(`Invalid method: ${method}`);
                }
                
                await compress(inputPath, outputPath, method, iterations);
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