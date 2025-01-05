struct Uniforms {
    iterations: u32,
    useMSE: u32,
    useDither: u32,
    useRefinement: u32,
};


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<u32>;

fn calculateMSE(original: vec3<f32>, compressed: vec3<f32>) -> f32 {
    let diff = original - compressed;
    return dot(diff, diff);
}

fn srgbToLinear(c: f32) -> f32 {
    return select(c / 12.92, pow((c + 0.055) / 1.055, 2.4), c > 0.04045);
}

fn rgbToXyz(rgb: vec3<f32>) -> vec3<f32> {
    let r = srgbToLinear(rgb.x);
    let g = srgbToLinear(rgb.y);
    let b = srgbToLinear(rgb.z);

    let X = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let Z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    return vec3<f32>(X, Y, Z);
}

fn fLab(t: f32) -> f32 {
    let delta = 6.0/29.0;
    if (t > delta*delta*delta) {
        return pow(t, 1.0/3.0);
    } else {
        return t/(3.0*delta*delta) + 4.0/29.0;
    }
}

fn xyzToLab(xyz: vec3<f32>) -> vec3<f32> {
    let Xn = 0.95047;
    let Yn = 1.00000;
    let Zn = 1.08883;

    let fx = fLab(xyz.x/Xn);
    let fy = fLab(xyz.y/Yn);
    let fz = fLab(xyz.z/Zn);

    let L = 116.0*fy - 16.0;
    let a = 500.0*(fx - fy);
    let b = 200.0*(fy - fz);
    return vec3<f32>(L, a, b);
}

fn cieDeltaE2000(lab1: vec3<f32>, lab2: vec3<f32>) -> f32 {
    let L1 = lab1.x; let a1 = lab1.y; let b1 = lab1.z;
    let L2 = lab2.x; let a2 = lab2.y; let b2 = lab2.z;

    let avgL = (L1 + L2) * 0.5;
    let C1 = sqrt(a1*a1 + b1*b1);
    let C2 = sqrt(a2*a2 + b2*b2);
    let avgC = (C1 + C2)*0.5;

    let G = 0.5 * (1.0 - sqrt((pow(avgC,7.0) / (pow(avgC,7.0) + pow(25.0,7.0)))));
    let a1p = (1.0 + G)*a1;
    let a2p = (1.0 + G)*a2;
    let C1p = sqrt(a1p*a1p + b1*b1);
    let C2p = sqrt(a2p*a2p + b2*b2);

    let avgCp = (C1p + C2p)*0.5;

    let h1p = hueAngle(a1p, b1);
    let h2p = hueAngle(a2p, b2);
    let dHp = hueDifference(h1p, h2p, C1p, C2p);
    let avgHp = averageHue(h1p, h2p, C1p, C2p);

    let T = 1.0 - 0.17*cos(radians(avgHp-30.0)) + 0.24*cos(radians(2.0*avgHp)) + 0.32*cos(radians(3.0*avgHp+6.0)) - 0.20*cos(radians(4.0*avgHp-63.0));
    let deltaLp = L2 - L1;
    let deltaCp = C2p - C1p;
    let deltaHp = 2.0*sqrt(C1p*C2p)*sin(radians(dHp*0.5));

    let Sl = 1.0 + (0.015*(avgL-50.0)*(avgL-50.0))/sqrt(20.0+(avgL-50.0)*(avgL-50.0));
    let Sc = 1.0 + 0.045*avgCp;
    let Sh = 1.0 + 0.015*avgCp*T;

    let deltaTheta = 30.0*exp(-((avgHp-275.0)/25.0)*((avgHp-275.0)/25.0));
    let Rc = 2.0*sqrt((pow(avgCp,7.0)/(pow(avgCp,7.0) + pow(25.0,7.0))));
    let Rt = -Rc*sin(radians(2.0*deltaTheta));

    let termL = deltaLp / (Sl);
    let termC = deltaCp / (Sc);
    let termH = deltaHp / (Sh);

    let deltaE = sqrt(termL*termL + termC*termC + termH*termH + Rt*termC*termH);
    return deltaE;
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


fn hueAngle(a: f32, b: f32) -> f32 {
    let h = degrees(atan2(b, a));
    return select(h, h+360.0, h < 0.0);
}

fn hueDifference(h1: f32, h2: f32, C1p: f32, C2p: f32) -> f32 {
    if (C1p*C2p == 0.0) {
        return 0.0;
    }
    let diff = abs(h1 - h2);
    if (diff <= 180.0) {
        return h2 - h1;
    }
    return select(h2 - h1 + 360.0, h2 - h1 - 360.0, h2 <= h1);
}

fn averageHue(h1: f32, h2: f32, C1p: f32, C2p: f32) -> f32 {
    if (C1p*C2p == 0.0) {
        return h1+h2;
    }
    let diff = abs(h1 - h2);
    if (diff <= 180.0) {
        return (h1+h2)*0.5;
    }
    return select((h1+h2+360.0)*0.5, (h1+h2-360.0)*0.5, h1+h2<360.0);
}

fn calculateError(c1: vec3<f32>, c2: vec3<f32>) -> f32 {
    if (uniforms.useMSE == 1u) {
        return calculateMSE(c1, c2);
    } else {
        let lab1 = xyzToLab(rgbToXyz(c1));
        let lab2 = xyzToLab(rgbToXyz(c2));
        return cieDeltaE2000(lab1, lab2);
    }
}

fn colorTo565(color: vec3<f32>) -> u32 {
    return (u32(clamp(color.x*31.0,0.0,31.0)) << 11u) | (u32(clamp(color.y*63.0,0.0,63.0)) << 5u) | u32(clamp(color.z*31.0,0.0,31.0));
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
fn expand565ToFloat(c: u32) -> vec3<f32> {
    let r = f32((c >> 11u) & 31u) / 31.0;
    let g = f32((c >> 5u)  & 63u) / 63.0;
    let b = f32( c         & 31u) / 31.0;
    return vec3<f32>(r, g, b);
}

fn compressBlockCluster(pixels: array<vec4<f32>,16>) -> array<u32,2> {
    let ditheredPixels = applyDithering(pixels);
    var rgbPixels: array<vec3<f32>,16>;
    var validMin = vec3<f32>(1.0);
    var validMax = vec3<f32>(0.0);

    for (var i = 0u; i < 16u; i++) {
        let p = getPixelComponents(ditheredPixels, i).rgb;
        rgbPixels[i] = p;
        validMin = min(validMin, p);
        validMax = max(validMax, p);
    }

    var colorA = validMin;
    var colorB = validMax;

    let iterations = 10u;
    for (var iter = 0u; iter < iterations; iter++) {
        var clusterA: array<vec3<f32>,16>;
        var clusterB: array<vec3<f32>,16>;
        var countA = 0u;
        var countB = 0u;

        for (var i = 0u; i < 16u; i++) {
            let p = rgbPixels[i];
            let dA = calculateError(p, colorA);
            let dB = calculateError(p, colorB);
            if (dA < dB) {
                clusterA[countA] = p;
                countA++;
            } else {
                clusterB[countB] = p;
                countB++;
            }
        }

        if (countA > 0u) {
            var sumA = vec3<f32>(0.0);
            for (var i = 0u; i < countA; i++) {
                sumA += clusterA[i];
            }
            colorA = sumA / f32(countA);
        }

        if (countB > 0u) {
            var sumB = vec3<f32>(0.0);
            for (var i = 0u; i < countB; i++) {
                sumB += clusterB[i];
            }
            colorB = sumB / f32(countB);
        }
    }

    // Convert to 565 format
    var color0 = colorTo565(colorA);
    var color1 = colorTo565(colorB);

    // Order the colors properly
    if (color0 <= color1) {
        let temp = color0;
        color0 = color1;
        color1 = temp;
    }

    // Generate palette using the quantized colors
    var palette: array<vec3<f32>,4>;
    let c0f = expand565ToFloat(color0);
    let c1f = expand565ToFloat(color1);
    palette[0] = c0f;
    palette[1] = c1f;
    palette[2] = mix(c0f, c1f, 0.3333);
    palette[3] = mix(c0f, c1f, 0.6666);

    // Build lookup table
    var lookupTable: u32 = 0u;
    for (var i = 0u; i < 16u; i++) {
        let p = rgbPixels[i];
        var bestIndex = 0u;
        var bestDistance = 1e9;
        for (var j = 0u; j < 4u; j++) {
            let d = calculateError(p, palette[j]);
            if (d < bestDistance) {
                bestDistance = d;
                bestIndex = j;
            }
        }
        lookupTable |= bestIndex << (i*2u);
    }

    return array<u32,2>(
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

    var pixels: array<vec4<f32>,16>;
    for (var y = 0u; y < 4u; y++) {
        for (var x = 0u; x < 4u; x++) {
            let pixelX = blockX * 4u + x;
            let pixelY = blockY * 4u + y;
            let pixel_index = y * 4u + x;

            if (pixelX < width && pixelY < height) {
                pixels[pixel_index] = textureLoad(inputTexture, vec2<i32>(i32(pixelX), i32(pixelY)), 0);
            } else {
                pixels[pixel_index] = vec4<f32>(0.0,0.0,0.0,1.0);
            }
        }
    }

    let compressedBlock = compressBlockCluster(pixels);
    let outputIndex = (blockY * (paddedWidth / 4u) + blockX) * 2u;
    outputBuffer[outputIndex] = compressedBlock[0];
    outputBuffer[outputIndex + 1u] = compressedBlock[1];
}