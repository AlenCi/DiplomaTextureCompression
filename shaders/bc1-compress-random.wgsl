struct Uniforms {
    width: u32,
    height: u32,
    iterations: u32,
    paddedWidth: u32,
    paddedHeight: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

// Random number generator
var<private> seed: u32;

fn rand() -> f32 {
    seed = seed * 747796405u + 2891336453u;
    var result = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
    result = (result >> 22u) ^ result;
    return f32(result) / 4294967295.0;
}

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(color.r * 31.0) << 11u) | (u32(color.g * 63.0) << 5u) | u32(color.b * 31.0);
}

fn color565ToVec3(color: u32) -> vec3<f32> {
    return vec3<f32>(
        f32((color >> 11u) & 31u) / 31.0,
        f32((color >> 5u) & 63u) / 63.0,
        f32(color & 31u) / 31.0
    );
}

fn calculateMSE(original: vec3<f32>, compressed: vec3<f32>) -> f32 {
    let diff = original - compressed;
    return dot(diff, diff);
}

fn calculateMAD(original: vec3<f32>, compressed: vec3<f32>) -> f32 {
    return abs(original.r - compressed.r) + abs(original.g - compressed.g) + abs(original.b - compressed.b);
}

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    var bestColor0: u32 = 0u;
    var bestColor1: u32 = 0u;
    var bestError = 1000000.0;

    for (var i = 0u; i < uniforms.iterations; i++) {
        let randomColor0 = colorTo565(vec3<f32>(rand(), rand(), rand()));
        let randomColor1 = colorTo565(vec3<f32>(rand(), rand(), rand()));
        
        let color0 = color565ToVec3(randomColor0);
        let color1 = color565ToVec3(randomColor1);
        let color2 = mix(color0, color1, 1.0 / 3.0);
        let color3 = mix(color0, color1, 2.0 / 3.0);
        
        var error = 0.0;
        for (var j = 0u; j < 16u; j++) {
            var bestPixelError = 1000000.0;
            for (var k = 0u; k < 4u; k++) {
                let compressedColor = select(color0, select(color1, select(color2, color3, k == 3u), k == 2u), k == 1u);
                let pixelError = calculateMSE(pixels[j].rgb, compressedColor);
                bestPixelError = min(bestPixelError, pixelError);
            }
            error += bestPixelError;
        }
        
        if (error < bestError) {
            bestError = error;
            bestColor0 = randomColor0;
            bestColor1 = randomColor1;
        }
    }

    var lookupTable: u32 = 0u;
    let colors = array<vec3<f32>, 4>(
        color565ToVec3(bestColor0),
        color565ToVec3(bestColor1),
        mix(color565ToVec3(bestColor0), color565ToVec3(bestColor1), 1.0 / 3.0),
        mix(color565ToVec3(bestColor0), color565ToVec3(bestColor1), 2.0 / 3.0)
    );

    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1000000.0;
        
        for (var j = 0u; j < 4u; j++) {
            let distance = calculateMSE(pixels[i].rgb, colors[j]);
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
    let blockX = global_id.x;
    let blockY = global_id.y;
    
    if (blockX >= uniforms.paddedWidth / 4u || blockY >= uniforms.paddedHeight / 4u) {
        return;
    }
    
    
    seed = blockX + blockY * 1000u + global_id.z * 1000000u;
    
    var pixels: array<vec4<f32>, 16>;
    
    for (var y = 0u; y < 4u; y++) {
        for (var x = 0u; x < 4u; x++) {
            let pixelX = blockX * 4u + x;
            let pixelY = blockY * 4u + y;
            
            if (pixelX < uniforms.width && pixelY < uniforms.height) {
                pixels[y * 4u + x] = textureLoad(inputTexture, vec2<i32>(i32(pixelX), i32(pixelY)), 0);
            } else {
                pixels[y * 4u + x] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
            }
        }
    }
    
    let compressedBlock = compressBlock(pixels);
    let outputIndex = (blockY * (uniforms.paddedWidth / 4u) + blockX) * 2u;
    
    outputBuffer[outputIndex] = compressedBlock[0];
    outputBuffer[outputIndex + 1u] = compressedBlock[1];
}