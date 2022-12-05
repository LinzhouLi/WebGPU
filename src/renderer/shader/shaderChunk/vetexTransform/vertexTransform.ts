import { wgsl } from '../../../../3rd-party/wgsl-preprocessor';
import { VertexShaderParam } from '../../shaderLib/geometryPass';
import { ObjectSpace } from "./objectSpace";
import { WorldSpace } from "./worldSpace";
import { ScreenSpace } from "./screenSpace";
import { DataStructure } from '../../shaderChunk';

function VertexTransformPars(
  params: VertexShaderParam,
  bindingIndices: Record<string, string>
) {
  return wgsl
  /* wgsl */`

${DataStructure.Camera}
${DataStructure.Transform}

${bindingIndices['camera']} var<uniform> camera: Camera;
${bindingIndices['transform']} var<uniform> transform : Transform;

  `;
};

const VertexTransform = { ObjectSpace, WorldSpace, ScreenSpace };

export { VertexTransformPars, VertexTransform };