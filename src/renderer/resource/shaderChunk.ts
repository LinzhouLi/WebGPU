
// structue definition

const Camera = /* wgsl */`
struct Camera {
  position: vec3<f32>,
  viewMat: mat4x4<f32>,
  projectionMat: mat4x4<f32>
}
`;

const PointLight = /* wgsl */`
struct PointLight {
  position: vec3<f32>,
  color: vec3<f32>,
  viewProjectionMat: mat4x4<f32>
}
`;

const DirectionalLight = /* wgsl */`
struct DirectionalLight {
  direction: vec3<f32>,
  color: vec3<f32>,
  viewProjectionMat: mat4x4<f32>
}
`;

const PBRMaterial = /* wgsl */`
struct PBRMaterial {
  roughness: f32,       // [0, 1]
  metalness: f32,       // {0, 1}
  albedo: vec3<f32>,    // diffuse color 
  specular: vec3<f32>   // F0: normal-incidence Fresnel reflectance
}
`;

const Transform = /* wgsl */`
struct Transform {
  modelMat: mat4x4<f32>,
  normalMat : mat3x3<f32>
};
`;

const SkinnedTransform = /* wgsl */`
struct SkinnedTransform {
  bindMat: mat4x4<f32>,
  bindMatInverse: mat4x4<f32>,
  modelMat: mat4x4<f32>,
  normalMat : mat3x3<f32>
};
`;

const Definitions = { Camera, PointLight, DirectionalLight, PBRMaterial, Transform, SkinnedTransform };


// constants

const Constants = /* wgsl */`
const EPS = 1e-5;
const PI = 3.141592653589793;
const PI_twice = 6.283185307179586;
`;


// tool functions

const Random = /* wgsl */`
fn rand(uv: vec2<f32>) -> f32 {  // 0 - 1
	const a: f32 = 12.9898; const b: f32 = 78.233; const c: f32 = 43758.5453;
	let dt: f32 = dot( uv, vec2<f32>(a, b) ); 
  let sn: f32 = dt - PI * floor(dt / PI); // mod
	return fract(sin(sn) * c);
}
`;

const Lerp = /* wgsl */`
fn lerp(a: f32, b: f32, s: f32) -> f32 {
  return fma(a, 1.0 - s, b * s);
}

fn lerp_vec3(a: vec3<f32>, b: vec3<f32>, s: f32) -> vec3<f32> {
  return fma(a, vec3<f32>(1.0 - s), b * s);
}

fn lerp_vec4(a: vec4<f32>, b: vec4<f32>, s: f32) -> vec4<f32> {
  return fma(a, vec4<f32>(1.0 - s), b * s);
}
`;

const Mod = /* wgsl */`
fn get_mod(x: f32, y:f32) -> f32 {
  return (x - y * floor(x / y));
}
`;

const SampleTexture = /* wgsl */`
fn bilinearSampleCubeTexture(texture: texture_2d_array<f32>, coord: vec3<f32>) -> vec4<f32> {
  // see Real-Time Rendering (4th) 6.2.4
  let textureWidth = textureDimensions(texture).x;
  var face: i32;
  var ifNegative: i32 = 0;
  var uv: vec2<f32>;
  let absCoord = abs(coord);
  if (absCoord.x > absCoord.y) {
    if (absCoord.z > absCoord.x) { face = 2; uv = vec2<f32>(coord.x, -coord.y); }
    else { face = 0; uv = -coord.zy; }
  } else {
    if (absCoord.z > absCoord.y) { face = 2; uv = vec2<f32>(coord.x, -coord.y); }
    else { face = 1; uv = coord.xz; } 
  }
  if (coord[face] < 0) { 
    ifNegative = 1;
    if (face == 0) { uv.x = -uv.x; }
    if (face == 1) { uv.y = -uv.y; }
    if (face == 2) { uv.x = -uv.x; }
  }
  uv = (uv / absCoord[face] + 1.0) * 0.5;
  face = face * 2 + ifNegative;
  
  uv = clamp(
    uv * vec2<f32>(f32(textureWidth)),
    vec2<f32>(0.0), vec2<f32>(f32(textureWidth - 1))
  );
  var x: vec4<f32>; var y: vec4<f32>;
  x = textureLoad(texture, vec2<i32>(uv) + vec2<i32>(0, 0), face, 0);
  y = textureLoad(texture, vec2<i32>(uv) + vec2<i32>(0, 1), face, 0);
  let p = lerp_vec4(x, y, fract(uv.y));
  x = textureLoad(texture, vec2<i32>(uv) + vec2<i32>(1, 0), face, 0);
  y = textureLoad(texture, vec2<i32>(uv) + vec2<i32>(1, 1), face, 0);
  let q = lerp_vec4(x, y, fract(uv.y));
  return lerp_vec4(p, q, fract(uv.x));
}

fn bilinearSampleTexture(texture: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
  let textureSize = textureDimensions(texture);
  let coord = clamp(
    uv * vec2<f32>(textureSize),
    vec2<f32>(0.0), vec2<f32>(textureSize - 1)
  );
  var x: vec4<f32>; var y: vec4<f32>;
  x = textureLoad(texture, vec2<i32>(coord) + vec2<i32>(0, 0), 0);
  y = textureLoad(texture, vec2<i32>(coord) + vec2<i32>(0, 1), 0);
  let p = lerp_vec4(x, y, fract(coord.y));
  x = textureLoad(texture, vec2<i32>(coord) + vec2<i32>(1, 0), 0);
  y = textureLoad(texture, vec2<i32>(coord) + vec2<i32>(1, 1), 0);
  let q = lerp_vec4(x, y, fract(coord.y));
  return lerp_vec4(p, q, fract(coord.x));
}

fn linearSampleTexture(texture: texture_1d<f32>, u: f32) -> vec4<f32> {
  let textureSize = textureDimensions(texture);
  let coord = clamp(u * f32(textureSize), 0.0, f32(textureSize - 1));
  let x = textureLoad(texture, i32(coord) + 0, 0);
  let y = textureLoad(texture, i32(coord) + 1, 0);
  return lerp_vec4(x, y, fract(coord));
}
`;

const ToolFunction = { Random, Lerp, Mod, SampleTexture };

// sampling

const RadicalInverse = /* wgsl */`
fn RadicalInverse(x: u32, base: u32) -> f32 {
  var numPoints: f32 = 1.0;
  var inverse: u32;
  var i: u32 = x;
	for(inverse = 0; i > 0; i = i / base) {
		inverse = inverse * base + (i % base);
		numPoints = numPoints * f32(base);
	}
	return f32(inverse) / numPoints;
}
`;

const Hammersley = /* wgsl */`
fn Hammersley(i: u32, N: u32) -> vec2<f32> { // return the i-th uniform 2D sample while the sample count is N
  return vec2<f32>(f32(i) / f32(N), RadicalInverse(i, 2)); // result in [0, 1]^2
}
`;

const SampleDisk = /* wgsl */`
fn sampleDisk(sample2D: vec2<f32>) -> vec2<f32> {
  let p = 2.0 * sample2D - 1.0;
  var r: f32; var theta: f32;
  if (abs(p.x) > abs(p.y)) {
    r = p.x;
    theta = 0.25 * PI * p.y / p.x;
  } else {
    r = p.y;
    theta = PI * (0.5 - 0.25 * p.x / p.y);
  }
  return r * vec2<f32>(cos(theta), sin(theta));
}
`;

const HemisphereCosine = /* wgsl */`
fn hemisphereSampleCosine(sample2D: vec2<f32>) -> vec3<f32> {
  let r = sampleDisk(sample2D);
  let h = sqrt(max(0.0, 1.0 - r.x * r.x - r.y * r.y));
  return vec3<f32>(r.x, h, r.y);
}
`;

const HemisphereUniform = /* wgsl */`
fn hemisphereSampleUniform(sample2D: vec2<f32>) -> vec3<f32> {
  let phi = sample2D.x * PI_twice;
  let cosTheta = 1.0 - sample2D.y;
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  return vec3<f32>(cos(phi) * sinTheta, cosTheta, sin(phi) * sinTheta);
}
`;

const GGXImportance = /* wgsl */`
fn GGXImportanceSample(sample2D: vec2<f32>, alpha: f32) -> vec3<f32> {
  let alpha2 = alpha * alpha;
  let phi = sample2D.x * PI_twice;
  let cosTheta = sqrt((1.0 - sample2D.y) / (sample2D.y * (alpha2 - 1.0) + 1.0));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  return normalize(vec3<f32>(cos(phi) * sinTheta, cosTheta, sin(phi) * sinTheta));
}
`;

const Sampling = { 
  RadicalInverse, Hammersley, SampleDisk,
  HemisphereCosine, HemisphereUniform, GGXImportance 
};


// shadow

const hardShadow = /* wgsl */`
const SHADOW_BIAS = 1e-4;

fn hardShadow(
  uv: vec2<f32>, depth: f32, 
  shadowMap: texture_depth_2d, 
  shadowMapSampler: sampler_comparison
) -> f32 {

  var visibility = textureSampleCompare( // Must only be invoked in uniform control flow.
    shadowMap,
    shadowMapSampler,
    uv,
    depth - SHADOW_BIAS
  );
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { visibility = 1.0; }
  return visibility;

}
`;

const PCF = /* wgsl */`
const PCF_SMAPLE_NUM: i32 = 16;
const POISSON_DISK_SAMPLES: array<vec2<f32>, 16> = array(
  vec2<f32>(-0.94201624, -0.39906216),  vec2<f32>(0.94558609, -0.76890725),
  vec2<f32>(-0.094184101, -0.92938870), vec2<f32>(0.34495938, 0.29387760),
  vec2<f32>(-0.91588581, 0.45771432),   vec2<f32>(-0.81544232, -0.87912464),
  vec2<f32>(-0.38277543, 0.27676845),   vec2<f32>(0.97484398, 0.75648379),
  vec2<f32>(0.44323325, -0.97511554),   vec2<f32>(0.53742981, -0.47373420),
  vec2<f32>(-0.26496911, -0.41893023),  vec2<f32>(0.79197514, 0.19090188),
  vec2<f32>(-0.24188840, 0.99706507),   vec2<f32>(-0.81409955, 0.91437590),
  vec2<f32>(0.19984126, 0.78641367),    vec2<f32>(0.14383161, -0.14100790)
);

fn PCF(
  uv: vec2<f32>, depth: f32,
  radius: f32, 
  shadowMap: texture_depth_2d, 
  shadowMapSampler: sampler_comparison
) -> f32 {

  let rot_theta: f32 = rand(uv);
  let sin_theta: f32 = sin(rot_theta); let cos_theta: f32 = cos(rot_theta);
  let rot_mat: mat2x2<f32> = mat2x2<f32>(cos_theta, sin_theta, -sin_theta, cos_theta);

  var sum: f32 = 0;
  let radius_tex: f32 = radius / f32(textureDimensions(shadowMap).x);
  for (var i : i32 = 0 ; i < PCF_SMAPLE_NUM ; i = i + 1) {
    sum = sum + hardShadow(
      uv + radius_tex * rot_mat * POISSON_DISK_SAMPLES[i], depth,
      shadowMap, shadowMapSampler
    );
  }
  return sum / f32(PCF_SMAPLE_NUM);

}
`;

const Shadow = { hardShadow, PCF };


// PBR Shading

const NDF = /* wgsl */`
fn NDF_GGX(alpha: f32, NoH: f32) -> f32 { // normal distribution function (GGX)
  // let alpha2 = alpha * alpha;
  // let d = NoH * (NoH * alpha2 - NoH) + 1.0;
  // return alpha2 / (PI * d * d);
  let a2     = alpha*alpha;
  let NdotH  = max(NoH, 0.0);
  let NdotH2 = NdotH*NdotH;

  let num   = a2;
  var denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / denom;
}
`;

const Fresnel = /* wgsl */`
fn computeFc(VoH: f32) -> f32 {
  let v = 1.0 - VoH;
  let v2 = v * v;
  return v2 * v2 * v;
}

fn computeFc_approx(VoH: f32) -> f32 {
  return exp2((-5.55473 * VoH - 6.98316) * VoH);
}

fn Fresnel_Schlick(F0: vec3<f32>, VoH: f32) -> vec3<f32> { // Fresnel reflectance (Schlick approximation)
  let Fc = computeFc_approx(VoH);
  return saturate(50.0 * F0.g) * Fc + (1.0 - Fc) * F0; // Anything less than 2% is physically impossible 
}                                                      // and is instead considered to be shadowing
`;

const Geometry = /* wgsl */`
fn G2_Smith(alpha: f32, NoL: f32, NoV: f32) -> f32 {
  let alpha2 = alpha * alpha;
  let GGXL = NoV * sqrt((-NoL * alpha2 + NoL) * NoL + alpha2);
  let GGXV = NoL * sqrt((-NoV * alpha2 + NoV) * NoV + alpha2);
  return 0.5 / (GGXL + GGXV + EPS);
}

fn G2_Smith_approx(alpha: f32, NoL: f32, NoV: f32) -> f32 {          // an approximation of (the height-correlated Smith G2 function
  return 0.5 / (lerp(2 * NoL * NoV, NoL + NoV, alpha) + EPS); // combined with the denominator of specular BRDF)
}
`;

const MultiBounce = /* wgsl */`
fn multiBounce(F0: vec3<f32>, roughness: f32, NoL: f32, NoV: f32) -> vec3<f32> {
  let Favg = (20.0 * F0 + 1.0) / 21.0;
  let oneMinusFavg = vec3<f32>(1.0) - Favg;
  let Eavg = linearSampleTexture(Eavg, roughness).x;
  let oneMinusEavg = 1.0 - Eavg;
  let EmuL = bilinearSampleTexture(Emu, vec2<f32>(roughness, NoL)).x;
  let EmuV = bilinearSampleTexture(Emu, vec2<f32>(roughness, NoV)).x;
  let oneMinusEmuL = 1.0 - EmuL;
  let oneMinusEmuV = 1.0 - EmuV;
  let fms = oneMinusEmuL * oneMinusEmuV / (PI * oneMinusEavg);
  let fadd =  Favg * Eavg / (vec3<f32>(1.0) - Favg * oneMinusEavg);
  return fms * fadd;
}
`;

const PBRShading = /* wgsl */`
fn PBRShading(
  N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, 
  material: PBRMaterial, 
  radiance: vec3<f32>
) -> vec3<f32> {

  let H = normalize(V + L);
  let NoV = saturate(dot(N, V));
  let NoL = saturate(dot(N, L));
  let NoH = saturate(dot(N, H));
  let VoH = saturate(dot(V, H));

  let alpha = material.roughness * material.roughness;
  let F0 = lerp_vec3(vec3<f32>(0.04), material.albedo, material.metalness);

  let G = G2_Smith_approx(alpha, NoL, NoV);
  let D = NDF_GGX(alpha, NoH);
  let F = Fresnel_Schlick(F0, VoH);
  let dfg = bilinearSampleTexture(DFG, vec2<f32>(material.roughness, NoV)).xy;
  let energyCompensation = 1.0 + F0 * (1 / dfg.y - 1.0);
  let specular = G * D * F * energyCompensation;
  let diffuse = material.albedo * (1.0 - F) * (1.0 - material.metalness) / PI;

  return PI * (specular + diffuse) * radiance * NoL;

}
`;

const PBREnvShading = /* wgsl */`
fn PBREnvShading(
  N: vec3<f32>, V: vec3<f32>, 
  material: PBRMaterial
) -> vec3<f32> {

  let NoV = saturate(dot(N, V));
  let F0 = lerp_vec3(vec3<f32>(0.04), material.albedo, material.metalness);
  let F = F0 + (max(vec3<f32>(1.0 - material.roughness), F0) - F0) * computeFc_approx(NoV);

  let irradiance = textureSample(diffuseEnvMap, linearSampler, N).xyz;
  let diffuse = material.albedo * irradiance * (1.0 - F) * (1.0 - material.metalness);

  let L = reflect(-V, N);
  let mipCount = f32(textureNumLevels(envMap));
  let prefilterEnv = textureSampleLevel(envMap, linearSampler, L, material.roughness * mipCount).xyz;
  let dfg = bilinearSampleTexture(DFG, vec2<f32>(material.roughness, NoV)).xy;
  var specular = mix(dfg.xxx, dfg.yyy, F0) * (1.0 + F0 * (1 / dfg.y - 1.0)) * prefilterEnv;

  return (diffuse + specular);

}
`;

const PBR = { NDF, Geometry, Fresnel, MultiBounce, PBRShading, PBREnvShading };


// Blinn Phong

const PhongShading = /* wgsl */`
fn PhongShading(
  N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, 
  material: PBRMaterial, 
  radiance: vec3<f32>
) -> vec3<f32> {

  let H = normalize(V + L);

  let diffuse = saturate(dot(N, L));
  let alpha = exp2(10.0 - 10.0 * material.roughness);
  let specular = pow(saturate(dot(N, H)), alpha);

  return (diffuse + specular) * radiance * material.albedo;

}
`

const PhongEnvShading = /* wgsl */`
fn PhongEnvShading(
  N: vec3<f32>, V: vec3<f32>,
  material: PBRMaterial
) -> vec3<f32> {

  let ambient = 0.2;
  // let irradiance = textureSample(diffuseEnvMap, linearSampler, N).xyz;

  return ambient * material.albedo;

}
`

const Phong = { PhongShading, PhongEnvShading };


// color management

const sRGBGammaEncode = /* wgsl */`
fn sRGBGammaEncode(color: vec3<f32>) -> vec3<f32> {
  return pow(color, vec3<f32>(0.454545));  // 1 / 2.2
}
`;

const sRGBGammaDecode = /* wgsl */`
fn sRGBGammaDecode(color: vec3<f32>) -> vec3<f32> {
  return pow(color, vec3<f32>(2.2));
}
`;

const ACESToneMapping = /* wgsl */`
// ACES Tone Mapping, see https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
const ACESInputMat = mat3x3<f32>(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);

const ACESOutputMat = mat3x3<f32>(
  1.604750, -0.10208, -0.00327,
  -0.53108, 1.108130, -0.07276,
  -0.07367, -0.00605, 1.076020
);

fn RRTAndODTFit(v: vec3<f32>) -> vec3<f32> {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

fn ACESToneMapping(color: vec3<f32>) -> vec3<f32> {
  var color_: vec3<f32> = ACESInputMat * color;   // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
  color_ = RRTAndODTFit(color_);                  // Apply RRT and ODT
  color_ = ACESOutputMat * color_;                // ODT_SAT => XYZ => D60_2_D65 => sRGB
  return saturate(color_);
}
`;

const ColorManagement = { sRGBGammaEncode, sRGBGammaDecode, ACESToneMapping };


// animation

const Matrices = /* wgsl */`
fn getSkinningMatrices(skinIndex: vec4<u32>) -> array<mat4x4<f32>, 4> {
  return array<mat4x4<f32>, 4>(
    boneMatrices[skinIndex.x], boneMatrices[skinIndex.y],
    boneMatrices[skinIndex.z], boneMatrices[skinIndex.w]
  );
}
`;

const InstanceMatrices = /* wgsl */`
fn getSkinningMatrices(
  skinIndex: vec4<u32>, 
  animationIndex: u32,
  frameIndex: u32
) -> array<mat4x4<f32>, 4> {
  let offset = (u32(animationInfo.frameOffsets[animationIndex]) + frameIndex) * u32(animationInfo.boneCount);
  return array<mat4x4<f32>, 4>(
    animationBuffer[skinIndex.x + offset], animationBuffer[skinIndex.y + offset],
    animationBuffer[skinIndex.z + offset], animationBuffer[skinIndex.w + offset]
  );
}
`;

const SkinningPostion = /* wgsl */`
fn skinning(
  position: vec3<f32>,
  skinningMatrices: array<mat4x4<f32>, 4>,
  skinWeight: vec4<f32>,
  bindMat: mat4x4<f32>,
  bindMatInverse: mat4x4<f32>
) -> vec4<f32> {
  let positionSkin = bindMat * vec4<f32>(position, 1.0);
  var result = skinningMatrices[0] * positionSkin * skinWeight[0];
  result = result + skinningMatrices[1] * positionSkin * skinWeight[1];
  result = result + skinningMatrices[2] * positionSkin * skinWeight[2];
  result = result + skinningMatrices[3] * positionSkin * skinWeight[3];
  return bindMatInverse * result;
}
`;

const SkinningNormalMat = /* wgsl */`
fn getSkinningNormalMat(
  skinningMatrices: array<mat4x4<f32>, 4>,
  skinWeight: vec4<f32>,
  bindMat: mat4x4<f32>,
  bindMatInverse: mat4x4<f32>
) -> mat4x4<f32> {
  var result = skinningMatrices[0] * skinWeight[0];
  result = result + skinningMatrices[1] * skinWeight[1];
  result = result + skinningMatrices[2] * skinWeight[2];
  result = result + skinningMatrices[3] * skinWeight[3];
  return bindMatInverse * result * bindMat;
}
`;

const Skinning = { Matrices, SkinningPostion, InstanceMatrices, SkinningNormalMat };


export { 
  Definitions, Constants, 
  ToolFunction, Sampling,
  Shadow, PBR, Phong, 
  ColorManagement,
  Skinning
};