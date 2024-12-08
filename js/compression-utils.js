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

    // Extract decompressed image data similarly to MSE calculation
    // We'll build a grayscale version for both original and compressed images.
    const originalGray = new Float32Array(paddedWidth * paddedHeight);
    const compressedGray = new Float32Array(paddedWidth * paddedHeight);

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

            // Original pixel
            const R_o = originalData[i];
            const G_o = originalData[i + 1];
            const B_o = originalData[i + 2];
            const gray_o = 0.299 * R_o + 0.587 * G_o + 0.114 * B_o;
            originalGray[y * paddedWidth + x] = gray_o;

            // Decompressed pixel
            const R_c = decompressedColor[0];
            const G_c = decompressedColor[1];
            const B_c = decompressedColor[2];
            const gray_c = 0.299 * R_c + 0.587 * G_c + 0.114 * B_c;
            compressedGray[y * paddedWidth + x] = gray_c;
        }
    }

    // SSIM parameters
    const L = 255;
    const k1 = 0.01;
    const k2 = 0.03;
    const c1 = (k1 * L) ** 2; 
    const c2 = (k2 * L) ** 2;

    // Window size for SSIM (e.g., 8x8)
    const windowSize = 8;
    let ssimSum = 0;
    let windowCount = 0;

    for (let wy = 0; wy <= paddedHeight - windowSize; wy += windowSize) {
        for (let wx = 0; wx <= paddedWidth - windowSize; wx += windowSize) {
            // Extract window data
            let sumX = 0, sumY = 0;
            let sumX2 = 0, sumY2 = 0;
            let sumXY = 0;
            const N = windowSize * windowSize;

            for (let j = 0; j < windowSize; j++) {
                for (let i = 0; i < windowSize; i++) {
                    const idx = (wy + j) * paddedWidth + (wx + i);
                    const xVal = originalGray[idx];
                    const yVal = compressedGray[idx];

                    sumX += xVal;
                    sumY += yVal;
                    sumX2 += xVal * xVal;
                    sumY2 += yVal * yVal;
                    sumXY += xVal * yVal;
                }
            }

            // Compute means
            const meanX = sumX / N;
            const meanY = sumY / N;

            // Variances and covariance
            const varX = (sumX2 / N) - (meanX * meanX);
            const varY = (sumY2 / N) - (meanY * meanY);
            const covXY = (sumXY / N) - (meanX * meanY);

            // Compute SSIM for this window
            const numerator = (2 * meanX * meanY + c1) * (2 * covXY + c2);
            const denominator = (meanX * meanX + meanY * meanY + c1) * (varX + varY + c2);
            const ssim = numerator / denominator;

            ssimSum += ssim;
            windowCount++;
        }
    }

    const finalSSIM = ssimSum / windowCount;
    return finalSSIM;
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