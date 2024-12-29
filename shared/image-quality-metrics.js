// image-quality-metrics.js
export class ImageQualityMetrics {

    static calculateMSE(originalData, compressedData, paddedWidth, paddedHeight) {

        let mse = 0;
        for (let i = 0; i < originalData.length; i += 4) {
            const diffR = originalData[i + 0] - compressedData[i + 0];
            const diffG = originalData[i + 1] - compressedData[i + 1];
            const diffB = originalData[i + 2] - compressedData[i + 2];
            mse += diffR * diffR + diffG * diffG + diffB * diffB;
        }

        return mse / (paddedWidth * paddedHeight * 3);
    }


    static calculatePSNR(mse) {
        // If mse is extremely small, avoid log(0)
        if (mse <= 1e-12) return 99.0; // Some high fallback
        return 10 * Math.log10((255.0 * 255.0) / mse);
    }

  
    static calculateSSIM(originalData, compressedData, width, height) {
        // Build grayscale arrays
        const originalGray = new Float32Array(width * height);
        const compressedGray = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;

                // Original pixel
                const R_o = originalData[idx + 0];
                const G_o = originalData[idx + 1];
                const B_o = originalData[idx + 2];
                originalGray[y * width + x] =
                    0.299 * R_o + 0.587 * G_o + 0.114 * B_o;

                // Compressed (already decompressed) pixel
                const R_c = compressedData[idx + 0];
                const G_c = compressedData[idx + 1];
                const B_c = compressedData[idx + 2];
                compressedGray[y * width + x] =
                    0.299 * R_c + 0.587 * G_c + 0.114 * B_c;
            }
        }

        // Standard SSIM constants
        const L = 255;
        const k1 = 0.01;
        const k2 = 0.03;
        const c1 = (k1 * L) ** 2; // (0.01*255)^2
        const c2 = (k2 * L) ** 2; // (0.03*255)^2

        // Use the same block size as compression-utils
        const windowSize = 8;
        let ssimSum = 0;
        let windowCount = 0;

        // Slide block by block (non-overlapping)
        for (let wy = 0; wy <= height - windowSize; wy += windowSize) {
            for (let wx = 0; wx <= width - windowSize; wx += windowSize) {
                let sumX = 0;
                let sumY = 0;
                let sumX2 = 0;
                let sumY2 = 0;
                let sumXY = 0;
                const N = windowSize * windowSize;

                // Accumulate local sums
                for (let j = 0; j < windowSize; j++) {
                    for (let i = 0; i < windowSize; i++) {
                        const idx = (wy + j) * width + (wx + i);
                        const xVal = originalGray[idx];
                        const yVal = compressedGray[idx];
                        sumX += xVal;
                        sumY += yVal;
                        sumX2 += xVal * xVal;
                        sumY2 += yVal * yVal;
                        sumXY += xVal * yVal;
                    }
                }

                // Means
                const meanX = sumX / N;
                const meanY = sumY / N;

                // Variances and covariance
                const varX = sumX2 / N - meanX * meanX;
                const varY = sumY2 / N - meanY * meanY;
                const covXY = sumXY / N - meanX * meanY;

                // SSIM for this block
                const numerator =
                    (2 * meanX * meanY + c1) * (2 * covXY + c2);
                const denominator =
                    (meanX * meanX + meanY * meanY + c1) *
                    (varX + varY + c2);

                const ssim = numerator / denominator;
                ssimSum += ssim;
                windowCount++;
            }
        }

        return ssimSum / windowCount;
    }
}
