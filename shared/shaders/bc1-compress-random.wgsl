// shared/shaders/bc1-compress-random.wgsl

struct Uniforms {
    iterations: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

var<private> seed: u32;

fn rand() -> f32 {
    seed = seed * 747796405u + 2891336453u;
    var result = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
    result = (result >> 22u) ^ result;
    return f32(result) / 4294967295.0;
}

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(color.x * 31.0) << 11u) | (u32(color.y * 63.0) << 5u) | u32(color.z * 31.0);
}

fn color565ToVec3(color: u32) -> vec3<f32> {
    return vec3<f32>(
        f32((color >> 11u) & 31u) / 31.0,
        f32((color >> 5u) & 63u) / 63.0,
        f32(color & 31u) / 31.0,
    );
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

fn calculateMSE(original: vec3<f32>, compressed: vec3<f32>) -> f32 {
    let diff = original - compressed;
    return dot(diff, diff);
}

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    var bestColor0: u32 = 0u;
    var bestColor1: u32 = 0u;
    var bestError = 1000000.0;

    for (var i = 0u; i < uniforms.iterations; i++) {
        let randomColor0 = colorTo565(vec3<f32>(rand(), rand(), rand()));
        let randomColor1 = colorTo565(vec3<f32>(rand(), rand(), rand()));
        
        // Enforce color0 > color1
        var orderedColor0 = randomColor0;
        var orderedColor1 = randomColor1;
        if (randomColor0 < randomColor1) {
            orderedColor0 = randomColor1;
            orderedColor1 = randomColor0;
        }
        
        let color0 = color565ToVec3(orderedColor0);
        let color1 = color565ToVec3(orderedColor1);
        let color2 = mix(color0, color1, 1.0 / 3.0);
        let color3 = mix(color0, color1, 2.0 / 3.0);
        
        var error = 0.0;
        for (var j = 0u; j < 16u; j++) {
            var bestPixelError = 1000000.0;
            let pixel = getPixelComponents(pixels, j);
            let rgb = vec3<f32>(pixel.x, pixel.y, pixel.z);
            
            for (var k = 0u; k < 4u; k++) {
                var compressedColor: vec3<f32>;
                switch(k) {
                    case 0u: { compressedColor = color0; }
                    case 1u: { compressedColor = color1; }
                    case 2u: { compressedColor = color2; }
                    case 3u: { 
                        // Only use color3 if color0 > color1
                        if (orderedColor0 > orderedColor1) {
                            compressedColor = color3;
                        } else {
                            // Transparent color or another logic
                            compressedColor = vec3<f32>(0.0); // Example placeholder
                        }
                    }
                    default: { compressedColor = color0; }
                }
                let pixelError = calculateMSE(rgb, compressedColor);
                bestPixelError = min(bestPixelError, pixelError);
            }
            error += bestPixelError;
        }
        
        if (error < bestError) {
            bestError = error;
            bestColor0 = orderedColor0;
            bestColor1 = orderedColor1;
        }
    }

    var lookupTable: u32 = 0u;
    let c0 = color565ToVec3(bestColor0);
    let c1 = color565ToVec3(bestColor1);

    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1000000.0;
        let pixel = getPixelComponents(pixels, i);
        let rgb = vec3<f32>(pixel.x, pixel.y, pixel.z);
        
        for (var j = 0u; j < 4u; j++) {
            var paletteColor: vec3<f32>;
            switch(j) {
                case 0u: { paletteColor = c0; }
                case 1u: { paletteColor = c1; }
                case 2u: { 
                    if (bestColor0 > bestColor1) {
                        paletteColor = mix(c0, c1, 1.0 / 3.0); 
                    } else {
                        paletteColor = vec3<f32>(0.0); // Transparent or another logic
                    }
                }
                case 3u: { 
                    if (bestColor0 > bestColor1) {
                        paletteColor = mix(c0, c1, 2.0 / 3.0); 
                    } else {
                        paletteColor = vec3<f32>(0.0); // Transparent or another logic
                    }
                }
                default: { paletteColor = c0; }
            }
            let distance = calculateMSE(rgb, paletteColor);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = j;
            }
        }
        
        lookupTable |= bestIndex << (i * 2u);
    }

    return array<u32, 2>(
        bestColor0 | (bestColor1 << 16u),
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
    
    seed = blockX + blockY * 1000u + global_id.z * 1000000u;
    
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