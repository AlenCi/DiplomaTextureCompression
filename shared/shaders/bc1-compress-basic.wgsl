// shared/shaders/bc1-compress-basic.wgsl

@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(color.x * 31.0) << 11u) | (u32(color.y * 63.0) << 5u) | u32(color.z * 31.0);
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

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    let pixel0 = getPixelComponents(pixels, 0u);
    var minColor = vec3<f32>(pixel0.x, pixel0.y, pixel0.z);
    var maxColor = minColor;
    
    for (var i = 1u; i < 16u; i++) {
        let pixel = getPixelComponents(pixels, i);
        let rgb = vec3<f32>(pixel.x, pixel.y, pixel.z);
        let alpha = pixel.w;
        
        if (alpha < 0.5 || all(rgb == vec3<f32>(0.0))) { 
            continue; 
        }
        
        if (colorDistance(rgb, minColor) > colorDistance(maxColor, minColor)) {
            maxColor = rgb;
        } else if (colorDistance(rgb, maxColor) > colorDistance(minColor, maxColor)) {
            minColor = rgb;
        }
    }
    
    let color0 = colorTo565(maxColor);
    let color1 = colorTo565(minColor);
    
    var lookupTable: u32 = 0u;
    
    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1000000.0;
        let pixel = getPixelComponents(pixels, i);
        let rgb = vec3<f32>(pixel.x, pixel.y, pixel.z);
        
        for (var j = 0u; j < 4u; j++) {
            let paletteColor = getColor(j, maxColor, minColor);
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