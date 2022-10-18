import { wgsl } from '../../../3rd-party/wgsl-preprocessor';

export function createFragmentShader(attributes: string[], type: string = 'phong') {

  const normalMap = attributes.includes('tangent') && attributes.includes('normalMap');

  const baseMap = attributes.includes('baseMap');
  const roughnessMap = attributes.includes('roughnessMap');
  const metalnessMap = attributes.includes('metalnessMap');
  const specularMap = attributes.includes('specularMap');

  const pointLight = attributes.includes('pointLight');

  let code: string;

  if (type === 'phong') {
    code = wgsl
/* wgsl */`
struct Camera {
  position: vec3<f32>,
  viewMat: mat4x4<f32>,
  projectionMat: mat4x4<f32>
}

struct PointLight {
  position: vec3<f32>,
  color: vec3<f32>,
  viewProjectionMat: mat4x4<f32>
}

struct DirectionalLight {
  direction: vec3<f32>,
  color: vec3<f32>,
  viewProjectionMat: mat4x4<f32>
}

struct PBRMaterial {
  roughness: f32,       // [0, 1]
  metalness: f32,       // {0, 1}
  albedo: vec3<f32>,    // diffuse color 
  specular: vec3<f32>   // F0: normal-incidence Fresnel reflectance
}

@group(0) @binding(0) var<uniform> camera: Camera;
#if ${pointLight}
@group(0) @binding(1) var<uniform> light: PointLight;
#else
@group(0) @binding(1) var<uniform> light: DirectionalLight;
#endif
@group(0) @binding(2) var shadowMapSampler: sampler_comparison;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var shadowMap: texture_depth_2d;

@group(0) @binding(6) var<uniform> material: PBRMaterial;
#if ${baseMap}
@group(0) @binding(7) var baseMap: texture_2d<f32>;
#endif
#if ${normalMap}
@group(0) @binding(8) var normalMap: texture_2d<f32>;
#endif

const bias = 1e-4;
const eps = 1e-5;

const PI: f32 = 3.141592653589793;
const SMAPLE_NUM: i32 = 16;
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


fn rand(uv: vec2<f32>) -> f32 {  // 0 - 1
	const a: f32 = 12.9898; const b: f32 = 78.233; const c: f32 = 43758.5453;
	let dt: f32 = dot( uv, vec2<f32>(a, b) ); 
  let sn: f32 = dt - PI * floor(dt / PI); // mod
	return fract(sin(sn) * c);
}

fn lerp(a: f32, b: f32, s: f32) -> f32 {
  return a * (1.0 - s) + b * s;
}

fn lerp_vec3(a: vec3<f32>, b: vec3<f32>, s: f32) -> vec3<f32> {
  return vec3<f32>(lerp(a.x, b.x, s), lerp(a.y, b.y, s), lerp(a.z, b.z, s));
}

fn pow5(x: f32) -> f32 {
  let y = 1.0 - x;
  return pow(2, (-5.55473 * y - 6.98316) * y);
}

fn NDF_GGX(alpha: f32, NoH: f32) -> f32 { // normal distribution function (GGX)
  let NoH_ = saturate(NoH);
  let alpha2 = alpha * alpha;
  let d = NoH_ * NoH_ * (alpha2 - 1.0) + 1.0;
  return alpha2 / (PI * d * d);
}

fn Fresnel(F0: vec3<f32>, VoH: f32) -> vec3<f32> { // Fresnel reflectance (Schlick approximation)
  let VoH_ = saturate(VoH);
  let Fc = pow5(1 - VoH_);
  return saturate(50.0 * F0.g) * Fc + (1.0 - Fc) * F0;
}

fn G2_with_denom(alpha: f32, NoL: f32, NoV: f32) -> f32 {
  let NoL_ = abs(NoL);
  let NoV_ = abs(NoV);
  return 0.5 / (lerp(2 * NoL_ * NoV_, NoL_ + NoV_, alpha) + eps);
}

fn PBR(
  N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, 
  material: PBRMaterial, 
  radiance: vec3<f32>
) -> vec3<f32> {

  let H = normalize(V + L);
  let NoV = dot(N, V);
  let NoL = dot(N, L);
  let NoH = dot(N, H);
  let VoH = dot(V, H);
  let alpha = material.roughness * material.roughness;

  let F0 = lerp_vec3(vec3<f32>(0.04), material.albedo, material.metalness);

  let G = G2_with_denom(alpha, NoL, NoV);
  let D = NDF_GGX(alpha, NoH);
  let F = Fresnel(F0, VoH);
  let specular = G * D * F;

  let diffuse = material.albedo / PI * (1.0 - F) * (1.0 - material.metalness);

  return PI * (specular + diffuse) * radiance * saturate(NoL);

}

fn hardShadow(uv: vec2<f32>, depth: f32) -> f32 {

  var visibility = textureSampleCompare( // Must only be invoked in uniform control flow.
    shadowMap,
    shadowMapSampler,
    uv,
    depth - bias
  );
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { visibility = 1.0; }
  return visibility;

}

fn PCF(radius: f32, shadowCoords: vec3<f32>) -> f32 {

  let rot_theta: f32 = rand(shadowCoords.xy);
  let sin_theta: f32 = sin(rot_theta); let cos_theta: f32 = cos(rot_theta);
  let rot_mat: mat2x2<f32> = mat2x2<f32>(cos_theta, sin_theta, -sin_theta, cos_theta);

  var sum: f32 = 0;
  let radius_tex: f32 = radius / f32(textureDimensions(shadowMap).x);
  for (var i : i32 = 0 ; i < SMAPLE_NUM ; i = i + 1) {
    sum = sum + hardShadow(shadowCoords.xy + radius_tex * rot_mat * POISSON_DISK_SAMPLES[i], shadowCoords.z);
  }
  return sum / f32(SMAPLE_NUM);

}


fn blinnPhong(position: vec3<f32>, normal: vec3<f32>, albedo: vec3<f32>) -> vec3<f32> {

#if ${pointLight}
  let lightDir = normalize(light.position - position);
#else
  let lightDir = normalize(light.direction);
#endif
  let viewDir = normalize(camera.position - position);
  let halfVec = normalize(lightDir + viewDir);

  let ambient = albedo * light.color * 0.2;

  let diff = max(dot(lightDir, normal), 0.0);
  let diffuse = diff * light.color * albedo;

  let spec = pow(max(dot(normal, halfVec), 0.0), 32);
  let specular = spec * light.color * albedo;

  return ambient + diffuse + specular;

}

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


@fragment
fn main(
  @builtin(position) position: vec4<f32>,
  @location(0) fragPosition: vec3<f32>,
  @location(1) fragNormal: vec3<f32>,
  @location(2) fragUV: vec2<f32>,
  @location(3) shadowPos: vec4<f32>,
#if ${normalMap}
  @location(4) tangent: vec3<f32>,
  @location(5) biTangent: vec3<f32>
#endif
) -> @location(0) vec4<f32> {

  // normal
#if ${normalMap}
  let tbn: mat3x3<f32> = mat3x3<f32>(tangent, biTangent, fragNormal);
  let normal_del: vec3<f32> = normalize(
    textureSample(normalMap, textureSampler, fragUV).xyz - vec3<f32>(0.5, 0.5, 0.5)
  );
  let normal = normalize(tbn * normal_del.xyz);
#else
  let normal = fragNormal;
#endif

  // material
  var localMaterial: PBRMaterial;
#if ${roughnessMap}
  localMaterial.roughness = textureSample(roughnessMap, textureSampler, fragUV).x * material.roughness;
#else
  localMaterial.roughness = material.roughness;
#endif

#if ${metalnessMap}
  localMaterial.metalness = textureSample(metalnessMap, textureSampler, fragUV).x * material.metalness;
#else
  localMaterial.metalness = material.metalness;
#endif
  
#if ${baseMap} // blbedo
  localMaterial.albedo = textureSample(baseMap, textureSampler, fragUV).xyz * material.albedo;
#else
  localMaterial.albedo = material.albedo;
#endif

#if ${specularMap}
  localMaterial.specular = textureSample(specularMap, textureSampler, fragUV).xyz * material.specular;
#else
  localMaterial.specular = material.specular;
#endif

  // shadow
  let shadowCoords: vec3<f32> = vec3<f32>(
    shadowPos.xy / shadowPos.w * vec2<f32>(0.5, -0.5) + 0.5, // Convert shadowPos XY to (0, 1) to fit texture UV
    shadowPos.z / shadowPos.w
  );
  // let visibility = hardShadow(shadowCoords.xy, shadowCoords.z);
  let visibility = PCF(5.0, shadowCoords);
  // let visibility = 1.0;

  // Blinn-Phong shading
  // let shadingColor = blinnPhong(fragPosition, normal, albedo);

  // PBR shading
  let shadingColor = PBR(
    normal, normalize(camera.position - fragPosition), normalize(light.direction),
    localMaterial, light.color
  );

  let ambient = 0.1 * localMaterial.albedo; // * ao
  var color: vec3<f32> = 0.9 * shadingColor * visibility + ambient;

  // tone mapping
  color = ACESToneMapping(color);

  return vec4<f32>(color, 1.0);

}
`
  }

  return code;
  
}