// shared/decompression-handler.js
import { encode as encodePng } from "https://deno.land/x/pngs/mod.ts";
import { DecompressionCore } from './decompression-core.js';

export class DecompressionHandler {
    static decompress(compressedData, width, height) {
        const paddedWidth = Math.ceil(width / 4) * 4;
        const paddedHeight = Math.ceil(height / 4) * 4;
        
        return DecompressionCore.decompress(
            compressedData, 
            width, 
            height, 
            paddedWidth, 
            paddedHeight
        );
    }

    static async saveImage(pixels, width, height, path) {
        const pngData = encodePng(pixels, width, height);
        await Deno.writeFile(path, pngData);
    }
}