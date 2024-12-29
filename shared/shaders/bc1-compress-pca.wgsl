// shared/shaders/bc1-compress-pca.wgsl

struct Uniforms {
    iterations: u32, 
    useMSE: u32,
    useDither: u32, 
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

fn colorTo565(color: vec3<f32>) -> u32 {
    let r = u32(clamp(color.x * 31.0, 0.0, 31.0));
    let g = u32(clamp(color.y * 63.0, 0.0, 63.0));
    let b = u32(clamp(color.z * 31.0, 0.0, 31.0));
    return (r << 11u) | (g << 5u) | b;
}

fn colorDistance(c1: vec3<f32>, c2: vec3<f32>) -> f32 {
    let diff = c1 - c2;
    return dot(diff, diff);
}

var<private> seed: u32;

fn rand() -> f32 {
    seed = seed * 747796405u + 2891336453u;
    var result = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
    result = (result >> 22u) ^ result;
    return f32(result) / 4294967295.0;
}

fn applyDithering(pixels: array<vec4<f32>, 16>) -> array<vec4<f32>, 16> {
    var ditheredPixels = pixels;
    
    if (uniforms.useDither == 1u) {
        for (var i = 0u; i < 16u; i++) {
            let p = getPixelComponents(pixels, i);  // Use getPixelComponents instead of direct access
            let offset = (vec3<f32>(rand(), rand(), rand()) - 0.5) * 0.01;
            ditheredPixels[i] = vec4<f32>(clamp(p.rgb + offset, vec3<f32>(0.0), vec3<f32>(1.0)), p.w);
        }
    }
    
    return ditheredPixels;
}

fn getPixelComponents(pixels: array<vec4<f32>, 16>, index: u32) -> vec4<f32> {
    var result: vec4<f32>;
    switch(index) {
        case 0u: { result = pixels[0]; }
        case 1u: { result = pixels[1]; }
        case 2u: { result = pixels[2]; }
        case 3u: { result = pixels[3]; }
        case 4u: { result = pixels[4]; }
        case 5u: { result = pixels[5]; }
        case 6u: { result = pixels[6]; }
        case 7u: { result = pixels[7]; }
        case 8u: { result = pixels[8]; }
        case 9u: { result = pixels[9]; }
        case 10u: { result = pixels[10]; }
        case 11u: { result = pixels[11]; }
        case 12u: { result = pixels[12]; }
        case 13u: { result = pixels[13]; }
        case 14u: { result = pixels[14]; }
        case 15u: { result = pixels[15]; }
        default: { result = vec4<f32>(0.0); }
    }
    return result;
}

fn getColor(index: u32, c0: vec3<f32>, c1: vec3<f32>) -> vec3<f32> {
    switch(index) {
        case 0u: { return c0; }
        case 1u: { return c1; }
        case 2u: { return mix(c0, c1, 0.3333); }
        case 3u: { return mix(c0, c1, 0.6666); }
        default: { return c0; }
    }
}

fn calculateMean(pixels: array<vec4<f32>, 16>) -> vec3<f32> {
    var sum = vec3<f32>(0.0);
    var count = 0.0;
    var min_color = vec3<f32>(1.0);
    var max_color = vec3<f32>(0.0);
    
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(pixels, i);
        if (pixel.w >= 0.5) {
            sum += pixel.rgb;
            count += 1.0;
            min_color = min(min_color, pixel.rgb);
            max_color = max(max_color, pixel.rgb);
        }
    }
    
    // If not enough variation or too few pixels, use center of bounds
    let color_range = length(max_color - min_color);
    if (count <= 1.0 || color_range < 0.001) {
        return (max_color + min_color) * 0.5;
    }
    
    return sum / count;
}

fn calculateCovariance(pixels: array<vec4<f32>, 16>, mean: vec3<f32>) -> mat3x3<f32> {
    var cov = mat3x3<f32>(
        vec3<f32>(0.0), 
        vec3<f32>(0.0), 
        vec3<f32>(0.0)
    );
    var count = 0.0;

    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(pixels, i);
        if (pixel.w >= 0.5) {
            let diff = pixel.rgb - mean;
            cov[0] += vec3<f32>(diff.x * diff.x, diff.x * diff.y, diff.x * diff.z);
            cov[1] += vec3<f32>(diff.y * diff.x, diff.y * diff.y, diff.y * diff.z);
            cov[2] += vec3<f32>(diff.z * diff.x, diff.z * diff.y, diff.z * diff.z);
            count += 1.0;
        }
    }

    let scale = select(1.0, 1.0 / count, count > 0.0);
    return mat3x3<f32>(
        cov[0] * scale,
        cov[1] * scale,
        cov[2] * scale
    );
}

fn findPrincipalDirection(cov: mat3x3<f32>) -> vec3<f32> {
    var v = normalize(vec3<f32>(1.0, 1.0, 1.0));
    
    // Power iteration
    for (var i = 0u; i < 8u; i++) {
        let new_v = vec3<f32>(
            dot(cov[0], v),
            dot(cov[1], v),
            dot(cov[2], v)
        );
        v = normalize(new_v);
    }
    
    return v;
}

fn expand565ToFloat(c: u32) -> vec3<f32> {
    let r = f32((c >> 11u) & 31u) / 31.0;
    let g = f32((c >> 5u)  & 63u) / 63.0;
    let b = f32( c         & 31u) / 31.0;
    return vec3<f32>(r, g, b);
}

fn buildBc1Palette(c0_565: u32, c1_565: u32) -> array<vec3<f32>, 4> {
    let c0f = expand565ToFloat(c0_565);
    let c1f = expand565ToFloat(c1_565);
    var pal: array<vec3<f32>, 4>;

    // Assign color 0 and color 1
    pal[0] = c0f;
    pal[1] = c1f;

    if (c0_565 > c1_565) {
        // Standard 4-color interpolation
        pal[2] = (2.0/3.0)*c0f + (1.0/3.0)*c1f;
        pal[3] = (1.0/3.0)*c0f + (2.0/3.0)*c1f;
    } else {
        // 3-color + 1-bit alpha mode
        pal[2] = 0.5 * (c0f + c1f);
        // Usually black or transparent for color 3
        pal[3] = vec3<f32>(0.0, 0.0, 0.0);
    }

    return pal;
}


fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    // 1) Dither the input if enabled
    let ditheredPixels = applyDithering(pixels);

    // 2) Compute stats (mean, validMin, validMax)
    var mean = vec3<f32>(0.0);
    var count = 0.0;
    var validMax = vec3<f32>(0.0);
    var validMin = vec3<f32>(1.0);
    
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(ditheredPixels, i);
        if (pixel.w >= 0.5) {
            mean += pixel.rgb;
            count += 1.0;
            validMax = max(validMax, pixel.rgb);
            validMin = min(validMin, pixel.rgb);
        }
    }
    mean = mean / max(count, 1.0);

    // 3) PCA: covariance + principal direction
    let covariance = calculateCovariance(ditheredPixels, mean);
    let direction = findPrincipalDirection(covariance);

    // 4) Project all valid pixels onto that direction to get min/max projection
    var minProj = 1e6;
    var maxProj = -1e6;
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(ditheredPixels, i);
        if (pixel.w >= 0.5) {
            let diff = pixel.rgb - mean;
            let proj = dot(diff, direction);
            minProj = min(minProj, proj);
            maxProj = max(maxProj, proj);
        }
    }

    // 5) Derive float endpoints
    var minColor = clamp(mean + direction * minProj, vec3<f32>(0.0), vec3<f32>(1.0));
    var maxColor = clamp(mean + direction * maxProj, vec3<f32>(0.0), vec3<f32>(1.0));

    // 6) Safety check: if extremely close, use the block's range
    let colorDiff = distance(maxColor, minColor);
    if (colorDiff < 0.001) {
        minColor = validMin;
        maxColor = validMax;
    }

    // 7) Convert to 565
    let initialC0 = colorTo565(maxColor);
    let initialC1 = colorTo565(minColor);

    // 8) Refine endpoints in 565 space
    let refined = refineEndpoints(initialC0, initialC1, ditheredPixels);
    let color0 = refined[0];
    let color1 = refined[1];

    // 9) Build BC1 palette from final endpoints
    var palette = buildBc1Palette(color0, color1);

    // 10) Pick indices
    var lookupTable: u32 = 0u;
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(ditheredPixels, i);
        var bestIndex = 0u;
        var bestDistance = 1e9;
        for (var j = 0u; j < 4u; j++) {
            let distance = colorDistance(pixel.rgb, palette[j]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = j;
            }
        }
        lookupTable |= (bestIndex << (i * 2u));
    }

    // 11) Return final block
    return array<u32, 2>(
        color0 | (color1 << 16u),
        lookupTable
    );
}

fn computeBlockError(c0_565: u32, c1_565: u32, blockPixels: array<vec4<f32>, 16>) -> f32 {
    // Build the BC1 palette from these 565 endpoints
    var palette = buildBc1Palette(c0_565, c1_565);

    var totalError = 0.0;

    // For each pixel, accumulate the squared distance to the best palette entry
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(blockPixels, i);
        if (pixel.w < 0.5) {
            // Treat fully transparent pixels as zero error or skip?
            continue;
        }
        var bestDist = 1e9;
        for (var j = 0u; j < 4u; j++) {
            let dist = colorDistance(pixel.rgb, palette[j]);
            if (dist < bestDist) {
                bestDist = dist;
            }
        }
        totalError += bestDist;
    }

    return totalError;
}
fn refineEndpoints(
    origC0: u32,
    origC1: u32,
    blockPixels: array<vec4<f32>, 16>
) -> array<u32, 2> {
    // Decode original 565 colors
    let o0r = (origC0 >> 11u) & 31u;
    let o0g = (origC0 >> 5u) & 63u;
    let o0b = origC0 & 31u;

    let o1r = (origC1 >> 11u) & 31u;
    let o1g = (origC1 >> 5u) & 63u;
    let o1b = origC1 & 31u;

    var bestC0 = origC0;
    var bestC1 = origC1;
    var bestError = 1e9;

    // Iterate over possible offsets in 565 space
    for (var dr0: i32 = -1; dr0 <= 1; dr0++) {
        for (var dg0: i32 = -1; dg0 <= 1; dg0++) {
            for (var db0: i32 = -1; db0 <= 1; db0++) {
                let r0 = clamp(i32(o0r) + dr0, 0, 31);
                let g0 = clamp(i32(o0g) + dg0, 0, 63);
                let b0 = clamp(i32(o0b) + db0, 0, 31);
                let candC0 = (u32(r0) << 11u) | (u32(g0) << 5u) | u32(b0);

                for (var dr1: i32 = -1; dr1 <= 1; dr1++) {
                    for (var dg1: i32 = -1; dg1 <= 1; dg1++) {
                        for (var db1: i32 = -1; db1 <= 1; db1++) {
                            let r1 = clamp(i32(o1r) + dr1, 0, 31);
                            let g1 = clamp(i32(o1g) + dg1, 0, 63);
                            let b1 = clamp(i32(o1b) + db1, 0, 31);
                            let candC1 = (u32(r1) << 11u) | (u32(g1) << 5u) | u32(b1);

                            // Compute error for this pair
                            let err = computeBlockError(candC0, candC1, blockPixels);
                            if (err < bestError) {
                                bestError = err;
                                bestC0 = candC0;
                                bestC1 = candC1;
                            }
                        }
                    }
                }
            }
        }
    }

    return array<u32, 2>(bestC0, bestC1);
}


// Helper to decode 565 color into integer R, G, B [0..31 / 63 / 31]
fn decode565(c: u32) -> vec3<u32> {
    let r = (c >> 11u) & 31u;
    let g = (c >> 5u)  & 63u;
    let b = c & 31u;
    return vec3<u32>(r, g, b);
}



@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    seed = global_id.x + global_id.y * 99991u;
    let dimensions = textureDimensions(inputTexture);
    let width = dimensions.x;
    let height = dimensions.y;
    let paddedWidth = (width + 3u) & ~3u;
    let paddedHeight = (height + 3u) & ~3u;
    let blockX = global_id.x;
    let blockY = global_id.y;
    
    if (blockX >= paddedWidth / 4u || blockY >= paddedHeight / 4u) {
        return;
    }

    var pixels: array<vec4<f32>, 16>;

    for (var y = 0u; y < 4u; y++) {
        for (var x = 0u; x < 4u; x++) {
            let pixelX = blockX * 4u + x;
            let pixelY = blockY * 4u + y;
            let pixel_index = y * 4u + x;
            
            if (pixelX < width && pixelY < height) {
                pixels[pixel_index] = textureLoad(inputTexture, vec2<i32>(i32(pixelX), i32(pixelY)), 0);
            } else {
                pixels[pixel_index] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
            }
        }
    }
    
    let compressedBlock = compressBlock(pixels);
    let outputIndex = (blockY * (paddedWidth / 4u) + blockX) * 2u;
    
    outputBuffer[outputIndex] = compressedBlock[0];
    outputBuffer[outputIndex + 1u] = compressedBlock[1];
}