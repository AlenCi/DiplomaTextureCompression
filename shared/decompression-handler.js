// shared/decompression-handler.js
import { encode as encodePng } from "https://deno.land/x/pngs/mod.ts";

export class DecompressionHandler {
    static color565ToRGB(color) {
        const r = ((color >> 11) & 0x1F) << 3;
        const g = ((color >> 5) & 0x3F) << 2;
        const b = (color & 0x1F) << 3;
        return [r, g, b];
    }

    static decompress(compressedData, width, height) {
        const pixels = new Uint8Array(width * height * 4);
        const paddedWidth = Math.ceil(width / 4) * 4;
        const paddedHeight = Math.ceil(height / 4) * 4;

        for (let blockY = 0; blockY < paddedHeight / 4; blockY++) {
            for (let blockX = 0; blockX < paddedWidth / 4; blockX++) {
                const blockIndex = (blockY * (paddedWidth / 4) + blockX) * 2;
                const color0 = compressedData[blockIndex] & 0xFFFF;
                const color1 = compressedData[blockIndex] >> 16;
                const lookupTable = compressedData[blockIndex + 1];

                // Match web version exactly
                const palette = [
                    this.color565ToRGB(color0),
                    this.color565ToRGB(color1),
                    this.color565ToRGB(color0).map((v, i) => 
                        Math.round((2 * v + this.color565ToRGB(color1)[i]) / 3)),
                    this.color565ToRGB(color0).map((v, i) => 
                        Math.round((v + 2 * this.color565ToRGB(color1)[i]) / 3))
                ];

                for (let y = 0; y < 4; y++) {
                    for (let x = 0; x < 4; x++) {
                        const colorIndex = (lookupTable >> ((y * 4 + x) * 2)) & 0x3;
                        const color = palette[colorIndex];

                        const imageX = blockX * 4 + x;
                        const imageY = blockY * 4 + y;

                        // Skip pixels outside the actual image bounds
                        if (imageX >= width || imageY >= height) continue;

                        const i = (imageY * width + imageX) * 4;
                        pixels[i] = color[0];     // R
                        pixels[i + 1] = color[1]; // G
                        pixels[i + 2] = color[2]; // B
                        pixels[i + 3] = 255;      // A
                    }
                }
            }
        }

        return pixels;
    }

    static async saveImage(pixels, width, height, path) {
        const pngData = encodePng(pixels, width, height);
        await Deno.writeFile(path, pngData);
    }
}