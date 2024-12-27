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
    
    // Only apply dithering if enabled via uniform
    if (uniforms.useDither == 1u) {
        for (var i = 0u; i < 16u; i++) {
            let p = pixels[i];
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

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    let ditheredPixels = applyDithering(pixels);
    var mean = vec3<f32>(0.0);
    var count = 0.0;
    var validMax = vec3<f32>(0.0);
    var validMin = vec3<f32>(1.0);
    
    // First pass: gather statistics
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

    // Step 2: Calculate covariance while tracking color spread
    let covariance = calculateCovariance(pixels, mean);
    let direction = findPrincipalDirection(covariance);

    // Step 3: Project and find endpoints
    var minProj = 1000000.0;
    var maxProj = -1000000.0;
    
    for (var i = 0u; i < 16u; i++) {
        let pixel = getPixelComponents(pixels, i);
        if (pixel.w >= 0.5) {
            let diff = pixel.rgb - mean;
            let proj = dot(diff, direction);
            minProj = min(minProj, proj);
            maxProj = max(maxProj, proj);
        }
    }

    // Step 4: Determine final colors with safety checks
    var minColor = clamp(mean + direction * minProj, vec3<f32>(0.0), vec3<f32>(1.0));
    var maxColor = clamp(mean + direction * maxProj, vec3<f32>(0.0), vec3<f32>(1.0));

    // Safety check: if colors are too close, use range directly
    let colorDiff = distance(maxColor, minColor);
    if (colorDiff < 0.001) {
        minColor = validMin;
        maxColor = validMax;
    }

    // Convert to 565 format
    let color0 = colorTo565(maxColor);
    let color1 = colorTo565(minColor);

    // Build lookup table
    var lookupTable: u32 = 0u;
    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1000000.0;
        let pixel = getPixelComponents(pixels, i);
        
        for (var j = 0u; j < 4u; j++) {
            let paletteColor = getColor(j, maxColor, minColor);
            let distance = colorDistance(pixel.rgb, paletteColor);
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