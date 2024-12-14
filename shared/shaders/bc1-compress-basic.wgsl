// bc1-compress-basic-improved.wgsl

@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

var<private> seed: u32;

fn rand() -> f32 {
    // A simple linear congruential generator for randomness
    seed = seed * 1664525u + 1013904223u;
    return f32((seed >> 9u) & 0x7FFFFFu) / f32(0x800000u);
}

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(clamp(color.x * 31.0,0.0,31.0)) << 11u) | (u32(clamp(color.y * 63.0,0.0,63.0)) << 5u) | u32(clamp(color.z * 31.0,0.0,31.0));
}

fn colorDistance(c1: vec3<f32>, c2: vec3<f32>) -> f32 {
    let diff = c1 - c2;
    return dot(diff, diff);
}

fn getPixelComponents(pixels: array<vec4<f32>, 16>, index: u32) -> vec4<f32> {
    // Explicitly handle array access in a separate function
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

fn evaluateBlockError(pixels: array<vec4<f32>,16>, c0: vec3<f32>, c1: vec3<f32>) -> f32 {
    var error = 0.0;
    for (var i = 0u; i < 16u; i++) {
        let p = getPixelComponents(pixels, i);
        let rgb = p.rgb;
        var bestDist = 1e9;
        for (var j = 0u; j < 4u; j++) {
            let paletteColor = getColor(j, c0, c1);
            let dist = colorDistance(rgb, paletteColor);
            if (dist < bestDist) {
                bestDist = dist;
            }
        }
        error += bestDist;
    }
    return error;
}

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    // Apply dithering: add slight random variation to pixels
    var ditheredPixels = pixels;
    for (var i = 0u; i < 16u; i++) {
        let p = pixels[i];
        // Add a tiny random offset. Adjust magnitude as needed.
        let offset = (vec3<f32>(rand(), rand(), rand()) - 0.5) * 0.01;
        ditheredPixels[i] = vec4<f32>(clamp(p.rgb + offset, vec3<f32>(0.0), vec3<f32>(1.0)), p.w);
    }

    // Initial min/max selection
    let pixel0 = getPixelComponents(ditheredPixels, 0u);
    var minColor = pixel0.rgb;
    var maxColor = minColor;

    for (var i = 1u; i < 16u; i++) {
        let pixel = getPixelComponents(ditheredPixels, i);
        let rgb = pixel.rgb;
        let alpha = pixel.w;

        if (alpha < 0.5 || all(rgb == vec3<f32>(0.0))) {
            continue;
        }

        // Check distances to find extremes
        if (colorDistance(rgb, minColor) > colorDistance(maxColor, minColor)) {
            maxColor = rgb;
        } else if (colorDistance(rgb, maxColor) > colorDistance(minColor, maxColor)) {
            minColor = rgb;
        }
    }
    // Endpoint refinement: try nearby variations of minColor and maxColor
    var bestC0 = maxColor;
    var bestC1 = minColor;
    var bestError = evaluateBlockError(ditheredPixels, bestC0, bestC1);

    let steps = 2u;
    let stepSize = 0.02; // Adjust as needed

    for (var mx = 0u; mx <= steps; mx++) {
        for (var my = 0u; my <= steps; my++) {
            for (var mz = 0u; mz <= steps; mz++) {
                for (var nx = 0u; nx <= steps; nx++) {
                    for (var ny = 0u; ny <= steps; ny++) {
                        for (var nz = 0u; nz <= steps; nz++) {
                            let deltaMax = vec3<f32>(f32(mx)*stepSize, f32(my)*stepSize, f32(mz)*stepSize) - vec3<f32>(f32(steps), f32(steps), f32(steps))*stepSize*0.5;
                            let deltaMin = vec3<f32>(f32(nx)*stepSize, f32(ny)*stepSize, f32(nz)*stepSize) - vec3<f32>(f32(steps), f32(steps), f32(steps))*stepSize*0.5;

                            let testC0 = clamp(maxColor + deltaMax, vec3<f32>(0.0), vec3<f32>(1.0));
                            let testC1 = clamp(minColor + deltaMin, vec3<f32>(0.0), vec3<f32>(1.0));

                            let err = evaluateBlockError(ditheredPixels, testC0, testC1);
                            if (err < bestError) {
                                bestError = err;
                                bestC0 = testC0;
                                bestC1 = testC1;
                            }
                        }
                    }
                }
            }
        }
    }
    let color0 = colorTo565(bestC0);
    let color1 = colorTo565(bestC1);

    var lookupTable: u32 = 0u;

    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1e9;
        let pixel = getPixelComponents(ditheredPixels, i);
        let rgb = pixel.rgb;

        for (var j = 0u; j < 4u; j++) {
            let paletteColor = getColor(j, bestC0, bestC1);
            let distance = colorDistance(rgb, paletteColor);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = j;
            }
        }

        lookupTable |= bestIndex << (i * 2u);
    }

    return array<u32, 2>(
        color0 | (color1 << 16u),
        lookupTable
    );
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
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

    seed = blockX + blockY * 99991u; // some pseudo-random seed based on block location

    var pixels: array<vec4<f32>,16>;
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
