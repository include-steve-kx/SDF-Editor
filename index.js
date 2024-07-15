import * as THREE from 'three';
import { OrbitControls } from "./node_modules/three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "./src/TransformControls.js";
import {vsNormal, fsNormal, fsNormalLine, vsSDF, getFsSDF, vsFinal, fsFinal, vsDummyMesh, fsDummyMesh, addSDFObject, deleteSDFObject, updateSDFShaderString} from "./src/shaders.js";
import {mouseColorAndSDFIdColorCollideThrehold} from "./src/constants.js";
import {remap} from './src/math.js';

let camera, renderer;
let orbitControls;
let camPos = new THREE.Vector3();
let camDir = new THREE.Vector3();

// point light in the scene
let pointLightPosition = new THREE.Vector3(1, 2.5, 5);
// 2 render passes, consisting of a normal scene and an sdf scene
let normalScene, sdfScene;
let gridLines = [];
let normalSceneGeo, normalSceneMat, normalSceneMesh;
let sdfFullScreenCube;
let rtNormal = null, rtSdf = null;
// final render pass, combining the previous 2 render passes together
let finalScene;
let finalFullScreenCube = null;

// for adjusting sdf object transformations
let transformControls = null, dummyMesh = null;




function setupEventListeners() {
    let sdfInfoContainer = document.getElementById('sdf-info-container');
    sdfInfoContainer.addEventListener('pointerdown', (e) => {e.stopPropagation();});

    let sdfInfoPositionDiv = null, sdfInfoQuaternionDiv = null, sdfInfoScaleDiv = null, sdfInfoSmoothBlendDiv = null, sdfInfoOperationDiv = null;
    function setupSdfInfoDivs() {
        sdfInfoPositionDiv = document.getElementById('sdf-info-position');
        sdfInfoQuaternionDiv = document.getElementById('sdf-info-quaternion');
        sdfInfoScaleDiv = document.getElementById('sdf-info-scale');
        sdfInfoSmoothBlendDiv = document.getElementById('sdf-info-smoothBlend');
        sdfInfoOperationDiv = document.getElementById('sdf-info-operation');

        [sdfInfoPositionDiv, sdfInfoQuaternionDiv, sdfInfoScaleDiv, sdfInfoSmoothBlendDiv].forEach((div) => {
            div.addEventListener('keydown', () => {
                syncDivToGUI();
            });
        })
        sdfInfoOperationDiv.addEventListener('change', () => {
            syncDivToGUI();
        })
    }

    function syncDivToGUI() {
        if (lastIntersect === null) return;
        function parseValue(div) {
            let value = parseFloat(div.value);
            if (isNaN(value)) return 0;
            return value;
        }
        function syncDivToGUIDetails(propertyDiv) {
            let propertyDivs = propertyDiv.children;
            let newValue = null;
            switch (propertyDiv.id) {
                case 'sdf-info-position':
                    newValue = new THREE.Vector3(parseValue(propertyDivs[0]), parseValue(propertyDivs[1]), parseValue(propertyDivs[2]));
                    sdfFullScreenCube.material.uniforms['uTempColor'].value = lastIntersect.idColor;
                    dummyMesh.position.copy(newValue);
                    lastIntersect.position.copy(dummyMesh.position);
                    break;
                case 'sdf-info-quaternion':
                    newValue = new THREE.Quaternion(parseValue(propertyDivs[0]), parseValue(propertyDivs[1]), parseValue(propertyDivs[2]), parseValue(propertyDivs[3]));
                    sdfFullScreenCube.material.uniforms['uTempColor'].value = lastIntersect.idColor;
                    dummyMesh.quaternion.copy(newValue);
                    lastIntersect.quaternion.copy(dummyMesh.quaternion);
                    break;
                case 'sdf-info-scale':
                    newValue = new THREE.Vector3(parseValue(propertyDivs[0]), parseValue(propertyDivs[1]), parseValue(propertyDivs[2]));
                    sdfFullScreenCube.material.uniforms['uTempColor'].value = lastIntersect.idColor;
                    dummyMesh.scale.copy(newValue);
                    lastIntersect.scale.copy(dummyMesh.scale);
                    break;
                case 'sdf-info-smoothBlend':
                    newValue = parseValue(propertyDivs[0]);
                    sdfFullScreenCube.material.uniforms['uTempColor'].value = lastIntersect.idColor;
                    lastIntersect.smoothBlend = newValue;
                    break;
                case 'sdf-info-operation':
                    lastIntersect.operation = propertyDiv.value;
                    break;
                default:
                    break;
            }
            updateSDFShader();
        }

        syncDivToGUIDetails(sdfInfoPositionDiv);
        syncDivToGUIDetails(sdfInfoQuaternionDiv);
        syncDivToGUIDetails(sdfInfoScaleDiv);
        syncDivToGUIDetails(sdfInfoSmoothBlendDiv);
        syncDivToGUIDetails(sdfInfoOperationDiv);
    }

    setupSdfInfoDivs();
    function syncGUIToDiv() {
        function syncGUIToDivDetails(propertyDiv, property) { // the parent div all the properties live in, a three.js vector3 / vector4 / float
            let propertyDivs = propertyDiv.children;
            let propertyArray = (property.isVector2 || property.isVector3 || property.isVector4 || property.isQuaternion) ? property.toArray() : [property];
            if (propertyDivs.length !== propertyArray.length) {
                console.error('propertyDiv and property length mismatch. Aborting...');
                return;
            }
            for (let i = 0; i < propertyDivs.length; i++) {
                propertyDivs[i].value = propertyArray[i];
            }
        }
        syncGUIToDivDetails(sdfInfoPositionDiv, intersect.position);
        syncGUIToDivDetails(sdfInfoQuaternionDiv, intersect.quaternion);
        syncGUIToDivDetails(sdfInfoScaleDiv, intersect.scale);
        syncGUIToDivDetails(sdfInfoSmoothBlendDiv, intersect.smoothBlend);
    }

    let resizeId = null;
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        let nearPlaneHeight = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.near // height
        let nearPlaneWidth = nearPlaneHeight * camera.aspect // width
        sdfFullScreenCube.material.uniforms['camera_aspect_ratio'].value = camera.aspect;
        sdfFullScreenCube.material.uniforms['uCameraNear'].value = camera.near;
        sdfFullScreenCube.material.uniforms['uCameraNearSize'].value = new THREE.Vector2(nearPlaneWidth, nearPlaneHeight);

        // mesh.material.uniforms['viewport'].value = new THREE.Vector4(0, 0, innerWidth, innerHeight);

        renderer.setSize( window.innerWidth, window.innerHeight );

        if (resizeId !== null) {
            clearTimeout(resizeId);
        }
        resizeId = setTimeout(() => {
            onResizeEnd();
        }, 150);
    })

    function onResizeEnd() {
        console.log('regenerate render targets');
        createRenderTargets();
    }

    let mouseColor = new THREE.Vector3(0, 0, 0);
    let lastIntersect = null, intersect = null;
    function IntersectSDFObject() {
        if (transformControls._gizmo.isHandleHightlighted) return null;
        for (let [id, object] of Object.entries(sdfObjects)) {
            if (mouseColor.distanceTo(object.idColor) < mouseColorAndSDFIdColorCollideThrehold) {
                return object;
            }
        }
        return null;
    }

    let isTransforming = false;
    transformControls.addEventListener('mouseDown', (e) => {
        isTransforming = true;
        orbitControls.enabled = false;
    });
    transformControls.addEventListener('mouseUp', (e) => {
        isTransforming = false;
        orbitControls.enabled = true;

        updateSDFShader();
    });
    setMode('translate');
    // transformControls.setSpace('local');
    transformControls.addEventListener('objectChange', (e) => {
        syncGUIToDiv();
        switch (transformControls.getMode()) {
            case 'translate':
                intersect.position.copy(dummyMesh.position);
                sdfFullScreenCube.material.uniforms['uTempPosition'].value = dummyMesh.position;
                break;
            case 'rotate':
                intersect.quaternion.copy(dummyMesh.quaternion);
                sdfFullScreenCube.material.uniforms['uTempQuaternion'].value = dummyMesh.quaternion;
                break;
            case 'scale':
                let scale = dummyMesh.scale.clone();
                scale.x = Math.abs(scale.x);
                scale.y = Math.abs(scale.y);
                scale.z = Math.abs(scale.z);
                intersect.scale.copy(scale);
                sdfFullScreenCube.material.uniforms['uTempScale'].value = scale;
                break;
            default:
                break;
        }
    });

    function showAllHandles() {
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
    }
    function showXHandle() { // for sphere, b/c in SDF it only takes x handle value as its scale
        transformControls.showX = true;
        transformControls.showY = false;
        transformControls.showZ = false;
    }
    function setMode(mode) {
        transformControls.setMode(mode);
        if (mode === 'scale' && intersect.type === 'sphere') {
            showXHandle();
        } else {
            showAllHandles();
        }
    }

    let translateSDFDiv = document.getElementById('translate-sdf');
    let rotateSDFDiv = document.getElementById('rotate-sdf');
    let scaleSDFDiv = document.getElementById('scale-sdf');
    let deleteSDFDiv = document.getElementById('delete-sdf');
    let hideGridDiv = document.getElementById('hide-grid');
    translateSDFDiv.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        setMode('translate');
    });
    rotateSDFDiv.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        setMode('rotate');
    });
    scaleSDFDiv.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        setMode('scale');
    });
    deleteSDFDiv.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (intersect !== null) {
            deleteSDFObject(intersect.id);
            updateSDFShader();
            transformControls.detach();
        }
    });
    hideGridDiv.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        gridLines.forEach((line) => {
            line.visible = !line.visible;
        })
    })

    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'G':
            case 'g':
                setMode('translate');
                break;
            case 'R':
            case 'r':
                setMode('rotate');
                break;
            case 'S':
            case 's':
                setMode('scale');
                break;
            case 'Backspace':
                if (intersect !== null) {
                    deleteSDFObject(intersect.id);
                    updateSDFShader();
                    transformControls.detach();
                }
                break;
            default:
                break;
        }
    })

    let isAddedNewObject = false;
    document.addEventListener('pointerdown', (e) => {
        if (isAddedNewObject) {
            isAddedNewObject = false;
            lastIntersect = intersect;
            return;
        }
        // in sdfObjects, figure out which sdf object collide with mouse
        intersect = IntersectSDFObject();
        if (intersect === null && !isTransforming) { // if mouse hit nothing (not sdf objects, or transform controls handles)
            transformControls.detach();

            sdfFullScreenCube.material.uniforms['uTempColor'].value = mouseColor;

            return;
        }
        if (intersect === null) { // if mouse only hit transform controls handles
            if (lastIntersect !== null) {
                intersect = lastIntersect;
                syncGUIToDiv();
            }
            return;
        }

        syncGUIToDiv();
        sdfFullScreenCube.material.uniforms['uTempColor'].value = mouseColor;

        dummyMesh.position.copy(intersect.position);
        sdfFullScreenCube.material.uniforms['uTempPosition'].value = dummyMesh.position;

        dummyMesh.quaternion.copy(intersect.quaternion);
        sdfFullScreenCube.material.uniforms['uTempQuaternion'].value = dummyMesh.quaternion;

        dummyMesh.scale.copy(intersect.scale);
        sdfFullScreenCube.material.uniforms['uTempScale'].value = dummyMesh.scale;

        transformControls.attach(dummyMesh);
        if (transformControls.getMode() === 'scale' && intersect.type === 'sphere') {
            showXHandle();
        } else {
            showAllHandles();
        }

        lastIntersect = IntersectSDFObject();
    })

    document.addEventListener('pointermove', (e) => {
        if (rtSdf === null) return;
        const pixelBuffer = new Float32Array(4); // 4 components for RGBA
        renderer.readRenderTargetPixels(rtSdf, e.clientX, innerHeight - e.clientY, 1, 1, pixelBuffer);
        // visual highlighting in shaders
        mouseColor = new THREE.Vector3(pixelBuffer[0], pixelBuffer[1], pixelBuffer[2]);
        sdfFullScreenCube.material.uniforms['uMouseColor'].value = mouseColor;
    })

    function addSDFObjectBasedOnType(type) {
        let newObject = addSDFObject({
            type: type,
            position: new THREE.Vector3(0, 0, 0),
            size: new THREE.Vector3(1, 1, 1),
            color: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
        });
        updateSDFShader();
        // move the dummy mesh to the newly added SDF box, and enable the transform control handles
        // todo Steve: repetitive from the above "document.addEventListener('pointerdown'" function, need to make a more general function for lines below
        intersect = newObject;
        syncGUIToDiv();
        isAddedNewObject = true;
        mouseColor = newObject.idColor;
        sdfFullScreenCube.material.uniforms['uTempColor'].value = mouseColor;
        dummyMesh.position.copy(intersect.position);
        sdfFullScreenCube.material.uniforms['uTempPosition'].value = dummyMesh.position;
        dummyMesh.quaternion.copy(intersect.quaternion);
        sdfFullScreenCube.material.uniforms['uTempQuaternion'].value = dummyMesh.quaternion;
        dummyMesh.scale.copy(intersect.scale);
        sdfFullScreenCube.material.uniforms['uTempScale'].value = dummyMesh.scale;
        transformControls.attach(dummyMesh);
        if (transformControls.getMode() === 'scale' && intersect.type === 'sphere') {
            showXHandle();
        } else {
            showAllHandles();
        }
    }

    let addSDFBoxButton = document.getElementById('add-sdf-box');
    addSDFBoxButton.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        addSDFObjectBasedOnType('box')
    })

    let addSDFSphereButton = document.getElementById('add-sdf-sphere');
    addSDFSphereButton.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        addSDFObjectBasedOnType('sphere')
    })
}

function createRenderTargets() {
    // render target for normal scene
    rtNormal = new THREE.WebGLRenderTarget(
        innerWidth,
        innerHeight,
        {
            count: 2,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
        }
    );
    rtNormal.textures[ 0 ].name = 'color';
    rtNormal.textures[ 1 ].name = 'worldSpacePosition';

    // render target for sdf scene
    rtSdf = new THREE.WebGLRenderTarget(
        innerWidth,
        innerHeight,
        {
            count: 3,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
        }
    );
    rtSdf.textures[ 0 ].name = 'idColor';
    rtSdf.textures[ 1 ].name = 'worldSpacePosition';
    rtSdf.textures[ 2 ].name = 'color';

    if (finalFullScreenCube === null) return;
    finalFullScreenCube.material.uniforms['tColorNormal'].value = rtNormal.textures[0];
    finalFullScreenCube.material.uniforms['tWorldPosNormal'].value = rtNormal.textures[1];
    finalFullScreenCube.material.uniforms['tColorSDF'].value = rtSdf.textures[2];
    finalFullScreenCube.material.uniforms['tWorldPosSDF'].value = rtSdf.textures[1];
    finalFullScreenCube.material.uniforms['tIdSDF'].value = rtSdf.textures[0];
}

function init() {
    // renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    let canvas_parent_div = document.querySelector('#canvas-container');
    canvas_parent_div.appendChild(renderer.domElement);
    renderer.domElement.id = 'three-js-canvas';

    // final scene pass
    finalScene = new THREE.Scene();

    // normal scene pass
    normalScene = new THREE.Scene();
    // lighting on the normal scene
    const light2 = new THREE.PointLight(0x404040, 1000, 100);
    light2.position.copy(pointLightPosition);
    normalScene.add(light2);

    // sdf scene pass
    sdfScene = new THREE.Scene();

    createRenderTargets();

    // camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    let camOffset = 5;
    camera.position.set(camOffset, camOffset, camOffset);
    camera.lookAt(0, 0, 0);
    camera.updateWorldMatrix(true, true);
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    let lightInfo = {
        ambientLight: {
            value: {
                color: new THREE.Vector3(0.3, 0.5, 0.4),
                intensity: 0.5,
            }
        },
        diffuseLights: {
            value: [
                {position: pointLightPosition, color: new THREE.Vector3(0.2, 0.5, 1), intensity: 0.8},
                {position: pointLightPosition.clone().negate(), color: new THREE.Vector3(0.2, 0.5, 1), intensity: 0.4},
            ]
        },
        diffuseCount: {value: 2},
        specularLights: {
            value: [
                {position: pointLightPosition, color: new THREE.Vector3(0.2, 0.5, 1), intensity: 2, shininess: 16},
            ]
        },
        specularCount: {value: 1},
    };

    // // normal scene mesh
    // normalSceneGeo = new THREE.SphereGeometry(0.5, 32, 16);
    // normalSceneMat = new THREE.RawShaderMaterial({
    //     vertexShader: vsNormal,
    //     fragmentShader: fsNormal,
    //     uniforms: {
    //         uObjectColor: {value: new THREE.Vector3(0.5, 0.5, 1.)},
    //         ...lightInfo,
    //     },
    //     glslVersion: THREE.GLSL3,
    // });
    // normalSceneMesh = new THREE.Mesh(normalSceneGeo, normalSceneMat);
    // normalSceneMesh.position.set(-0.3, 0.3, 0.2);
    // normalScene.add(normalSceneMesh);
    function makeLine(p1, p2) {
        let lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        let lineMat = new THREE.RawShaderMaterial({
            vertexShader: vsNormal,
            fragmentShader: fsNormalLine,
            uniforms: {
                uObjectColor: {value: new THREE.Vector3(0.6, 0.6, 0.6)},
                ...lightInfo,
            },
            glslVersion: THREE.GLSL3,
        });
        let lineMesh = new THREE.Line(lineGeo, lineMat);
        gridLines.push(lineMesh);
        normalScene.add(lineMesh);
    }
    for (let i = -20; i < 21; i++) {
        makeLine(new THREE.Vector3(-20, 0, i), new THREE.Vector3(20, 0, i));
    }
    for (let i = -20; i < 21; i++) {
        makeLine(new THREE.Vector3(i, 0, -20), new THREE.Vector3(i, 0, 20));
    }

    // sdf scene mesh
    let sdfGeo = new THREE.BoxGeometry(2, 2, 1);
    let nearPlaneHeight = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.near // height
    let nearPlaneWidth = nearPlaneHeight * camera.aspect // width
    let sdfMat = new THREE.RawShaderMaterial({
        vertexShader: vsSDF,
        fragmentShader: getFsSDF(),
        uniforms: {
            camera_aspect_ratio: {value: camera.aspect},
            camera_fov: {value: camera.fov},
            camera_position: {value: camPos},
            camera_direction: {value: camDir},
            uCameraNear: {value: camera.near},
            uCameraFar: {value: camera.far},
            uCameraNearSize: {value: new THREE.Vector2(nearPlaneWidth, nearPlaneHeight)},
            uTime: {value: 0},
            ...lightInfo,
            uMouseColor: {value: new THREE.Vector3(0, 0, 0)},
            uTempPosition: {value: new THREE.Vector3(0, 0, 0)},
            uTempRotationAxis: {value: -1}, // 0 -- x; 1 -- y; 2 -- z
            uTempRotationAngle: {value: 0},
            uTempQuaternion: {value: new THREE.Quaternion(0, 0, 0, 1)},
            uTempScale: {value: new THREE.Vector3(1, 1, 1)},
            uTempColor: {value: new THREE.Vector3(0, 0, 0)},
        },
        glslVersion: THREE.GLSL3,
    })
    sdfFullScreenCube = new THREE.Mesh(sdfGeo, sdfMat);
    sdfScene.add(sdfFullScreenCube);


    // final scene full-screen quad
    let finalGeo = new THREE.BoxGeometry(2, 2, 1);
    let finalMat = new THREE.ShaderMaterial({
        vertexShader: vsFinal,
        fragmentShader: fsFinal,
        uniforms: {
            tColorNormal: {value: rtNormal.textures[0]},
            tWorldPosNormal: {value: rtNormal.textures[1]},
            tColorSDF: {value: rtSdf.textures[2]},
            tWorldPosSDF: {value: rtSdf.textures[1]},
            tIdSDF: {value: rtSdf.textures[0]},
            camera_position: {value: camPos},
            background_color: {value: new THREE.Vector3(221./255., 227./255., 233./255.)},
        },
        depthWrite: false, // make everything else in the scene (other than this full-screen quad) displayed on top of this full-screen quad
    });
    finalFullScreenCube = new THREE.Mesh(finalGeo, finalMat);
    finalScene.add(finalFullScreenCube);

    // dummy mesh, for attaching transform controls onto, and sync dummy mesh <---> sdf mesh transformations together
    let dummyGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    // let dummyMat = new THREE.MeshBasicMaterial({color: 0x00ffff});
    let dummyMat = new THREE.ShaderMaterial({
        vertexShader: vsDummyMesh,
        fragmentShader: fsDummyMesh,
    });
    dummyMesh = new THREE.Mesh(dummyGeo, dummyMat);
    // dummyMesh.visible = false;
    finalScene.add(dummyMesh);
    transformControls = new TransformControls(camera, renderer.domElement);
    // transformControls.attach(dummyMesh);
    finalScene.add(transformControls);
    let axesHelper = new THREE.AxesHelper();
    finalScene.add(axesHelper);

    // orbit control
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableZoom = true;

    setupEventListeners();

    setTimeout(() => {
        for (let i = 0; i < 1; i++) {
            addSDFObject({
                type: 'box',
                // position: new THREE.Vector3(remap(Math.random(), 0, 1, -10, 10), remap(Math.random(), 0, 1, -10, 10), remap(Math.random(), 0, 1, -10, 10)),
                position: new THREE.Vector3(remap(Math.random(), 0, 1, -2, 2), remap(Math.random(), 0, 1, -2, 2), remap(Math.random(), 0, 1, -2, 2)),
                size: new THREE.Vector3(1, 1, 1),
                color: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
            });
        }
        // addSDFObject({
        //     type: 'sphere',
        //     // position: new THREE.Vector3(remap(Math.random(), 0, 1, -10, 10), remap(Math.random(), 0, 1, -10, 10), remap(Math.random(), 0, 1, -10, 10)),
        //     position: new THREE.Vector3(remap(Math.random(), 0, 1, -2, 2), remap(Math.random(), 0, 1, -2, 2), remap(Math.random(), 0, 1, -2, 2)),
        //     size: new THREE.Vector3(1, 1, 1),
        //     color: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
        // })
        updateSDFShader();
    }, 500);
}

function updateSDFShader() {
    updateSDFShaderString();
    sdfFullScreenCube.material.fragmentShader = getFsSDF();
    sdfFullScreenCube.material.needsUpdate = true;
}

let time = 0;
function animateObjects() {
    time += 0.01;

    // normalSceneMesh.position.y = Math.sin(time);
    sdfFullScreenCube.material.uniforms['uTime'].value = time;
}

function animate() {
    requestAnimationFrame(animate);

    animateObjects();

    camera.updateWorldMatrix(true, true);
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    sdfFullScreenCube.material.uniforms['camera_position'].value = camPos;
    sdfFullScreenCube.material.uniforms['camera_direction'].value = camDir;

    finalFullScreenCube.material.uniforms['camera_position'].value = camPos;

    // renderer.setRenderTarget( null );
    // renderer.render( normalScene, camera );
    renderer.setRenderTarget( rtNormal );
    renderer.render( normalScene, camera );
    renderer.setRenderTarget( rtSdf );
    renderer.render( sdfScene, camera );
    renderer.setRenderTarget( null );
    renderer.render( finalScene, camera );
}

init();
animate();