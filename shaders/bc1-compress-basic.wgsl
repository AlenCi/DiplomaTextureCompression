struct Uniforms {
    width: u32,
    height: u32,
    paddedWidth: u32,
    paddedHeight: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(color.r * 31.0) << 11u) | (u32(color.g * 63.0) << 5u) | u32(color.b * 31.0);
}

fn colorDistance(c1: vec3<f32>, c2: vec3<f32>) -> f32 {
    let diff = c1 - c2;
    return dot(diff, diff);
}

fn compressBlock(pixels: array<vec4<f32>, 16>) -> array<u32, 2> {
    var minColor = pixels[0].rgb;
    var maxColor = pixels[0].rgb;
    
    for (var i = 1u; i < 16u; i++) {
        if (pixels[i].a < 0.5 || all(pixels[i].rgb == vec3(0.0))) { continue; }
        
        if (colorDistance(pixels[i].rgb, minColor) > colorDistance(maxColor, minColor)) {
            maxColor = pixels[i].rgb;
        } else if (colorDistance(pixels[i].rgb, maxColor) > colorDistance(minColor, maxColor)) {
            minColor = pixels[i].rgb;
        }
    }
    
    let color0 = colorTo565(maxColor);
    let color1 = colorTo565(minColor);
    
    var lookupTable: u32 = 0u;
    let colors = array<vec3<f32>, 4>(
        maxColor,
        minColor,
        mix(maxColor, minColor, 0.3333),
        mix(maxColor, minColor, 0.6666)
    );
    
    for (var i = 0u; i < 16u; i++) {
        var bestIndex = 0u;
        var bestDistance = 1000000.0;
        
        for (var j = 0u; j < 4u; j++) {
            let distance = colorDistance(pixels[i].rgb, colors[j]);
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
    let blockX = global_id.x;
    let blockY = global_id.y;
    
    if (blockX >= uniforms.paddedWidth / 4u || blockY >= uniforms.paddedHeight / 4u) {
        return;
    }
    
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