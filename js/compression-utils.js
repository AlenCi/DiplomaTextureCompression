// compression-utils.js

export function calculateMSE(original, compressed, width, height, paddedWidth, paddedHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = paddedWidth;
    canvas.height = paddedHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, paddedWidth, paddedHeight).data;
    
    let mse = 0;
    for (let y = 0; y < paddedHeight; y++) {
        for (let x = 0; x < paddedWidth; x++) {
            const i = (y * paddedWidth + x) * 4;
            const blockIndex = (Math.floor(y / 4) * (paddedWidth / 4) + Math.floor(x / 4)) * 2;
            const pixelIndex = (y % 4) * 4 + (x % 4);
            const color0 = compressed[blockIndex] & 0xFFFF;
            const color1 = compressed[blockIndex] >> 16;
            const lookupTable = compressed[blockIndex + 1];
            const colorIndex = (lookupTable >> (pixelIndex * 2)) & 0x3;
            
            const decompressedColor = getDecompressedColor(color0, color1, colorIndex);
            
            for (let j = 0; j < 3; j++) {
                const diff = originalData[i + j] - decompressedColor[j];
                mse += diff * diff;
            }
        }
    }
    
    return mse / (paddedWidth * paddedHeight * 3);
}

export function calculatePSNR(mse) {
    return 10 * Math.log10(255 * 255 / mse);
}

export function calculateSSIM(original, compressed, width, height, paddedWidth, paddedHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = paddedWidth;
    canvas.height = paddedHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, paddedWidth, paddedHeight).data;

    const L = 255;  // Dynamic range for 8-bit images
    const k1 = 0.01;
    const k2 = 0.03;
    const c1 = (k1 * L) ** 2;
    const c2 = (k2 * L) ** 2;

    const windowSize = 4;  // Using 4x4 to match DXT1 block size

    const gaussianKernel = [
        [0.0625, 0.125, 0.125, 0.0625],
        [0.125, 0.25, 0.25, 0.125],
        [0.125, 0.25, 0.25, 0.125],
        [0.0625, 0.125, 0.125, 0.0625]
    ];

    let ssimSum = 0;
    let windowCount = 0;

    // Process each block of the compressed image
    for (let blockY = 0; blockY < paddedHeight / 4; blockY++) {
        for (let blockX = 0; blockX < paddedWidth / 4; blockX++) {
            const blockIndex = (blockY * (paddedWidth / 4) + blockX) * 2;
            const color0 = compressed[blockIndex] & 0xFFFF;
            const color1 = compressed[blockIndex] >> 16;
            const lookupTable = compressed[blockIndex + 1];

            // Calculate statistics for this block
            let weightedSum1 = 0, weightedSum2 = 0, weightSum = 0;

            // First pass: calculate weighted means
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const pixX = blockX * 4 + x;
                    const pixY = blockY * 4 + y;

                    if (pixX >= width || pixY >= height) continue;

                    const i = (pixY * paddedWidth + pixX) * 4;
                    const pixelInBlock = y * 4 + x;
                    const colorIndex = (lookupTable >> (pixelInBlock * 2)) & 0x3;

                    const r1 = originalData[i];
                    const g1 = originalData[i + 1];
                    const b1 = originalData[i + 2];

                    const decompressedColor = getDecompressedColor(color0, color1, colorIndex);
                    const r2 = decompressedColor[0];
                    const g2 = decompressedColor[1];
                    const b2 = decompressedColor[2];

                    const val1 = getLuminance(r1, g1, b1);
                    const val2 = getLuminance(r2, g2, b2);

                    const weight = gaussianKernel[y][x];
                    weightedSum1 += val1 * weight;
                    weightedSum2 += val2 * weight;
                    weightSum += weight;
                }
            }

            if (weightSum === 0) continue;

            const μ1 = weightedSum1 / weightSum;
            const μ2 = weightedSum2 / weightSum;

            // Second pass: calculate weighted variances and covariance
            let weightedVar1 = 0, weightedVar2 = 0, weightedCovar = 0;

            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const pixX = blockX * 4 + x;
                    const pixY = blockY * 4 + y;

                    if (pixX >= width || pixY >= height) continue;

                    const i = (pixY * paddedWidth + pixX) * 4;
                    const pixelInBlock = y * 4 + x;
                    const colorIndex = (lookupTable >> (pixelInBlock * 2)) & 0x3;

                    const r1 = originalData[i];
                    const g1 = originalData[i + 1];
                    const b1 = originalData[i + 2];

                    const decompressedColor = getDecompressedColor(color0, color1, colorIndex);
                    const r2 = decompressedColor[0];
                    const g2 = decompressedColor[1];
                    const b2 = decompressedColor[2];

                    const val1 = getLuminance(r1, g1, b1);
                    const val2 = getLuminance(r2, g2, b2);

                    const diff1 = val1 - μ1;
                    const diff2 = val2 - μ2;
                    const weight = gaussianKernel[y][x];

                    weightedVar1 += weight * diff1 * diff1;
                    weightedVar2 += weight * diff2 * diff2;
                    weightedCovar += weight * diff1 * diff2;
                }
            }

            const σ1 = weightedVar1 / weightSum;
            const σ2 = weightedVar2 / weightSum;
            const σ12 = weightedCovar / weightSum;

            // Calculate SSIM for this block
            const numerator = (2 * μ1 * μ2 + c1) * (2 * σ12 + c2);
            const denominator = (μ1 * μ1 + μ2 * μ2 + c1) * (σ1 + σ2 + c2);
            const ssim = numerator / denominator;

            ssimSum += ssim;
            windowCount++;
        }
    }

    // Average over all windows
    return ssimSum / windowCount;
}

export function getDecompressedColor(color0, color1, colorIndex) {
    const c0 = color565To888(color0);
    const c1 = color565To888(color1);
    
    switch (colorIndex) {
        case 0: return c0;
        case 1: return c1;
        case 2: return c0.map((v, i) => Math.round((2 * v + c1[i]) / 3));
        case 3: return c0.map((v, i) => Math.round((v + 2 * c1[i]) / 3));
    }
}

export function color565To888(color) {
    const r = (color >> 11) & 0x1F;
    const g = (color >> 5) & 0x3F;
    const b = color & 0x1F;
    return [
        (r << 3) | (r >> 2),
        (g << 2) | (g >> 4),
        (b << 3) | (b >> 2)
    ];
}