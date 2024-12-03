export class ImageQualityMetrics {
    // Calculate gaussian window 
    static createGaussianWindow(size = 11, sigma = 1.5) {
        const window = new Float32Array(size * size);
        const center = Math.floor(size / 2);
        let sum = 0;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - center;
                const dy = y - center;
                const g = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
                window[y * size + x] = g;
                sum += g;
            }
        }

        // Normalize
        for (let i = 0; i < window.length; i++) {
            window[i] /= sum;
        }

        return window;
    }

    // Apply gaussian window to image region
    static applyWindow(data, x, y, width, stride, window, windowSize) {
        let sum = 0;
        const center = Math.floor(windowSize / 2);

        for (let wy = 0; wy < windowSize; wy++) {
            for (let wx = 0; wx < windowSize; wx++) {
                const imgX = x + wx - center;
                const imgY = y + wy - center;
                
                if (imgX >= 0 && imgX < width && imgY >= 0 && imgY < data.length / stride) {
                    const pixel = data[imgY * stride + imgX];
                    sum += pixel * window[wy * windowSize + wx];
                }
            }
        }

        return sum;
    }

    // Calculate SSIM for a single channel
    static calculateSSIMChannel(img1Data, img2Data, width, height, stride, windowSize = 11, K1 = 0.01, K2 = 0.03) {
        const L = 255;  // Dynamic range
        const C1 = (K1 * L) ** 2;
        const C2 = (K2 * L) ** 2;
        
        const window = this.createGaussianWindow(windowSize);
        let ssimSum = 0;
        let samples = 0;

        // Process every pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Skip if we don't have enough pixels for the window
                if (x < windowSize/2 || x >= width - windowSize/2 || 
                    y < windowSize/2 || y >= height - windowSize/2) {
                    continue;
                }

                // Calculate means
                const μx = this.applyWindow(img1Data, x, y, width, stride, window, windowSize);
                const μy = this.applyWindow(img2Data, x, y, width, stride, window, windowSize);

                // Calculate variances and covariance
                let σx = 0, σy = 0, σxy = 0;

                for (let wy = 0; wy < windowSize; wy++) {
                    for (let wx = 0; wx < windowSize; wx++) {
                        const imgX = x + wx - Math.floor(windowSize/2);
                        const imgY = y + wy - Math.floor(windowSize/2);
                        
                        if (imgX >= 0 && imgX < width && imgY >= 0 && imgY < height) {
                            const w = window[wy * windowSize + wx];
                            const px1 = img1Data[imgY * stride + imgX];
                            const px2 = img2Data[imgY * stride + imgX];
                            
                            σx += w * (px1 - μx) ** 2;
                            σy += w * (px2 - μy) ** 2;
                            σxy += w * (px1 - μx) * (px2 - μy);
                        }
                    }
                }

                // Calculate SSIM
                const numerator = (2 * μx * μy + C1) * (2 * σxy + C2);
                const denominator = (μx * μx + μy * μy + C1) * (σx + σy + C2);
                const ssim = numerator / denominator;

                ssimSum += ssim;
                samples++;
            }
        }

        return ssimSum / samples;
    }

    // Calculate SSIM for RGB image
    static calculateSSIM(originalImageData, compressedImageData, width, height) {
        const ssimR = this.calculateSSIMChannel(
            new Uint8Array(originalImageData.buffer).filter((_, i) => i % 4 === 0),
            new Uint8Array(compressedImageData.buffer).filter((_, i) => i % 4 === 0),
            width, height, 1
        );
        
        const ssimG = this.calculateSSIMChannel(
            new Uint8Array(originalImageData.buffer).filter((_, i) => i % 4 === 1),
            new Uint8Array(compressedImageData.buffer).filter((_, i) => i % 4 === 1),
            width, height, 1
        );
        
        const ssimB = this.calculateSSIMChannel(
            new Uint8Array(originalImageData.buffer).filter((_, i) => i % 4 === 2),
            new Uint8Array(compressedImageData.buffer).filter((_, i) => i % 4 === 2),
            width, height, 1
        );

        // Average SSIM across channels
        return (ssimR + ssimG + ssimB) / 3;
    }
}