import * as THREE from 'three';
import { device, canvasFormat } from './renderer';
import { GlobalObject } from './globalObject';
import { MeshObject } from './meshObject';

// console.info( 'THREE.WebGPURenderer: Modified Matrix4.makePerspective() and Matrix4.makeOrtographic() to work with WebGPU, see https://github.com/mrdoob/three.js/issues/20276.' );
// @ts-ignore
THREE.Matrix4.prototype.makePerspective = function ( left, right, top, bottom, near, far ) : THREE.Matrix4 {
  
	const te = this.elements;
	const x = 2 * near / ( right - left );
	const y = 2 * near / ( top - bottom );

	const a = ( right + left ) / ( right - left );
	const b = ( top + bottom ) / ( top - bottom );
	const c = - far / ( far - near );
	const d = - far * near / ( far - near );

	te[ 0 ] = x;	te[ 4 ] = 0;	te[ 8 ] = a;	te[ 12 ] = 0;
	te[ 1 ] = 0;	te[ 5 ] = y;	te[ 9 ] = b;	te[ 13 ] = 0;
	te[ 2 ] = 0;	te[ 6 ] = 0;	te[ 10 ] = c;	te[ 14 ] = d;
	te[ 3 ] = 0;	te[ 7 ] = 0;	te[ 11 ] = - 1;	te[ 15 ] = 0;

	return this;

};

THREE.Matrix4.prototype.makeOrthographic = function ( left, right, top, bottom, near, far ) {

	const te = this.elements;
	const w = 1.0 / ( right - left );
	const h = 1.0 / ( top - bottom );
	const p = 1.0 / ( far - near );

	const x = ( right + left ) * w;
	const y = ( top + bottom ) * h;
	const z = near * p;

	te[ 0 ] = 2 * w;	te[ 4 ] = 0;		te[ 8 ] = 0;		te[ 12 ] = - x;
	te[ 1 ] = 0;		te[ 5 ] = 2 * h;	te[ 9 ] = 0;		te[ 13 ] = - y;
	te[ 2 ] = 0;		te[ 6 ] = 0;		te[ 10 ] = - 1 * p;	te[ 14 ] = - z;
	te[ 3 ] = 0;		te[ 7 ] = 0;		te[ 11 ] = 0;		te[ 15 ] = 1;

	return this;

};

THREE.Frustum.prototype.setFromProjectionMatrix = function ( m ) {

	const planes = this.planes;
	const me = m.elements;
	const me0 = me[ 0 ], me1 = me[ 1 ], me2 = me[ 2 ], me3 = me[ 3 ];
	const me4 = me[ 4 ], me5 = me[ 5 ], me6 = me[ 6 ], me7 = me[ 7 ];
	const me8 = me[ 8 ], me9 = me[ 9 ], me10 = me[ 10 ], me11 = me[ 11 ];
	const me12 = me[ 12 ], me13 = me[ 13 ], me14 = me[ 14 ], me15 = me[ 15 ];

	planes[ 0 ].setComponents( me3 - me0, me7 - me4, me11 - me8, me15 - me12 ).normalize();
	planes[ 1 ].setComponents( me3 + me0, me7 + me4, me11 + me8, me15 + me12 ).normalize();
	planes[ 2 ].setComponents( me3 + me1, me7 + me5, me11 + me9, me15 + me13 ).normalize();
	planes[ 3 ].setComponents( me3 - me1, me7 - me5, me11 - me9, me15 - me13 ).normalize();
	planes[ 4 ].setComponents( me3 - me2, me7 - me6, me11 - me10, me15 - me14 ).normalize();
	planes[ 5 ].setComponents( me2, me6, me10, me14 ).normalize();

	return this;

};


class RenderableObject {

  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  light: THREE.PointLight;

  globalObject: GlobalObject;
  meshList: MeshObject[];

  shadowBundle: GPURenderBundle;
  renderBundle: GPURenderBundle;

  constructor() {

  }

  updateMatrix() {

    this.scene.updateMatrixWorld();
    this.camera.updateProjectionMatrix();

    this.light.shadow.camera.position.setFromMatrixPosition( this.light.matrixWorld );
    this.light.shadow.camera.updateMatrixWorld();
    this.light.shadow.camera.updateProjectionMatrix();
    
  }

  initScene(scene: THREE.Scene) {

    this.scene = scene;
    this.camera = null;
    this.light = null;
    this.meshList = [];
    
    scene.traverse(obj => {
      if (obj instanceof THREE.PerspectiveCamera) {
        if (this.camera === null) 
          this.camera = obj;
        else 
          throw new Error('More Than One Camera');
      }
      else if (obj instanceof THREE.PointLight) {
        if (this.light === null) 
          this.light = obj;
        else 
          throw new Error('More Than One PointLight');
      } // @ts-ignore
      else if (obj.isMesh) {
        this.meshList.push(new MeshObject(obj as THREE.Mesh));
      }
    });
    
    if (this.camera === null) throw new Error('No Camera');
    if (this.light === null) throw new Error('No Light');
    this.globalObject = new GlobalObject(this.camera, this.light, this.scene);

  }

  async initResources() {

    // update information
    this.updateMatrix();

    this.globalObject.initVertexBuffer();
    await this.globalObject.initGroupResource();
    for (const meshObject of this.meshList) {
      meshObject.initVertexBuffer();
      await meshObject.initGroupResource();
    }

  }

  async initRenderPass() {

    const { layout, group } = this.globalObject.createRenderBindGroup();

    const renderBundleEncoder = device.createRenderBundleEncoder({
      label: 'Render Pass',
      colorFormats: [canvasFormat],
      depthStencilFormat: 'depth32float'
    });

    for (const meshObject of this.meshList) {
      await meshObject.setRenderBundle(renderBundleEncoder, [layout], [group]);
    }
    await this.globalObject.setRenderBundle(renderBundleEncoder); // 最后一步绘制天空盒

    this.renderBundle = renderBundleEncoder.finish();

  }

  async initShadowPass() {

    const { layout, group } = this.globalObject.createShadowBindGroup();

    const shadowBundleEncoder = device.createRenderBundleEncoder({
      label: 'Shadow Pass',
      colorFormats: [],
      depthStencilFormat: 'depth32float'
    });

    for (const meshObject of this.meshList) {
      await meshObject.setShadowBundle(shadowBundleEncoder, [layout], [group]);
    }

    this.shadowBundle = shadowBundleEncoder.finish();

  }

  update() {

    this.updateMatrix();
    this.globalObject.update();
    for (const meshObject of this.meshList) meshObject.update();

  }

}

export { RenderableObject };