import * as THREE from 'three';
import {mouseColorAndSDFIdColorCollideThrehold} from './constants.js';

const commonShader = `
    float dot2( in vec2 v ) { return dot(v,v); }
    
    mat4 identity() {
        return mat4(
            1., 0., 0., 0.,
            0., 1., 0., 0.,
            0., 0., 1., 0.,
            0., 0., 0., 1.
        );
    }
    
    mat3 quaternionToRotationMatrix(vec4 q) {
        float x = q.x;
        float y = q.y;
        float z = q.z;
        float w = q.w;
        return mat3(
            1. - 2.*y*y - 2.*z*z, 2.*x*y - 2.*w*z, 2.*x*z - 2.*w*y,
            2.*x*y + 2.*w*z, 1. - 2.*x*x - 2.*z*z, 2.*y*z - 2.*w*x,
            2.*x*z - 2.*w*y, 2.*y*z + 2.*w*x, 1. - 2.*x*x - 2.*y*y
        );
    }
    
    mat3 rotateX3D(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat3(
        1.0, 0.0, 0.0,
        0.0, c, -s,
        0.0, s, c
      );
    }
    
    mat3 rotateY3D(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat3(
        c, 0.0, -s,
        0.0, 1.0, 0.0,
        s, 0.0, c
      );
    }
    
    mat3 rotateZ3D(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat3(
        c, -s, 0.0,
        s, c, 0.0,
        0.0, 0.0, 1.0
      );
    }
    
    mat2 rot(float a) {
        return mat2(sin(a), cos(a), -cos(a), sin(a));
    }
    
    float remap01(float x, float low, float high) {
        // return clamp((x - low) / (high - low), 0., 1.);
        return (x - low) / (high - low);
    }
            
    float remap2(float x, float lowIn, float highIn, float lowOut, float highOut) {
        return mix(lowOut, highOut, remap01(x, lowIn, highIn));
    }
    
    float remap(float value, float min1, float max1, float min2, float max2) {
      return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
    }
    
    vec2 remap22(vec2 v, vec2 lowIn, vec2 highIn, vec2 lowOut, vec2 highOut) {
        return vec2(remap(v.x, lowIn.x, highIn.x, lowOut.x, highOut.x), remap(v.y, lowIn.y, highIn.y, lowOut.y, highOut.y));
    }
    
    vec3 remap33(vec3 v, vec3 lowIn, vec3 highIn, vec3 lowOut, vec3 highOut) {
        return vec3(remap(v.x, lowIn.x, highIn.x, lowOut.x, highOut.x), remap(v.y, lowIn.y, highIn.y, lowOut.y, highOut.y), remap(v.z, lowIn.z, highIn.z, lowOut.z, highOut.z));
    }
    
    vec2 cubic(vec2 p) {
      return p * p * (3.0 - p * 2.0);
    }
    
    vec2 quintic(vec2 p) {
      return p * p * p * (10.0 + p * (-15.0 + p * 6.0));
    }
    
    vec2 randomGradient(vec2 p) {
      p = p + 0.02;
      float x = dot(p, vec2(123.4, 234.5));
      float y = dot(p, vec2(234.5, 345.6));
      vec2 gradient = vec2(x, y);
      gradient = sin(gradient);
      gradient = gradient * 43758.5453;
    
      // part 4.5 - update noise function with time
      // gradient = sin(gradient + iTime);
      gradient = sin(gradient);
      return gradient;
    
      // gradient = sin(gradient);
      // return gradient;
    }

    float perlin(vec2 uv) {
        // part 1 - set up a grid of cells
        uv = uv * 12.0;
        vec2 gridId = floor(uv);
        vec2 gridUv = fract(uv);
    
        // part 2.1 - start by finding the coords of grid corners
        vec2 bl = gridId + vec2(0.0, 0.0);
        vec2 br = gridId + vec2(1.0, 0.0);
        vec2 tl = gridId + vec2(0.0, 1.0);
        vec2 tr = gridId + vec2(1.0, 1.0);
    
        // part 2.2 - find random gradient for each grid corner
        vec2 gradBl = randomGradient(bl);
        vec2 gradBr = randomGradient(br);
        vec2 gradTl = randomGradient(tl);
        vec2 gradTr = randomGradient(tr);
    
        // part 2.3 - visualize gradients (for demo purposes)
        vec2 gridCell = gridId + gridUv;
    
        // part 3.2 - find distance from current pixel to each grid corner
        vec2 distFromPixelToBl = gridUv - vec2(0.0, 0.0);
        vec2 distFromPixelToBr = gridUv - vec2(1.0, 0.0);
        vec2 distFromPixelToTl = gridUv - vec2(0.0, 1.0);
        vec2 distFromPixelToTr = gridUv - vec2(1.0, 1.0);
    
        // part 4.1 - calculate the dot products of gradients + distances
        float dotBl = dot(gradBl, distFromPixelToBl);
        float dotBr = dot(gradBr, distFromPixelToBr);
        float dotTl = dot(gradTl, distFromPixelToTl);
        float dotTr = dot(gradTr, distFromPixelToTr);
    
        // part 4.4 - smooth out gridUvs
        // gridUv = smoothstep(0.0, 1.0, gridUv);
        // gridUv = cubic(gridUv);
        gridUv = quintic(gridUv);
    
        // part 4.2 - perform linear interpolation between 4 dot products
        float b = mix(dotBl, dotBr, gridUv.x);
        float t = mix(dotTl, dotTr, gridUv.x);
        float perlin = mix(b, t, gridUv.y);
        
        return perlin;
    }
`;

const commonShaderLighting = `
    // lighting configurations
    uniform vec3 uObjectColor; // only used in normal mesh model shader, sdf color is set using the sdfObjects object and HitInfo glsl struct
    struct AmbientLight {
        vec3 color;
        float intensity;
    };
    uniform AmbientLight ambientLight;
    struct DiffuseLight {
        vec3 position;
        vec3 color;
        float intensity;
    };
    uniform DiffuseLight diffuseLights[2];
    uniform int diffuseCount;
    struct SpecularLight {
        vec3 position;
        vec3 color;
        float intensity;
        float shininess;
    };
    uniform SpecularLight specularLights[1];
    uniform int specularCount;
    
    vec3 computeLighting(vec3 vPosition, vec3 vNormal, mat4 vView) { // vPosition and vNormal expects camera space coordinates !!!!!!
        vec3 col = vec3(0.);
        
        // ambient lighting
        vec3 ambient = ambientLight.intensity * ambientLight.color;
        col += ambient;
        
        // diffuse lighting
        vec3 diffuse = vec3(0.);
        for (int i = 0; i < min(diffuseCount, diffuseLights.length()); i++) {
            DiffuseLight diffuseLight = diffuseLights[i];
            vec3 diffuseLightCamPos = (vView * vec4(diffuseLight.position, 1.)).xyz;
            float diffuseIntensity = clamp(dot(vNormal, normalize(diffuseLightCamPos - vPosition)), 0., 1.);
            diffuse += diffuseLight.color * diffuseLight.intensity * diffuseIntensity;
        }
        col += diffuse;
        
        // Phong specular lighting
        vec3 specular = vec3(0.);
        for (int i = 0; i < min(specularCount, specularLights.length()); i++) {
            SpecularLight specularLight = specularLights[i];
            vec3 specularLightCamPos = (vView * vec4(specularLight.position, 1.)).xyz;
            vec3 reflDir = reflect(normalize(vPosition - specularLightCamPos), vNormal);
            float specularIntensity = clamp(dot(reflDir, normalize(vec3(0.) - vPosition)), 0., 1.); // vec3(0.) - vPosition is the vector pointing from fragment position to the camera, since in camera space, vec3(0.) is the camera position (origin) !!!
            specularIntensity = pow(specularIntensity, specularLight.shininess);
            specular += specularLight.color * specularLight.intensity * specularIntensity;
        }
        col += specular;
        
        return col;
    }
`;

const vsNormal = `
    in vec3 position;
    in vec2 uv;
    in vec3 normal;
    
    out vec4 vWorldPos;
    out vec3 vNormal;
    
    uniform mat4 modelMatrix;
    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;
    
    void main() {
        
        vWorldPos = modelMatrix * vec4(position, 1.);
        vNormal = normal;
        
        // todo Steve new new: I think the broken depth comparison value might be b/c this ndc space transformation is non-linear, 
        //  but since in fragment shader the values can only be linearly interpolated, there's some discrepancies between different parts of the geometry
        //  the way to solve it is to pass out only the world position, and convert them into ndc space position in the final quad shader
        //  but this brings out another problem: since we can only pass out values in the range [0, 1], how can we pass out world space positions, which might be out of bound?
        //  can we set a const boundary value outside the shaders, and then divide / normalize all the position values using that bound, to force-bring everything into the [0, 1] range?
        //  further explore this idea !!!!!
        //  --> verified that this is the way to go.
                
        gl_Position = projectionMatrix * viewMatrix * vWorldPos;
    }
`;

const fsNormal = `
    precision highp float;
    precision highp int;
    
    layout(location = 0) out vec4 color;
    layout(location = 1) out vec4 worldPos;
    
    in vec4 vWorldPos;
    in vec3 vNormal;
    
    uniform mat4 modelMatrix;
    uniform mat4 viewMatrix;
    
    ${commonShader}
    ${commonShaderLighting}
    
    void main() {
        vec3 vCamPos = (viewMatrix * vWorldPos).xyz;
        vec3 vNormal = normalize(inverse(transpose(mat3(viewMatrix * modelMatrix))) * vNormal);

        vec3 col = computeLighting(vCamPos, vNormal, viewMatrix);
        col *= uObjectColor;
        float alpha = 1.;
        color = vec4(col, alpha);
        
        vec3 worldPosColor = vWorldPos.xyz;
        float worldPosAlpha = 1.;
        worldPos = vec4(worldPosColor, worldPosAlpha);
    }
`;

const fsNormalLine = fsNormal.replace(
    `in vec3 vNormal;`,
    `in vec3 vNormal;
    in vec2 vUv;`
).replace(
    `vec3 col = computeLighting(vCamPos, vNormal, viewMatrix);
        col *= uObjectColor;`,
    `
    float d = length(vWorldPos.xyz);
    d = clamp(d / 15., 0., 1.);
    vec3 col = mix(uObjectColor, vec3(221./255., 227./255., 233./255.), d);
    `
);


const vsSDF = `
    in vec3 position;
    in vec2 uv;
    
    out vec2 vUv;
    out mat4 vView;
    out mat4 vProj;
    
    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;
    
    void main() {
        vUv = uv;
        vView = viewMatrix;
        vProj = projectionMatrix;
        
        gl_Position = vec4(position, 1.);
    }
`;

let ids = [];
function uuid() {
    let id = Date.now().toString();
    // all the nodes with the same time stamp
    let dups = ids.filter((existingId) => {
        return existingId.includes(id);
    })
    if (dups.length === 0) {
        id = 'sdf_' + id;
        ids.push(id);
        return id;
    } else {
        id = 'sdf_' + id + '_' + dups.length;
        ids.push(id);
        return id;
    }
}
function hashCode(s) {
    return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
}
function hashToRgb(hashCode) {
    // Ensure the hash code is within the 32-bit integer range
    hashCode = hashCode >>> 0;

    // Extract the red, green, and blue components from the hash code
    let r = (hashCode >> 16) & 0xFF;
    let g = (hashCode >> 8) & 0xFF;
    let b = hashCode & 0xFF;

    r = Math.sin(r) * Math.cos(hashCode);
    g = Math.sin(g) * Math.sin(hashCode);
    b = Math.sin(b) * Math.sin(hashCode) * Math.cos(hashCode);

    r = Math.abs(r);
    g = Math.abs(g);
    b = Math.abs(b);

    // return new THREE.Vector3(r / 255, g / 255, b / 255);
    return new THREE.Vector3(r, g, b);
}
function getIdColor(id) {
    let trimmedId = id.split('sdf_')[1];
    let hash = Math.abs(hashCode(trimmedId));
    return hashToRgb(hash);
}

function addSDFObject(options) {
    let id = uuid();
    let newObject = null;
    switch (options.type) {
        case 'box':
            newObject = {
                id: id,
                type: 'box',
                size: options.size.clone(),
                position: options.position.clone(),
                rotation: new THREE.Euler(0, 0, 0),
                quaternion: new THREE.Quaternion(0, 0, 0, 1),
                scale: new THREE.Vector3(1, 1, 1),
                smoothBlend: 0.5,
                operation: 'union',
                color: options.color.clone(),
                idColor: getIdColor(id),
            };
            sdfObjects[id] = newObject;
            break;
        case 'sphere':
            newObject = {
                id: id,
                type: 'sphere',
                size: options.size.clone(),
                position: options.position.clone(),
                rotation: new THREE.Euler(0, 0, 0),
                quaternion: new THREE.Quaternion(0, 0, 0, 1),
                scale: new THREE.Vector3(1, 1, 1),
                smoothBlend: 0.5,
                operation: 'union',
                color: options.color.clone(),
                idColor: getIdColor(id),
            };
            sdfObjects[id] = newObject;
            break;
        default:
            break;
    }
    return newObject;
}

function deleteSDFObject(id) {
    delete sdfObjects[id];
}

let sdfObjects = {

};
window.sdfObjects = sdfObjects;

function updateSDFShaderString() {
    sdfShaderString = '';
    for (let [id, object] of Object.entries(sdfObjects)) {
        sdfShaderString += `
            vec3 sizeObj${id} = vec3(${object.size.x}, ${object.size.y}, ${object.size.z});
            vec3 cObj${id} = vec3(${object.color.x}, ${object.color.y}, ${object.color.z});
            vec3 iObj${id} = vec3(${object.idColor.x}, ${object.idColor.y}, ${object.idColor.z});
            
            bool isMouseHit${id} = checkMouseHitSelect(iObj${id}, uTempColor);
            vec3 pObj${id} = isMouseHit${id} ? uTempPosition : vec3(${object.position.x}, ${object.position.y}, ${object.position.z});
            vec3 sObj${id} = isMouseHit${id} ? uTempScale : vec3(${object.scale.x}, ${object.scale.y}, ${object.scale.z});
            
            // dealing with rotation & position
            vec3 pfObj${id} = p - pObj${id};
            float qx${id} = 0., qy${id} = 0., qz${id} = 0., qw${id} = 1.;
            if (!isMouseHit${id}) { // not selected
                qx${id} = float(${object.quaternion.x});
                qy${id} = float(${object.quaternion.y});
                qz${id} = float(${object.quaternion.z});
                qw${id} = float(${object.quaternion.w});
            } else {
                qx${id} = float(uTempQuaternion.x);
                qy${id} = float(uTempQuaternion.y);
                qz${id} = float(uTempQuaternion.z);
                qw${id} = float(uTempQuaternion.w);
            }
            float ql${id} = length(vec4(qx${id},qy${id},qz${id},qw${id}));
            qx${id} /= ql${id};
            qy${id} /= ql${id};
            qz${id} /= ql${id};
            qw${id} /= ql${id};
            float qx2${id} = qx${id}*qx${id};
            float qy2${id} = qy${id}*qy${id};
            float qz2${id} = qz${id}*qz${id};
            float qw2${id} = qw${id}*qw${id};
            mat3 rot${id} = mat3(
                1.-2.*qy2${id}-2.*qz2${id}, 2.*qx${id}*qy${id} - 2.*qz${id}*qw${id},  2.*qx${id}*qz${id} + 2.*qy${id}*qw${id},
                2.*qx${id}*qy${id} + 2.*qz${id}*qw${id}, 1. - 2.*qx2${id} - 2.*qz2${id}, 2.*qy${id}*qz${id} - 2.*qx${id}*qw${id},
                2.*qx${id}*qz${id} - 2.*qy${id}*qw${id}, 2.*qy${id}*qz${id} + 2.*qx${id}*qw${id}, 1. - 2.*qx2${id} - 2.*qy2${id}
            );
            pfObj${id} = rot${id} * pfObj${id};
            
            // dealing with scale, note that it's applied AFTER the rotation, which means we won't be changing the intuitive axes when scaling after applying some rotation
            vec3 sfObj${id} = sizeObj${id} * sObj${id};
        `;
        switch (object.type) {
            case 'box':
                sdfShaderString += `
                    HitInfo hObj${id} = sdBox(pfObj${id}, sfObj${id}, cObj${id}, iObj${id});
                `;
                break;
            case 'sphere':
                sdfShaderString += `
                    HitInfo hObj${id} = sdSphere(pfObj${id}, sfObj${id}.x, cObj${id}, iObj${id});
                `;
                break;
            default:
                break;
        }
        switch (object.operation) {
            case 'union':
                sdfShaderString += `
                    hScene = opSmoothUnion(hScene, hObj${id}, float(${object.smoothBlend}));
                `;
                break;
            case 'subtraction':
                sdfShaderString += `
                    hScene = opSmoothSubtraction(hScene, hObj${id}, float(${object.smoothBlend}));
                `;
                break;
            case 'intersection':
                sdfShaderString += `
                    hScene = opSmoothIntersection(hScene, hObj${id}, float(${object.smoothBlend}));
                `;
                break;
            default:
                break;
        }
    }
    getFsSDF();
}

let sdfShaderString = `
    // examples
    // vec3 pObj = vec3(0.);
    // HitInfo hBox = sdBox(p - pObj, vec3(0.5), 1.);
    // hScene = opUnion(hScene, hBox);
    //
    // vec3 pObj2 = vec3(-0.3, 0.3, 0.3);
    // HitInfo hBox2 = sdBox(p - pObj2, vec3(0.5), 2.);
    // hScene = opUnion(hScene, hBox2);
`;

function getCommonSDF() {
    return `
    struct HitInfo {
        float d;
        vec3 color;
        vec3 idColor;
    };
    
    HitInfo sdBlob( vec3 p, float s, float offset, vec3 color, vec3 idColor ) {
        float displacement = pow(perlin(vec2(sin(p.y * 2.3), cos((p.x + p.z) / 2. * 1.2) * 0.2) * 0.5 + uTime * 0.03 + offset * 10.), 2.) * 1. * s;
        float r = s + displacement;
        
        float d = length(p)-r;
        return HitInfo(d, color, idColor);
    }
    
    HitInfo sdSphere( vec3 p, float s, vec3 color, vec3 idColor )
    {
        float d = length(p)-s;
        return HitInfo(d, color, idColor);
    }
    
    HitInfo sdBox( vec3 p, vec3 b, vec3 color, vec3 idColor )
    {
      vec3 q = abs(p) - b;
      float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
      return HitInfo(d, color, idColor);
    }
    
    HitInfo sdCappedCone( vec3 p, float h, float r1, float r2, vec3 color, vec3 idColor )
    {
      vec2 q = vec2( length(p.xz), p.y );
      vec2 k1 = vec2(r2,h);
      vec2 k2 = vec2(r2-r1,2.0*h);
      vec2 ca = vec2(q.x-min(q.x,(q.y<0.0)?r1:r2), abs(q.y)-h);
      vec2 cb = q - k1 + k2*clamp( dot(k1-q,k2)/dot2(k2), 0.0, 1.0 );
      float s = (cb.x<0.0 && ca.y<0.0) ? -1.0 : 1.0;
      float d = s*sqrt( min(dot2(ca),dot2(cb)) );
      return HitInfo(d, color, idColor);
    }
    
    HitInfo sdGround(vec3 p, vec3 color, vec3 idColor) {
        float d = p.y;
        return HitInfo(d, color, idColor);
    }
    
    float opSmoothUnion_old( float d1, float d2, float k )
    {
        float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
        return mix( d2, d1, h ) - k*h*(1.0-h);
    }
    
    float opSmoothSubtraction_old( float d1, float d2, float k )
    {
        float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );
        return mix( d2, -d1, h ) + k*h*(1.0-h);
    }
    
    float opSmoothIntersection_old( float d1, float d2, float k )
    {
        float h = clamp( 0.5 - 0.5*(d2-d1)/k, 0.0, 1.0 );
        return mix( d2, d1, h ) + k*h*(1.0-h);
    }
    
    HitInfo opUnion(HitInfo ha, HitInfo hb) {
        // return min(ha.d, hb.d);
        if (ha.d <= hb.d) {
            return HitInfo(ha.d, ha.color, ha.idColor);
        } else {
            return HitInfo(hb.d, hb.color, hb.idColor);
        }
    }
    
    HitInfo opSmoothUnion(HitInfo ha, HitInfo hb, float k) {
        vec4 d1 = vec4(ha.color, ha.d);
        vec4 d2 = vec4(hb.color, hb.d);
        float h = clamp( 0.5 + 0.5*(d2.w-d1.w)/k, 0.0, 1.0 );
        vec4 res = mix( d2, d1, h ) - vec4(0.,0.,0.,k*h*(1.0-h));
        
        vec3 idColor = ha.d <= hb.d ? ha.idColor : hb.idColor; // todo Steve: figure out why idColor displays the same as color. It's supposed to be the hard-union without any smoothness. But somehow idColor for the 3 smooth functions is NOT correct. They disappear from the screen. The whole point of having idColor is that they represent the true position of the SDF objects, no matter what operation / smoothBlend value they have. Figure out what went wrong.
        return HitInfo(res.w, res.xyz, idColor);
    }
    
    HitInfo opSmoothSubtraction(HitInfo ha, HitInfo hb, float k) {
        vec4 d1 = vec4(ha.color, ha.d);
        vec4 d2 = vec4(hb.color, hb.d);
        float h = clamp( 0.5 - 0.5*(d2.w+d1.w)/k, 0.0, 1.0 );
        // vec4 res = mix( d2, -d1, h ) + vec4(0.,0.,0.,k*h*(1.0-h));
        vec4 res = mix( d2, vec4(d1.rgb, -d1.w), h ) + vec4(0.,0.,0.,k*h*(1.0-h)); // make the color the same, but the distance flipped
        
        vec3 idColor = ha.d <= hb.d ? ha.idColor : hb.idColor;
        return HitInfo(res.w, res.xyz, idColor);
    }
    
    HitInfo opSmoothIntersection(HitInfo ha, HitInfo hb, float k) {
        vec4 d1 = vec4(ha.color, ha.d);
        vec4 d2 = vec4(hb.color, hb.d);
        float h = clamp( 0.5 - 0.5*(d2.w-d1.w)/k, 0.0, 1.0 );
        vec4 res = mix( d2, d1, h ) + vec4(0.,0.,0.,k*h*(1.0-h));
        
        vec3 idColor = ha.d <= hb.d ? ha.idColor : hb.idColor;
        return HitInfo(res.w, res.xyz, idColor);
    }
    
    HitInfo GetDist(vec3 p) {
        HitInfo hScene = HitInfo(MAX_DIST, vec3(0.), vec3(0.)); // hitting nothing will return MAX_DIST (camera far plane), color === black, idColor === black
        
        ${sdfShaderString}
        
        return hScene;
    }
    
    vec3 GetNormal(vec3 p) {
        // turns out the weird shading issue on the box was caused by GetNormal e being relatively too large for the size of my cube (my spheres has radius sphereRadius, while originally e was vec2(0.01, 0.). It doesn't have enough accuracy.
        vec2 e = vec2(0.001, 0.);
        float d0 = GetDist(p).d;
        
        float d1 = GetDist(p - e.xyy).d;
        float d2 = GetDist(p - e.yxy).d;
        float d3 = GetDist(p - e.yyx).d;
        
        vec3 n = d0 - vec3(d1, d2, d3);
        return normalize(n);
    }
    
    // make a light above the sphere
    vec3 lightPos = vec3(2, 5, 1);
    
    float GetLight(vec3 p) {
        //lightPos.xz = vec2(sin(iTime*2.), cos(iTime*2.)) * 5.;
        vec3 lv = normalize(lightPos - p);
        vec3 nv = GetNormal(p);
        float rawLight = dot(lv, nv);
        float finalLight = clamp(rawLight, 0., 1.);
        return finalLight;
    }
    
    HitInfo RayMarch(vec3 ro, vec3 rd) {
        HitInfo h0 = HitInfo(0., vec3(0.), vec3(0.));
        for (int i = 0; i < MAX_STEP; i++) {
            vec3 p = ro + rd * h0.d;
            HitInfo hs = GetDist(p);
            h0.d += hs.d;
            h0.idColor = hs.idColor;
            h0.color = hs.color;
            if (hs.d < SURF_DIST || h0.d > MAX_DIST) break;
        }
        return h0;
    }
    
    float GetShadow(vec3 p) {
        vec3 rd = normalize(lightPos - p);
        vec3 pOffset = p + GetNormal(p) * SURF_DIST * 2.;
        float ds = RayMarch(pOffset, rd).d;
        float dl = length(p - lightPos);
        if (ds < dl) {
            return 0.1;
        } else {
            return 1.;
        }
    }
    
    // input camera direction & uv, output camera ray direction
    vec3 makeCamera(vec3 lookAtDir, vec2 uv) {
        uv -= 0.5;
        vec2 nearPlaneOffset = uv * uCameraNearSize;
        
        vec3 fVect = normalize(lookAtDir);
        vec3 rVect = normalize(cross(vec3(0., 1., 0.), fVect));
        vec3 uVect = normalize(cross(fVect, rVect));
        
        vec3 rd = normalize(-nearPlaneOffset.x * rVect + nearPlaneOffset.y * uVect + uCameraNear * fVect);
        return rd;
    }
`;
}

// todo Steve: MAX_DIST must be the same as camera's far plane, in order to return the correct depth value, b/c
//  it maps camera's [near plane, far plane] distance to gl_FragCoord.z [0, 1]

function getFsSDF() {
    return `
    precision highp float;
    precision highp int;

    #define MAX_STEP 100
    #define SURF_DIST 0.001
    #define MAX_DIST 100.
    #define PI 3.14159
    #define backgroundColor vec3(1., 169./256., 20./256.)
    
    layout(location = 0) out vec4 idColor;
    layout(location = 1) out vec4 worldPos;
    layout(location = 2) out vec4 color;
    
    // camera configurations
    uniform float camera_aspect_ratio;
    uniform float camera_fov;
    uniform vec3 camera_position;
    uniform vec3 camera_direction;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform vec2 uCameraNearSize;
    
    // animation related
    uniform float uTime;
    
    // mouse picking related
    uniform vec3 uMouseColor;
    uniform vec3 uTempColor;
    uniform vec3 uTempPosition;
    uniform int uTempRotationAxis;
    uniform float uTempRotationAngle;
    uniform vec4 uTempQuaternion;
    uniform vec3 uTempScale;
    
    in vec2 vUv;
    in mat4 vView;
    in mat4 vProj;
    
    bool checkMouseHitHighlight(vec3 idColor, vec3 mouseColor) {
        return distance(idColor, mouseColor) < ${mouseColorAndSDFIdColorCollideThrehold};
    }
    
    bool checkMouseHitSelect(vec3 idColor, vec3 tempColor) {
        return distance(idColor, tempColor) < ${mouseColorAndSDFIdColorCollideThrehold};
    }
    
    ${commonShader}
    ${commonShaderLighting}
    ${getCommonSDF()}
    
    void main()
    {
        vec2 uv = vUv; // uv.y range [-1., 1.]
        
        vec3 ro = camera_position; // world space camera position
        vec3 rd = makeCamera(camera_direction, uv); // world space camera ray direction
        
        HitInfo hit = RayMarch(ro, rd); // world space distance from camera, should be the same as camera space distance from camera
        if (hit.d > MAX_DIST) {
            color = vec4(0., 0., 0., 1.);
            worldPos = vec4(0.);
            idColor = vec4(0., 0., 0., 1.);
        } else {
            vec3 p = ro + rd * hit.d; // world space intersection point position
            // float ambient = 0.05;
            // float l = GetLight(p) * GetShadow(p) + ambient;
            // l = clamp(l, 0., 1.);
            // vec3 lum = vec3(l);
            // color = vec4(0.);
            // color.rgb += lum;
            
            vec3 vCamPos = (vView * vec4(p, 1.)).xyz; // convert both position and normal into camera space, and then feed into computeLighting()
            vec3 vNormal = normalize(inverse(transpose(mat3(vView))) * GetNormal(p));
            vec3 col = computeLighting(vCamPos, vNormal, vView);
            col *= hit.color;
            
            // check mouse hit
            vec3 n = GetNormal(p);
            float rim = abs(dot(rd, n));
            rim = 1. / rim;
            // col = checkMouseHitHighlight(hit.idColor, uMouseColor) ? col * rim : col;
            col = checkMouseHitSelect(hit.idColor, uTempColor) ? col * rim : col;

            
            // color += diffuse * rim;
            // color = diffuse;
            
            color = vec4(0.);
            color.rgb = col;
            color.a = 1.;
            
            worldPos = vec4(p, 1.);
            
            idColor = vec4(hit.idColor, 1.);
        }
    }
`;
}

const vsFinal = `
    varying vec2 vUv;
    varying mat4 vView;
    
    void main() {
        vUv = uv;
        vView = viewMatrix;
        gl_Position = vec4(position, 1.);
    }
`

const fsFinal = `
    varying vec2 vUv;
    varying mat4 vView;
    
    uniform sampler2D tColorNormal;
    uniform sampler2D tWorldPosNormal;
    uniform sampler2D tColorSDF;
    uniform sampler2D tWorldPosSDF;
    uniform sampler2D tIdSDF;
    
    uniform vec3 camera_position;
    uniform vec3 background_color;
    
    ${commonShader}
    
    void main() {
        vec4 colorNormal = texture( tColorNormal, vUv );
        vec4 worldPosNormal = texture( tWorldPosNormal, vUv );
        vec4 colorSDF = texture( tColorSDF, vUv );
        vec4 worldPosSDF = texture( tWorldPosSDF, vUv );
        vec4 idSDF = texture( tIdSDF, vUv );
        
        vec3 color = vec3(0.);
        
        float disNormal = distance(worldPosNormal.xyz, camera_position);
        float disSDF = distance(worldPosSDF.xyz, camera_position);
        
        bool isOutsideSDF = worldPosSDF.w == 0.;
        // bool isOutsideNormal = worldPosNormal.x == -150. && worldPosNormal.y == -150. && worldPosNormal.z == -150.;
        bool isOutsideNormal = worldPosNormal.x == 0. && worldPosNormal.y == 0. && worldPosNormal.z == 0.; // if there's no fragment at that location, that worldPos pixel color is (0., 0., 0.)
        
        if (isOutsideSDF && isOutsideNormal) {
            // color = vec3(0.);
            color = background_color;
        } else if (!isOutsideSDF && !isOutsideNormal) {
            color = (disNormal < disSDF) ? colorNormal.xyz : colorSDF.xyz;
        } else if (!isOutsideSDF) {
            color = colorSDF.xyz;
        } else if (!isOutsideNormal) {
            color = vec3(0., 0., 1.);
            color = colorNormal.xyz;
        }
        
        gl_FragColor = vec4(color, 1.);
    }
`;

const vsDummyMesh = `
    void main() {
        mat4 modelMatrixButOnlyTranslate = mat4(
            1., 0., 0., modelMatrix[3][0],
            0., 1., 0., modelMatrix[3][1],
            0., 0., 1., modelMatrix[3][2],
            0., 0., 0., 1.
        );
        vec3 modelPosition = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        // gl_Position = projectionMatrix * viewMatrix * modelMatrixButOnlyTranslate * vec4(position, 1.); // for some reason, this doesn't work......
        gl_Position = projectionMatrix * viewMatrix * vec4(position + modelPosition, 1.);
    }
`;

const fsDummyMesh = `
    void main() {
        gl_FragColor = vec4(0., 1., 1., 1.);
    }
`;

export { vsNormal, fsNormal, fsNormalLine, vsSDF, getFsSDF, vsFinal, fsFinal, vsDummyMesh, fsDummyMesh, addSDFObject, deleteSDFObject, updateSDFShaderString };