// shared/decompression-core.js

export class DecompressionCore {
    static color565ToRGB(color) {
        const r5 = ((color >> 11) & 0x1F);
        const g6 = ((color >> 5) & 0x3F);
        const b5 = (color & 0x1F);

        const r = Math.round((r5 ) * (255 / 31)); // Scale 5 bits to 8 bits
        const g = Math.round((g6 ) * (255 / 63)); // Scale 6 bits to 8 bits
        const b = Math.round((b5 ) * (255 / 31)); // Scale 5 bits to 8 bits
    
        return [r, g, b];
    }

    static decompress(compressedData, width, height, paddedWidth, paddedHeight) {
        const pixels = new Uint8Array(width * height * 4);

        for (let blockY = 0; blockY < paddedHeight / 4; blockY++) {
            for (let blockX = 0; blockX < paddedWidth / 4; blockX++) {
                const blockIndex = (blockY * (paddedWidth / 4) + blockX) * 2;
                const color0 = compressedData[blockIndex] & 0xFFFF;
                const color1 = compressedData[blockIndex] >> 16;
                const lookupTable = compressedData[blockIndex + 1];

                const palette = [
                    this.color565ToRGB(color0),
                    this.color565ToRGB(color1),
                    this.color565ToRGB(color0).map((v, i) =>
                        Math.floor((2 * v + this.color565ToRGB(color1)[i]) / 3)),
                    this.color565ToRGB(color0).map((v, i) =>
                        Math.floor((v + 2 * this.color565ToRGB(color1)[i]) / 3))
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
}